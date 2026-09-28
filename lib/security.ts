import { NextResponse } from "next/server";

type JsonReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requestWindows = new Map<string, { count: number; expiresAt: number }>();

export function noStoreJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function readLimitedJson<T>(
  request: Request,
  maxBytes: number,
): Promise<JsonReadResult<T>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return {
      ok: false,
      response: noStoreJson(
        { error: "El contenido debe enviarse como JSON" },
        415,
      ),
    };
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maxBytes
  ) {
    return {
      ok: false,
      response: noStoreJson({ error: "Solicitud demasiado grande" }, 413),
    };
  }

  if (!request.body) {
    return {
      ok: false,
      response: noStoreJson({ error: "Solicitud vacía" }, 400),
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return {
        ok: false,
        response: noStoreJson({ error: "Solicitud demasiado grande" }, 413),
      };
    }
    chunks.push(value);
  }

  const payload = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(payload);
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return {
      ok: false,
      response: noStoreJson({ error: "Solicitud inválida" }, 400),
    };
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function cleanUntrustedText(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) || 0;
      return codePoint === 9 || codePoint === 10 || codePoint === 13 ||
        (codePoint >= 32 && codePoint !== 127);
    })
    .join("")
    .trim()
    .slice(0, limit);
}

export function allowedHttpsUrl(
  value: string,
  allowedOrigins: readonly string[],
) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return allowedOrigins.includes(url.origin) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function requestClientKey(request: Request, namespace: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]
    ?.trim();
  return `${namespace}:${forwarded || "unknown"}`;
}

export function allowRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (requestWindows.size > 2_000) {
    for (const [entryKey, entry] of requestWindows) {
      if (entry.expiresAt <= now) requestWindows.delete(entryKey);
    }
  }

  const current = requestWindows.get(key);
  if (!current || current.expiresAt <= now) {
    requestWindows.set(key, { count: 1, expiresAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
