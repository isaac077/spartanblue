import { getDriveStorageQuota } from "../../../../lib/google-drive";
import { allowRequest, noStoreJson } from "../../../../lib/security";
import { authenticateRequest } from "../../../../lib/supabase-server";

const ISAAC_EMAIL = "malondra1508@gmail.com";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if ((auth.user.email || "").trim().toLowerCase() !== ISAAC_EMAIL)
    return noStoreJson({ error: "No autorizado" }, 403);
  if (!allowRequest(`drive-quota:${auth.user.id}`, 30, 10 * 60_000))
    return noStoreJson({ error: "Intenta nuevamente en unos minutos" }, 429);

  try {
    return noStoreJson(await getDriveStorageQuota());
  } catch {
    return noStoreJson({ error: "No pudimos consultar el espacio disponible" }, 503);
  }
}
