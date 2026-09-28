import {
  MAX_PHOTO_BYTES,
  MAX_PDF_BYTES,
  isPdfMimeType,
  isPhotoMimeType,
  startDriveFileUpload,
  type DriveFileCategory,
} from "../../../../lib/google-drive";
import {
  allowRequest,
  cleanUntrustedText,
  isUuid,
  noStoreJson,
  readLimitedJson,
} from "../../../../lib/security";
import { authenticateRequest } from "../../../../lib/supabase-server";

type UploadRequest = {
  category?: DriveFileCategory;
  subjectId?: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (!allowRequest(`drive-upload:${auth.user.id}`, 30, 10 * 60_000))
    return noStoreJson({ error: "Demasiadas cargas en poco tiempo" }, 429);

  const parsed = await readLimitedJson<UploadRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const category = body.category;
  const subjectId = body.subjectId;
  const size = Number(body.size);
  const name = cleanUntrustedText(body.name, 180);
  const mimeType = body.mimeType || "";
  const requestUrl = new URL(request.url);
  const browserOrigin = request.headers.get("origin") || requestUrl.origin;

  if (browserOrigin !== requestUrl.origin)
    return noStoreJson({ error: "Origen no autorizado" }, 403);

  const isPhoto =
    category === "avatar" ||
    category === "project-image" ||
    category === "comment-image";
  const isMinutePdf = category === "minute-pdf";
  const validType = isMinutePdf
    ? isPdfMimeType(mimeType)
    : isPhoto && isPhotoMimeType(mimeType);
  const maximumBytes = isMinutePdf ? MAX_PDF_BYTES : MAX_PHOTO_BYTES;
  if (
    (!isPhoto && !isMinutePdf) ||
    !isUuid(subjectId) ||
    !name ||
    !validType ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > maximumBytes
  )
    return noStoreJson({ error: "Archivo inválido o mayor de 50 MB" }, 400);

  if (category === "avatar" && subjectId !== auth.user.id)
    return noStoreJson({ error: "No puedes cambiar el perfil de otra persona" }, 403);

  if (category === "project-image") {
    const { data: project } = await auth.client
      .from("projects")
      .select("id,owner_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (!project || project.owner_id !== auth.user.id)
      return noStoreJson({ error: "No puedes editar este proyecto" }, 403);
  }

  if (category === "minute-pdf") {
    const { data: minute } = await auth.client
      .from("project_minutes")
      .select("id")
      .eq("id", subjectId)
      .maybeSingle();
    if (!minute)
      return noStoreJson({ error: "No puedes adjuntar archivos a esta minuta" }, 403);
  }

  if (category === "comment-image") {
    const { data: comment } = await auth.client
      .from("comments")
      .select("id,author_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (!comment || comment.author_id !== auth.user.id)
      return noStoreJson(
        { error: "No puedes adjuntar imágenes a este comentario" },
        403,
      );
  }

  try {
    const uploadUrl = await startDriveFileUpload({
      category,
      subjectId,
      uploadedBy: auth.user.id,
      originalName: name,
      mimeType,
      size,
      origin: browserOrigin,
    });
    return noStoreJson({ uploadUrl });
  } catch {
    return noStoreJson({ error: "Google Drive no está disponible" }, 503);
  }
}
