import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { noStoreJson } from "./security";

type AuthenticatedRequest =
  | { ok: true; client: SupabaseClient; user: User }
  | { ok: false; response: ReturnType<typeof noStoreJson> };

export async function authenticateRequest(
  request: Request,
): Promise<AuthenticatedRequest> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!token || token.length > 4096)
    return { ok: false, response: noStoreJson({ error: "No autorizado" }, 401) };
  if (!supabaseUrl || !supabaseKey)
    return {
      ok: false,
      response: noStoreJson({ error: "La autenticación no está configurada" }, 503),
    };

  const client = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    return { ok: false, response: noStoreJson({ error: "Sesión inválida" }, 401) };
  return { ok: true, client, user: data.user };
}
