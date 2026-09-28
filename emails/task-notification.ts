type TaskNotificationEmailProps = {
  recipientName: string;
  actorName: string;
  taskTitle: string;
  projectName: string;
  kind: "mention" | "assignment";
  detail?: string;
  taskUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function taskNotificationEmail({
  recipientName,
  actorName,
  taskTitle,
  projectName,
  kind,
  detail,
  taskUrl,
}: TaskNotificationEmailProps) {
  const action = kind === "mention" ? "te mencionó en un to-do" : "te asignó un to-do";
  const safeRecipient = escapeHtml(recipientName.split(" ")[0] || recipientName);
  const safeActor = escapeHtml(actorName);
  const safeTask = escapeHtml(taskTitle);
  const safeProject = escapeHtml(projectName);
  const safeDetail = detail ? escapeHtml(detail) : "";
  const safeUrl = escapeHtml(taskUrl);

  return `<!doctype html>
<html lang="es" dir="ltr">
  <head><title>${safeActor} ${action}: ${safeTask}</title></head>
  <body style="margin:0;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:#20242a">
    <div lang="es" dir="ltr" style="display:none;max-height:0;overflow:hidden">${safeActor} ${action}: ${safeTask}</div>
    <table lang="es" dir="ltr" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1ec;padding:32px 14px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e1e1dc;border-radius:16px;overflow:hidden;box-shadow:0 14px 40px rgba(32,36,42,.08)">
          <tr><td style="height:6px;background:linear-gradient(90deg,#327b9f 0%,#327b9f 76%,#c6932c 76%,#c6932c 100%)"></td></tr>
          <tr><td style="padding:34px 38px 18px">
            <div style="font-size:28px;line-height:1;font-weight:800;letter-spacing:-1px;color:#327b9f">Spartan<span style="color:#327b9f">blue</span></div>
          </td></tr>
          <tr><td style="padding:12px 38px 38px">
            <p style="margin:0 0 10px;color:#6d706f;font-size:15px">Hola ${safeRecipient},</p>
            <h1 style="margin:0 0 22px;font-size:25px;line-height:1.25;letter-spacing:-.5px">${safeActor} ${action}</h1>
            <div style="border-left:4px solid #327b9f;background:#f6f8fb;border-radius:0 10px 10px 0;padding:16px 18px;margin-bottom:22px">
              <strong style="display:block;font-size:16px;margin-bottom:5px">${safeTask}</strong>
              <span style="color:#6d706f;font-size:13px">Proyecto: ${safeProject}</span>
            </div>
            ${safeDetail ? `<div style="border:1px solid #e4e5e1;border-radius:10px;padding:14px 16px;margin-bottom:24px;color:#565d63;font-size:14px;line-height:1.55">${safeDetail}</div>` : ""}
            <a href="${safeUrl}" style="display:inline-block;background:#327b9f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 22px;border-radius:9px">Abrir to-do</a>
          </td></tr>
          <tr><td style="padding:20px 38px;border-top:1px solid #ecece8;color:#8b928e;font-size:11px;line-height:1.5">Esta notificación se envió porque formas parte del workspace interno de Spartanblue.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function taskNotificationText({
  recipientName,
  actorName,
  taskTitle,
  projectName,
  kind,
  detail,
  taskUrl,
}: TaskNotificationEmailProps) {
  const action = kind === "mention" ? "te mencionó en un to-do" : "te asignó un to-do";
  return [
    `Hola ${recipientName.split(" ")[0] || recipientName},`,
    "",
    `${actorName} ${action}.`,
    `To-do: ${taskTitle}`,
    `Proyecto: ${projectName}`,
    detail ? `\nComentario:\n${detail}` : "",
    "",
    `Abrir el to-do: ${taskUrl}`,
    "",
    "Esta notificación se envió porque formas parte de Spartanblue.",
  ]
    .filter(Boolean)
    .join("\n");
}
