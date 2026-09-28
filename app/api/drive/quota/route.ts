import { getDriveStorageQuota } from "../../../../lib/google-drive";
import { allowRequest, noStoreJson } from "../../../../lib/security";
import { authenticateRequest } from "../../../../lib/supabase-server";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (!allowRequest(`drive-quota:${auth.user.id}`, 30, 10 * 60_000))
    return noStoreJson({ error: "Intenta nuevamente en unos minutos" }, 429);

  try {
    return noStoreJson(await getDriveStorageQuota());
  } catch {
    return noStoreJson({ error: "No pudimos consultar el espacio disponible" }, 503);
  }
}
