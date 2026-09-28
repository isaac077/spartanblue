import { timingSafeEqual } from "node:crypto";
import { noStoreJson } from "../../../../lib/security";

export const runtime = "nodejs";
export const maxDuration = 30;

function matchesSecret(received: string, expected: string) {
  if (received.length > 512 || expected.length > 512) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET || "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const authorization = request.headers.get("authorization") || "";
  const receivedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!cronSecret || !supabaseUrl || !supabaseKey)
    return noStoreJson(
      { error: "La automatización no está configurada" },
      503,
    );

  if (!matchesSecret(receivedSecret, cronSecret))
    return noStoreJson({ error: "No autorizado" }, 401);

  const response = await fetch(
    `${supabaseUrl}/functions/v1/workspace-daily-automation`,
    {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error("Daily workspace automation failed", response.status, detail);
    return noStoreJson(
      { error: "No fue posible generar los recordatorios" },
      502,
    );
  }

  return noStoreJson(await response.json());
}
