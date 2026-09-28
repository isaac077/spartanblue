import { createHash } from "node:crypto";
import { Webhook } from "standardwebhooks";
import {
  authVerificationEmail,
  authVerificationSubject,
  authVerificationText,
  isAuthEmailAction,
} from "../../../../emails/auth-verification";
import { sendGoogleMail } from "../../../../lib/google-mail";
import { noStoreJson } from "../../../../lib/security";

export const runtime = "nodejs";

type HookUser = {
  email?: string;
  new_email?: string;
  user_metadata?: { full_name?: string };
};

type HookEmailData = {
  token?: string;
  token_new?: string;
  token_hash?: string;
  token_hash_new?: string;
  email_action_type?: string;
};

type HookPayload = {
  user?: HookUser;
  email_data?: HookEmailData;
};

type Delivery = {
  email: string;
  code: string;
};

async function readRawBody(request: Request, maxBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
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
    return new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    return null;
  }
}

function validCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6,8}$/.test(value);
}

function validEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)
  );
}

function deliveriesFor(payload: HookPayload): Delivery[] {
  const { user, email_data: emailData } = payload;
  if (!user || !emailData) return [];

  if (emailData.email_action_type === "email_change") {
    const deliveries: Delivery[] = [];
    if (
      validEmail(user.email) &&
      validCode(emailData.token) &&
      emailData.token_hash_new
    ) {
      deliveries.push({ email: user.email, code: emailData.token });
    }
    if (validEmail(user.new_email) && validCode(emailData.token_new)) {
      deliveries.push({ email: user.new_email, code: emailData.token_new });
    }
    if (
      deliveries.length === 0 &&
      validEmail(user.new_email) &&
      validCode(emailData.token)
    ) {
      deliveries.push({ email: user.new_email, code: emailData.token });
    }
    return deliveries;
  }

  return validEmail(user.email) && validCode(emailData.token)
    ? [{ email: user.email, code: emailData.token }]
    : [];
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json")
    return noStoreJson({ error: "Contenido no válido" }, 415);

  const configuredSecret = process.env.SEND_EMAIL_HOOK_SECRET || "";
  if (!configuredSecret.startsWith("v1,whsec_") || configuredSecret.length < 32)
    return noStoreJson({ error: "Hook no configurado" }, 503);

  const rawBody = await readRawBody(request, 64 * 1024);
  if (!rawBody) return noStoreJson({ error: "Solicitud inválida" }, 400);

  let payload: HookPayload;
  try {
    const verifier = new Webhook(
      configuredSecret.replace(/^v1,whsec_/, ""),
    );
    payload = verifier.verify(
      rawBody,
      Object.fromEntries(request.headers),
    ) as HookPayload;
  } catch {
    return noStoreJson({ error: "Firma inválida" }, 401);
  }

  const action = payload.email_data?.email_action_type;
  if (!isAuthEmailAction(action))
    return noStoreJson({ error: "Acción no compatible" }, 400);
  const deliveries = deliveriesFor(payload);
  if (deliveries.length === 0)
    return noStoreJson({ error: "Datos de correo no válidos" }, 400);

  const webhookId = request.headers.get("webhook-id") || "auth-email";
  const recipientName = payload.user?.user_metadata?.full_name;
  try {
    await Promise.all(
      deliveries.map(({ email, code }) => {
        const deliveryId = createHash("sha256")
          .update(`${webhookId}:${email}:${action}`)
          .digest("hex")
          .slice(0, 40);
        const template = { action, code, recipientName };
        return sendGoogleMail({
          to: email,
          subject: authVerificationSubject(action),
          html: authVerificationEmail(template),
          text: authVerificationText(template),
          notificationId: `auth-${deliveryId}`,
        });
      }),
    );
  } catch {
    return noStoreJson({ error: "No se pudo enviar el correo" }, 502);
  }

  return noStoreJson({});
}
