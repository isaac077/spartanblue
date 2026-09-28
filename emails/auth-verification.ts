type AuthEmailAction =
  | "signup"
  | "recovery"
  | "magiclink"
  | "invite"
  | "email_change"
  | "reauthentication";

type AuthVerificationEmailProps = {
  action: AuthEmailAction;
  code: string;
  recipientName?: string;
};

const actionCopy: Record<
  AuthEmailAction,
  { subject: string; heading: string; explanation: string }
> = {
  recovery: {
    subject: "Código para restablecer tu contraseña",
    heading: "Restablece tu contraseña",
    explanation:
      "Recibimos una solicitud para cambiar la contraseña de tu cuenta.",
  },
  signup: {
    subject: "Código de verificación",
    heading: "Verifica tu correo",
    explanation: "Usa este código para verificar tu cuenta.",
  },
  magiclink: {
    subject: "Código para iniciar sesión",
    heading: "Tu código de acceso",
    explanation: "Usa este código para iniciar sesión en tu workspace.",
  },
  invite: {
    subject: "Invitación a Spartanblue",
    heading: "Te invitaron al workspace",
    explanation: "Usa este código para aceptar la invitación.",
  },
  email_change: {
    subject: "Código para confirmar tu correo",
    heading: "Confirma el cambio de correo",
    explanation: "Usa este código para confirmar el cambio de dirección.",
  },
  reauthentication: {
    subject: "Código de seguridad",
    heading: "Confirma que eres tú",
    explanation: "Usa este código para continuar con la operación segura.",
  },
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function authVerificationSubject(action: AuthEmailAction) {
  return actionCopy[action].subject;
}

export function authVerificationEmail({
  action,
  code,
  recipientName,
}: AuthVerificationEmailProps) {
  const copy = actionCopy[action];
  const safeCode = escapeHtml(code.split("").join(" "));
  const safeName = escapeHtml(
    recipientName?.trim().split(/\s+/, 1)[0] || "",
  );

  return `<!doctype html>
<html lang="es" dir="ltr">
  <head><title>${copy.subject}</title></head>
  <body style="margin:0;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:#20242a">
    <div lang="es" dir="ltr" style="display:none;max-height:0;overflow:hidden">${copy.subject}</div>
    <table lang="es" dir="ltr" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1ec;padding:32px 14px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e1e1dc;border-radius:16px;overflow:hidden;box-shadow:0 14px 40px rgba(32,36,42,.08)">
          <tr><td style="height:6px;background:linear-gradient(90deg,#327b9f 0%,#327b9f 76%,#c6932c 76%,#c6932c 100%)"></td></tr>
          <tr><td style="padding:34px 38px 18px">
            <div style="font-size:28px;line-height:1;font-weight:800;letter-spacing:-1px;color:#327b9f">Spartan<span style="color:#327b9f">blue</span></div>
          </td></tr>
          <tr><td style="padding:12px 38px 38px">
            ${safeName ? `<p style="margin:0 0 10px;color:#6d706f;font-size:15px">Hola ${safeName},</p>` : ""}
            <h1 style="margin:0 0 12px;font-size:25px;line-height:1.25;letter-spacing:-.5px">${copy.heading}</h1>
            <p style="margin:0 0 24px;color:#565d63;font-size:15px;line-height:1.55">${copy.explanation}</p>
            <div style="margin:0 0 24px;border:1px solid #dce3ed;border-radius:12px;background:#f6f8fb;padding:20px;text-align:center;color:#24579d;font-size:30px;font-weight:800;letter-spacing:.18em">${safeCode}</div>
            <p style="margin:0;color:#6d706f;font-size:13px;line-height:1.55">El código vence pronto y solo puede utilizarse una vez. Si no solicitaste este cambio, ignora el correo.</p>
          </td></tr>
          <tr><td style="padding:20px 38px;border-top:1px solid #ecece8;color:#8b928e;font-size:11px;line-height:1.5">Mensaje de seguridad de Spartanblue.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function authVerificationText({
  action,
  code,
  recipientName,
}: AuthVerificationEmailProps) {
  const copy = actionCopy[action];
  return [
    recipientName ? `Hola ${recipientName.trim().split(/\s+/, 1)[0]},` : "Hola,",
    "",
    copy.heading,
    copy.explanation,
    "",
    `Código: ${code}`,
    "",
    "El código vence pronto y solo puede utilizarse una vez.",
    "Si no solicitaste este cambio, ignora el correo.",
    "",
    "Spartanblue",
  ].join("\n");
}

export function isAuthEmailAction(value: unknown): value is AuthEmailAction {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(actionCopy, value)
  );
}
