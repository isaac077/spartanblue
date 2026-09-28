import {
  allowRequest,
  cleanUntrustedText,
  isUuid,
  noStoreJson,
  readLimitedJson,
} from "../../../../lib/security";
import { authenticateRequest } from "../../../../lib/supabase-server";

export const runtime = "nodejs";

const DEFAULT_TICKET_SERVICE_URL = "";

type ResolveTicketRequest = {
  taskId?: unknown;
  resolution?: unknown;
};

type TicketServiceResponse = {
  ok?: boolean;
  error?: unknown;
};

function ticketServiceUrl() {
  const configured = process.env.TICKET_SERVICE_URL || DEFAULT_TICKET_SERVICE_URL;
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.google.com" ||
      url.username ||
      url.password ||
      !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)
    )
      return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (!allowRequest(`ticket-resolution:${auth.user.id}`, 20, 10 * 60_000))
    return noStoreJson(
      { error: "Hay demasiadas resoluciones en proceso. Espera un momento." },
      429,
    );

  const parsed = await readLimitedJson<ResolveTicketRequest>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const taskId = parsed.value.taskId;
  const resolution = cleanUntrustedText(parsed.value.resolution, 10_000);
  if (!isUuid(taskId))
    return noStoreJson({ error: "La tarea no es válida" }, 400);
  if (resolution.length < 3)
    return noStoreJson(
      { error: "Escribe la resolución que recibirá el solicitante." },
      400,
    );

  const secret = process.env.TICKET_WEBHOOK_SECRET || "";
  const serviceUrl = ticketServiceUrl();
  if (!secret || !serviceUrl)
    return noStoreJson(
      { error: "La conexión con la Mesa de tickets no está configurada." },
      503,
    );

  const { data: task, error: taskError } = await auth.client
    .from("tasks")
    .select("id,title,status,external_source,external_id,project_id")
    .eq("id", taskId)
    .single();
  if (taskError || !task)
    return noStoreJson({ error: "No se encontró el ticket." }, 404);
  if (task.external_source !== "ticket_system" || !task.external_id)
    return noStoreJson({ error: "Esta tarea no proviene de la Mesa de tickets." }, 400);
  if (task.status === "done")
    return noStoreJson({ error: "Este ticket ya está resuelto." }, 409);

  const actorName = cleanUntrustedText(
    auth.user.user_metadata?.full_name || auth.user.email || "Workspace",
    120,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resolveWorkspaceTicket",
        secret,
        ticketId: task.external_id,
        resolution,
        actorName,
      }),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    const raw = await response.text();
    let serviceResult: TicketServiceResponse = {};
    try {
      serviceResult = JSON.parse(raw) as TicketServiceResponse;
    } catch {
      serviceResult = {};
    }
    if (!response.ok || serviceResult.ok !== true) {
      const serviceError = cleanUntrustedText(serviceResult.error, 300);
      return noStoreJson(
        {
          error:
            serviceError ||
            "La Mesa de tickets no aceptó la resolución. El ticket sigue abierto.",
        },
        502,
      );
    }

    const { data: updated, error: updateError } = await auth.client
      .from("tasks")
      .update({ status: "done" })
      .eq("id", taskId)
      .select("updated_at")
      .single();
    if (updateError || !updated)
      return noStoreJson(
        {
          error:
            "La resolución fue aceptada, pero no pudimos actualizar el Workspace. Intenta de nuevo; el correo no se duplicará.",
        },
        502,
      );

    return noStoreJson({ ok: true, updatedAt: updated.updated_at });
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "La Mesa de tickets tardó demasiado. El ticket sigue abierto."
            : "No pudimos contactar la Mesa de tickets. El ticket sigue abierto.",
      },
      504,
    );
  } finally {
    clearTimeout(timeout);
  }
}
