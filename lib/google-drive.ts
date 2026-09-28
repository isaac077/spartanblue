import "server-only";
import { getGoogleWorkspaceAccessToken } from "./google-auth";

export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const DRIVE_REFERENCE_PREFIX = "gdrive:";

export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type DrivePhotoCategory = "avatar" | "project-image" | "comment-image";
export type DriveFileCategory = DrivePhotoCategory | "minute-pdf";

export type DriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  trashed?: boolean;
  appProperties?: Record<string, string>;
};

export type DriveStorageQuota = {
  limit: number | null;
  usage: number;
  usageInDrive: number;
  remaining: number | null;
};

function driveFolderId() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  if (!folderId)
    throw new Error("Google Drive no está configurado");
  return folderId;
}

export function driveFileId(reference?: string | null) {
  if (!reference?.startsWith(DRIVE_REFERENCE_PREFIX)) return null;
  const id = reference.slice(DRIVE_REFERENCE_PREFIX.length);
  return isDriveFileId(id) ? id : null;
}

export function isDriveFileId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 10 &&
    value.length <= 200 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function isPhotoMimeType(value: unknown): value is (typeof PHOTO_MIME_TYPES)[number] {
  return typeof value === "string" && PHOTO_MIME_TYPES.includes(value as never);
}

export function isPdfMimeType(value: unknown): value is "application/pdf" {
  return value === "application/pdf";
}

export async function getDriveAccessToken() {
  return getGoogleWorkspaceAccessToken();
}

export async function getDriveStorageQuota(): Promise<DriveStorageQuota> {
  const accessToken = await getDriveAccessToken();
  const fields = "storageQuota(limit,usage,usageInDrive)";
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/about?fields=${encodeURIComponent(fields)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("No se pudo consultar el espacio de Google Drive");
  const body = (await response.json()) as {
    storageQuota?: { limit?: string; usage?: string; usageInDrive?: string };
  };
  const usage = Number(body.storageQuota?.usage || 0);
  const usageInDrive = Number(body.storageQuota?.usageInDrive || 0);
  const rawLimit = body.storageQuota?.limit;
  const limit = rawLimit ? Number(rawLimit) : null;
  if (
    !Number.isSafeInteger(usage) ||
    usage < 0 ||
    !Number.isSafeInteger(usageInDrive) ||
    usageInDrive < 0 ||
    (limit !== null && (!Number.isSafeInteger(limit) || limit <= 0))
  )
    throw new Error("Google Drive devolvió una cuota inválida");
  return {
    limit,
    usage,
    usageInDrive,
    remaining: limit === null ? null : Math.max(0, limit - usage),
  };
}

function safeDriveName(value: string) {
  const cleaned = Array.from(value.normalize("NFKC"))
    .filter((character) => {
      const codePoint = character.codePointAt(0) || 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("")
    .replace(/[/\\]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "foto";
}

export async function startDriveFileUpload(input: {
  category: DriveFileCategory;
  subjectId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  size: number;
  origin: string;
}) {
  const validType =
    input.category === "minute-pdf"
      ? isPdfMimeType(input.mimeType)
      : isPhotoMimeType(input.mimeType);
  const maximumBytes =
    input.category === "minute-pdf" ? MAX_PDF_BYTES : MAX_PHOTO_BYTES;
  if (!validType || input.size <= 0 || input.size > maximumBytes)
    throw new Error("Tipo o tamaño de archivo inválido");
  const folderId = driveFolderId();
  const accessToken = await getDriveAccessToken();
  const name = `${input.category}-${crypto.randomUUID()}-${safeDriveName(input.originalName)}`;
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,appProperties",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": input.mimeType,
        "X-Upload-Content-Length": String(input.size),
        Origin: input.origin,
      },
      body: JSON.stringify({
        name,
        parents: [folderId],
        mimeType: input.mimeType,
        appProperties: {
          source: "spartanblue",
          category: input.category,
          subjectId: input.subjectId,
          uploadedBy: input.uploadedBy,
        },
      }),
      cache: "no-store",
    },
  );
  const uploadUrl = response.headers.get("location");
  let safeUploadUrl = "";
  try {
    const parsedUploadUrl = new URL(uploadUrl || "");
    if (
      parsedUploadUrl.protocol === "https:" &&
      parsedUploadUrl.origin === "https://www.googleapis.com" &&
      parsedUploadUrl.pathname.startsWith("/upload/drive/v3/files")
    )
      safeUploadUrl = parsedUploadUrl.toString();
  } catch {
    safeUploadUrl = "";
  }
  if (!response.ok || !safeUploadUrl)
    throw new Error("No se pudo iniciar la carga en Google Drive");
  return safeUploadUrl;
}

export async function startDrivePhotoUpload(input: {
  category: DrivePhotoCategory;
  subjectId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: (typeof PHOTO_MIME_TYPES)[number];
  size: number;
  origin: string;
}) {
  return startDriveFileUpload(input);
}

export async function getDriveFileMetadata(
  fileId: string,
  accessToken = "",
): Promise<DriveFileMetadata> {
  const token = accessToken || (await getDriveAccessToken());
  const fields = "id,name,mimeType,size,trashed,appProperties";
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Archivo de Google Drive no encontrado");
  return (await response.json()) as DriveFileMetadata;
}

export async function deleteDriveFile(fileId: string, accessToken = "") {
  const token = accessToken || (await getDriveAccessToken());
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!response.ok && response.status !== 404)
    throw new Error("No se pudo eliminar el archivo de Google Drive");
}
