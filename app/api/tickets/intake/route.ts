import { timingSafeEqual } from "node:crypto";
import {
  allowRequest,
  allowedHttpsUrl,
  cleanUntrustedText,
  noStoreJson,
  readLimitedJson,
  requestClientKey,
} from "../../../../lib/security";

export const runtime = "nodejs";

type TicketPayload = {
  id?: unknown;
  folio?: unknown;
  subject?: unknown;
  description?: unknown;
  customerName?: unknown;
  company?: unknown;
  email?: unknown;
  phone?: unknown;
  area?: unknown;
  requestType?: unknown;
  priority?: unknown;
  requiredDate?: unknown;
  documentUrl?: unknown;
  adminUrl?: unknown;
};

function matchesSecret(received: string, expected: string) {
  if (received.length > 512 || expected.length > 512) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function cleanText(value: unknown, limit: number) {
  return cleanUntrustedText(value, limit);
}

function normalizeTicket(payload: TicketPayload) {
  return {
    id: cleanText(payload.id, 160),
    folio: cleanText(payload.folio, 80),
    subject: cleanText(payload.subject, 180),
    description: cleanText(payload.description, 10000),
    customerName: cleanText(payload.customerName, 180),
    company: cleanText(payload.company, 180),
    email: cleanText(payload.email, 320),
    phone: cleanText(payload.phone, 80),
    area: cleanText(payload.area, 120),
    requestType: cleanText(payload.requestType, 120),
    priority: cleanText(payload.priority, 40),
    requiredDate: cleanText(payload.requiredDate, 40),
    documentUrl: cleanText(payload.documentUrl, 1200),
    adminUrl: cleanText(payload.adminUrl, 1200),
  };
}

export async function POST(request: Request) {
  const webhookSecret = process.env.TICKET_WEBHOOK_SECRET || "";
  const projectId = process.env.TICKET_PROJECT_ID || "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const receivedSecret = request.headers.get("x-ticket-webhook-secret") || "";

  if (!webhookSecret || !projectId || !supabaseUrl || !supabaseKey)
    return noStoreJson(
      { error: "La integración de tickets no está configurada" },
      503,
    );

  const rateLimitKey = requestClientKey(request, "ticket-intake");
  if (!allowRequest(rateLimitKey, 60, 60_000))
    return noStoreJson({ error: "Demasiadas solicitudes" }, 429);

  if (!matchesSecret(receivedSecret, webhookSecret))
    return noStoreJson({ error: "No autorizado" }, 401);

  const parsed = await readLimitedJson<TicketPayload>(request, 32 * 1024);
  if (!parsed.ok) return parsed.response;
  const rawPayload = parsed.value;

  const ticket = normalizeTicket(rawPayload);
  const allowedOrigins = (
    process.env.TICKET_ALLOWED_URL_ORIGINS || "https://script.google.com"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const safeAdminUrl = allowedHttpsUrl(ticket.adminUrl, allowedOrigins);
  if (ticket.adminUrl && !safeAdminUrl)
    return noStoreJson({ error: "La URL administrativa no es válida" }, 400);
  ticket.adminUrl = safeAdminUrl;

  if (!ticket.id || !ticket.folio || !ticket.subject)
    return noStoreJson(
      { error: "Faltan el identificador, folio o asunto" },
      400,
    );

  const response = await fetch(
    `${supabaseUrl}/functions/v1/workspace-ticket-intake`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        "Content-Type": "application/json",
        "x-ticket-webhook-secret": webhookSecret,
        "x-ticket-project-id": projectId,
      },
      body: JSON.stringify(ticket),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error("Ticket intake failed", response.status, detail);
    return noStoreJson(
      { error: "No fue posible crear el to-do" },
      502,
    );
  }

  const result = (await response.json()) as { taskId?: string };
  return noStoreJson({ ok: true, taskId: result.taskId });
}
