import { createClient } from "@supabase/supabase-js";
import {
  taskNotificationEmail,
  taskNotificationText,
} from "../../../../emails/task-notification";
import {
  GoogleMailError,
  sendGoogleMail,
} from "../../../../lib/google-mail";
import {
  allowRequest,
  cleanUntrustedText,
  isUuid,
  noStoreJson,
  readLimitedJson,
} from "../../../../lib/security";

type EmailRequest = {
  taskId?: string;
  notificationIds?: string[];
  kind?: "mention" | "assignment";
  detail?: string;
};

type NotificationEmailRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  task_id: string | null;
  type: string;
  created_at: string;
};

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const googleMailFrom = process.env.GOOGLE_MAIL_FROM_ADDRESS;

  if (!token || token.length > 4096)
    return noStoreJson({ error: "No autorizado" }, 401);
  if (!supabaseUrl || !supabaseKey || !googleMailFrom)
    return noStoreJson(
      { error: "El servicio de correo no está configurado" },
      503,
    );

  const parsed = await readLimitedJson<EmailRequest>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const notificationIds = Array.from(
    new Set(Array.isArray(body.notificationIds) ? body.notificationIds : []),
  );
  if (
    !isUuid(body.taskId) ||
    (body.kind !== "mention" && body.kind !== "assignment") ||
    notificationIds.length === 0 ||
    notificationIds.length > 10 ||
    !notificationIds.every(isUuid)
  )
    return noStoreJson({ error: "Faltan datos válidos" }, 400);

  const client = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user)
    return noStoreJson({ error: "Sesión inválida" }, 401);

  if (!allowRequest(`task-email:${authData.user.id}`, 30, 10 * 60_000))
    return noStoreJson({ error: "Demasiados correos en poco tiempo" }, 429);

  const [
    { data: task, error: taskError },
    { data: notificationRows },
    { count: recentNotificationCount },
  ] =
    await Promise.all([
      client
        .from("tasks")
        .select("id,title,project_id,projects(name),task_assignees(user_id)")
        .eq("id", body.taskId)
        .single(),
      client
        .from("notifications")
        .select("id,user_id,actor_id,task_id,type,created_at")
        .in("id", notificationIds),
      client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", authData.user.id)
        .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString()),
    ]);
  if (taskError || !task)
    return noStoreJson({ error: "To-do no encontrado" }, 404);
  if ((recentNotificationCount || 0) > 60)
    return noStoreJson({ error: "Demasiados correos en poco tiempo" }, 429);

  const notifications = (notificationRows || []) as NotificationEmailRow[];
  const expectedType = body.kind;
  const newestAllowed = Date.now() - 15 * 60_000;
  const validNotifications = notifications.filter(
    (notification) =>
      notification.actor_id === authData.user.id &&
      notification.task_id === body.taskId &&
      notification.type === expectedType &&
      new Date(notification.created_at).getTime() >= newestAllowed,
  );
  if (
    validNotifications.length !== notificationIds.length ||
    new Set(validNotifications.map((notification) => notification.id)).size !==
      notificationIds.length
  )
    return noStoreJson({ error: "Notificaciones inválidas" }, 403);

  const assignedIds = new Set(
    ((task.task_assignees || []) as { user_id: string }[]).map(
      (item) => item.user_id,
    ),
  );
  const candidateRecipientIds = Array.from(
    new Set(validNotifications.map((notification) => notification.user_id)),
  );
  let mentionMemberIds = new Set<string>();
  if (body.kind === "mention") {
    const { data: memberRows, error: memberError } = await client
      .from("project_members")
      .select("user_id")
      .eq("project_id", task.project_id)
      .in("user_id", candidateRecipientIds);
    if (memberError)
      return noStoreJson({ error: "No se pudieron validar las menciones" }, 403);
    mentionMemberIds = new Set(
      (memberRows || []).map((member) => member.user_id),
    );
  }
  const allowedRecipientIds = candidateRecipientIds.filter(
    (id) => assignedIds.has(id) || mentionMemberIds.has(id),
  );
  if (allowedRecipientIds.length !== validNotifications.length)
    return noStoreJson({ error: "Destinatarios inválidos" }, 403);

  const notificationByRecipient = new Map(
    validNotifications.map((notification) => [
      notification.user_id,
      notification.id,
    ]),
  );

  const [{ data: recipients }, { data: actor }] = await Promise.all([
    client
      .from("profiles")
      .select("id,full_name,email")
      .in("id", allowedRecipientIds),
    client
      .from("profiles")
      .select("full_name")
      .eq("id", authData.user.id)
      .single(),
  ]);
  const projectRelation = task.projects as
    | { name?: string }
    | { name?: string }[]
    | null;
  const projectName =
    (Array.isArray(projectRelation)
      ? projectRelation[0]?.name
      : projectRelation?.name) || "Spartanblue Workspace";
  const actorName = actor?.full_name || "Alguien de tu equipo";
  const productionHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "spartanblue.vercel.app";
  const taskUrl = `https://${productionHost}/?project=${encodeURIComponent(task.project_id)}&task=${encodeURIComponent(task.id)}`;
  const safeDetail = cleanUntrustedText(body.detail, 1200);

  const results = await Promise.all(
    (recipients || []).map(async (recipient) => {
      const notificationId = notificationByRecipient.get(recipient.id);
      if (!notificationId)
        return { sent: false, skipped: false, error: "missing-recipient" };

      const { data: claim, error: claimError } = await client.rpc(
        "claim_notification_email_delivery",
        { p_notification_id: notificationId },
      );
      if (claimError)
        return { sent: false, skipped: false, error: "claim-failed" };
      if (claim !== "claimed")
        return { sent: false, skipped: true, error: null };

      const subject =
        body.kind === "mention"
          ? `${actorName} te mencionó en “${task.title}”`
          : `${actorName} te asignó “${task.title}”`;
      const emailProps = {
        recipientName: recipient.full_name,
        actorName,
        taskTitle: task.title,
        projectName,
        kind: body.kind!,
        detail: safeDetail,
        taskUrl,
      };

      try {
        const messageId = await sendGoogleMail({
          to: recipient.email,
          subject,
          html: taskNotificationEmail(emailProps),
          text: taskNotificationText(emailProps),
          notificationId,
        });
        const { error: completionError } = await client.rpc(
          "complete_notification_email_delivery",
          {
            p_notification_id: notificationId,
            p_message_id: messageId,
            p_success: true,
            p_error_code: null,
          },
        );
        if (completionError)
          console.error("notification_email_completion_failed", {
            notificationId,
          });
        return { sent: true, skipped: false, error: null };
      } catch (error) {
        const status = error instanceof GoogleMailError ? error.status : 502;
        await client.rpc("complete_notification_email_delivery", {
          p_notification_id: notificationId,
          p_message_id: null,
          p_success: false,
          p_error_code: `gmail-${status}`,
        });
        console.error("notification_email_send_failed", {
          notificationId,
          status,
        });
        return { sent: false, skipped: false, error: `gmail-${status}` };
      }
    }),
  );
  const errors = results.filter((result) => result.error);
  const sent = results.filter((result) => result.sent).length;
  const skipped = results.filter((result) => result.skipped).length;
  if (errors.length)
    return noStoreJson(
      { error: "No se pudieron enviar todos los correos", sent, skipped },
      502,
    );

  return noStoreJson({ sent, skipped });
}
