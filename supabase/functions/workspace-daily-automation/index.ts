import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

  const authorization = request.headers.get("authorization") || "";
  const secret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!secret || secret.length > 512)
    return json({ error: "No autorizado" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey)
    return json({ error: "Servicio no configurado" }, 503);

  const result = await fetch(
    `${supabaseUrl}/rest/v1/rpc/run_workspace_daily_automation`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_secret: secret }),
    },
  );

  if (!result.ok) {
    console.error("Daily automation RPC rejected", result.status);
    return json({ error: "No fue posible ejecutar la automatización" }, 403);
  }

  return json(await result.json());
});
