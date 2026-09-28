import "server-only";
import { getGoogleWorkspaceAccessToken } from "./google-auth";

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export class GoogleMailError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function assertEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    normalized.includes("\r") ||
    normalized.includes("\n") ||
    !EMAIL_PATTERN.test(normalized)
  )
    throw new GoogleMailError("Dirección de correo inválida", 400, false);
  return normalized;
}

function encodeHeader(value: string) {
  const clean = value.replace(/[\r\n]+/g, " ").trim().slice(0, 500);
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function encodeBody(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") || "";
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function mimeMessage(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  notificationId: string;
}) {
  const boundary = `workspace_${input.notificationId.replaceAll("-", "")}`;
  const messageIdHost = "spartanblue.vercel.app";
  return [
    `From: ${encodeHeader("Spartanblue")} <${input.from}>`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <workspace-${input.notificationId}@${messageIdHost}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(input.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function retryDelay(attempt: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.min(1_000 * 2 ** attempt, 4_000)),
  );
}

export async function sendGoogleMail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  notificationId: string;
}) {
  const to = assertEmail(input.to);
  const from = assertEmail(process.env.GOOGLE_MAIL_FROM_ADDRESS || "");
  const raw = base64Url(mimeMessage({ ...input, to, from }));
  let lastError = new GoogleMailError("Gmail no respondió", 502, true);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const accessToken = await getGoogleWorkspaceAccessToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw }),
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => ({}))) as {
          id?: string;
          error?: { status?: string };
        };
        if (response.ok && body.id) return body.id;
        const retryable = response.status === 429 || response.status >= 500;
        lastError = new GoogleMailError(
          body.error?.status || "Gmail rechazó el envío",
          response.status,
          retryable,
        );
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      lastError =
        error instanceof GoogleMailError
          ? error
          : new GoogleMailError("No se pudo conectar con Gmail", 502, true);
    }
    if (!lastError.retryable || attempt === 2) break;
    await retryDelay(attempt);
  }
  throw lastError;
}
