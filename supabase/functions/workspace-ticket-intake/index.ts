import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MAX_BODY_BYTES = 32 * 1024;
const responseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "Método no permitido" }, 405);
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json")
    return json({ error: "Contenido inválido" }, 415);

  const secret = request.headers.get("x-ticket-webhook-secret") || "";
  const projectId = request.headers.get("x-ticket-project-id") || "";
  if (!secret || secret.length > 512 || !projectId)
    return json({ error: "No autorizado" }, 401);

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES)
    return json({ error: "Solicitud demasiado grande" }, 413);

  let ticket: unknown;
  try {
    ticket = JSON.parse(body);
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey)
    return json({ error: "Servicio no configurado" }, 503);

  const result = await fetch(
    `${supabaseUrl}/rest/v1/rpc/ingest_workspace_ticket`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_secret: secret,
        p_project_id: projectId,
        p_ticket: ticket,
      }),
    },
  );

  if (!result.ok) {
    console.error("Ticket RPC rejected", result.status);
    return json({ error: "No fue posible procesar el ticket" }, 403);
  }

  return json({ ok: true, taskId: await result.json() });
});
