import {
  deleteDriveFile,
  getDriveAccessToken,
  getDriveFileMetadata,
  isDriveFileId,
  isPdfMimeType,
  isPhotoMimeType,
  MAX_PDF_BYTES,
  MAX_PHOTO_BYTES,
} from "../../../../../lib/google-drive";
import { isUuid, noStoreJson } from "../../../../../lib/security";
import { authenticateRequest } from "../../../../../lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

async function authorizeDriveFile(request: Request, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth;
  const { id } = await context.params;
  if (!isDriveFileId(id))
    return { ok: false as const, response: noStoreJson({ error: "Archivo inválido" }, 400) };

  try {
    const accessToken = await getDriveAccessToken();
    const metadata = await getDriveFileMetadata(id, accessToken);
    const properties = metadata.appProperties || {};
    if (
      metadata.trashed ||
      properties.source !== "spartanblue" ||
      !Number.isSafeInteger(Number(metadata.size)) ||
      Number(metadata.size) <= 0 ||
      !isUuid(properties.subjectId)
    )
      return { ok: false as const, response: noStoreJson({ error: "Archivo no encontrado" }, 404) };

    if (properties.category === "avatar") {
      if (
        !isPhotoMimeType(metadata.mimeType) ||
        Number(metadata.size) > MAX_PHOTO_BYTES
      )
        return { ok: false as const, response: noStoreJson({ error: "Archivo no encontrado" }, 404) };
      if (!properties.subjectId)
        return { ok: false as const, response: noStoreJson({ error: "Archivo no encontrado" }, 404) };
    } else if (properties.category === "project-image") {
      if (
        !isPhotoMimeType(metadata.mimeType) ||
        Number(metadata.size) > MAX_PHOTO_BYTES
      )
        return { ok: false as const, response: noStoreJson({ error: "Archivo no encontrado" }, 404) };
      const { data: project } = await auth.client
        .from("projects")
        .select("id,owner_id")
        .eq("id", properties.subjectId || "")
        .maybeSingle();
      if (!project)
        return { ok: false as const, response: noStoreJson({ error: "No autorizado" }, 403) };
    } else if (properties.category === "minute-pdf") {
      if (
        !isPdfMimeType(metadata.mimeType) ||
        Number(metadata.size) > MAX_PDF_BYTES
      )
        return { ok: false as const, response: noStoreJson({ error: "Archivo no encontrado" }, 404) };
      const { data: minute } = await auth.client
        .from("project_minutes")
        .select("id")
        .eq("id", properties.subjectId || "")
        .maybeSingle();
      if (!minute)
        return { ok: false as const, response: noStoreJson({ error: "No autorizado" }, 403) };
    } else if (properties.category === "comment-image") {
      if (
        !isPhotoMimeType(metadata.mimeType) ||
        Number(metadata.size) > MAX_PHOTO_BYTES
      )
        return { ok: false as const, response: noStoreJson({ error: "Archivo no encontrado" }, 404) };
      const { data: comment } = await auth.client
        .from("comments")
        .select("id")
        .eq("id", properties.subjectId || "")
        .maybeSingle();
      if (!comment)
        return { ok: false as const, response: noStoreJson({ error: "No autorizado" }, 403) };
    } else {
      return { ok: false as const, response: noStoreJson({ error: "Archivo no encontrado" }, 404) };
    }
    return { ...auth, id, metadata, properties, accessToken };
  } catch {
    return { ok: false as const, response: noStoreJson({ error: "Archivo no disponible" }, 503) };
  }
}

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizeDriveFile(request, context);
  if (!authorization.ok) return authorization.response;
  const range = request.headers.get("range");
  const upstream = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(authorization.id)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${authorization.accessToken}`,
        ...(range ? { Range: range } : {}),
      },
      cache: "no-store",
    },
  );
  if (!upstream.ok || !upstream.body)
    return noStoreJson({ error: "No se pudo abrir el archivo" }, upstream.status || 502);

  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Type": authorization.metadata.mimeType,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(authorization.metadata.name)}`,
    "X-Content-Type-Options": "nosniff",
  });
  for (const header of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizeDriveFile(request, context);
  if (!authorization.ok) return authorization.response;
  const subjectId = authorization.properties.subjectId || "";
  const category = authorization.properties.category;

  if (category === "avatar" && subjectId !== authorization.user.id)
    return noStoreJson({ error: "No autorizado" }, 403);
  if (category === "project-image") {
    const { data: project } = await authorization.client
      .from("projects")
      .select("owner_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (!project || project.owner_id !== authorization.user.id)
      return noStoreJson({ error: "No autorizado" }, 403);
  }
  if (category === "minute-pdf") {
    const { data: minute } = await authorization.client
      .from("project_minutes")
      .select("id")
      .eq("id", subjectId)
      .maybeSingle();
    if (!minute) return noStoreJson({ error: "No autorizado" }, 403);
  }
  if (category === "comment-image") {
    const { data: comment } = await authorization.client
      .from("comments")
      .select("id,author_id,task_id")
      .eq("id", subjectId)
      .maybeSingle();
    if (!comment) return noStoreJson({ error: "No autorizado" }, 403);
    if (comment.author_id !== authorization.user.id) {
      const { data: task } = await authorization.client
        .from("tasks")
        .select("project_id")
        .eq("id", comment.task_id)
        .maybeSingle();
      const { data: project } = task
        ? await authorization.client
            .from("projects")
            .select("owner_id")
            .eq("id", task.project_id)
            .maybeSingle()
        : { data: null };
      if (!project || project.owner_id !== authorization.user.id)
        return noStoreJson({ error: "No autorizado" }, 403);
    }
  }

  try {
    await deleteDriveFile(authorization.id, authorization.accessToken);
    return noStoreJson({ deleted: true });
  } catch {
    return noStoreJson({ error: "No se pudo eliminar el archivo" }, 502);
  }
}
