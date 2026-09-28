import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the independent Spartanblue workspace working", async () => {
  const [
    page,
    layout,
    css,
    packageJson,
    supabaseClient,
    emailRoute,
    emailTemplate,
    googleMail,
    authEmailHook,
    authEmailTemplate,
    emailDeliveryMigration,
    projectAccessMigration,
    ownerSelectMigration,
    taskActionMigration,
    ticketIntakeMigration,
    ticketIntakeRoute,
    collaborationMigration,
    commentReactionMigration,
    ticketProtectionMigration,
    extensions,
    dailyAutomationRoute,
    vercelConfig,
    notificationWorker,
    securityHelpers,
    nextConfig,
    owaspMigration,
    privateMediaMigration,
    ticketEdgeFunction,
    dailyEdgeFunction,
    signupDomainMigration,
    driveUploadRoute,
    driveFileRoute,
    driveHelpers,
    googleAuth,
    envExample,
    weeklyReportRoute,
    weeklyReportProfileMigration,
    globalMessagesMigration,
    projectMinutes,
    projectMinutesMigration,
    collaborativeMinutesMigration,
    driveQuotaRoute,
    commentImageMigration,
    ticketResolveRoute,
  ] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/notifications/email/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../emails/task-notification.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/google-mail.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/auth/send-email-hook/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../emails/auth-verification.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260821153817_notification_email_delivery_guard.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813151624_fix_project_rls_and_owner_membership.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813152604_allow_project_owner_select.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813154219_task_action_workflows.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813164246_ticket_intake_workflow.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/api/tickets/intake/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813170208_collaboration_checkins_reports.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813192320_comment_reactions.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813203000_protect_ticket_project.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/components/WorkspaceExtensions.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/automations/daily/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../public/notification-sw.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/security.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../supabase/migrations/20260813172716_owasp_security_hardening.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813173738_owasp_private_media_and_rpc_isolation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/functions/workspace-ticket-intake/index.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/functions/workspace-daily-automation/index.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813174643_restrict_workspace_signup_domain.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/api/drive/uploads/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/drive/files/[id]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/google-drive.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/reports/weekly/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260813221000_add_weekly_report_profile_data.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260817090000_global_workspace_messages.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ProjectMinutes.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260817150000_project_meeting_minutes.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260817170000_collaborative_minutes_pdf_attachments.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/api/drive/quota/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260820200938_task_comment_image_attachments.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/api/tickets/resolve/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  const richTextEditor = await readFile(
    new URL("../app/components/RichTextEditor.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /Equipo Spartanblue/);
  assert.doesNotMatch(page, /como en Basecamp/i);
  assert.match(page, /\/spartanblue-logo\.png/);
  assert.match(layout, /\/spartanblue-favicon\.png/);
  assert.match(page, /Notificaciones/);
  assert.match(page, /notificationTab/);
  assert.match(page, /Nuevas <span>\{newNotificationsCount\}<\/span>/);
  assert.match(page, /Menciones <span>\{mentionNotificationsCount\}<\/span>/);
  assert.match(page, /Leídas <span>\{readNotificationsCount\}<\/span>/);
  assert.match(page, /notification\.type === "mention"/);
  assert.match(page, /unreadMentionsCount/);
  assert.match(page, /visibleNotifications\.map/);
  assert.match(css, /\.notification-tabs/);
  assert.match(page, /Backlog y presets/);
  assert.match(page, /loadWorkspaceTasks/);
  assert.match(page, /loadLinkedTaskPreview/);
  assert.match(page, /loadRelated: false/);
  assert.match(page, /linkedTaskPreviewPromise/);
  assert.match(
    page,
    /const \[teamResult, templateResult, activityResult, projectResult\]/,
  );
  assert.match(page, /workspacePendingTasks/);
  assert.match(page, /myWorkspaceTasks/);
  assert.match(page, /orderedRegularMyWorkspaceTasks/);
  assert.match(page, /regularMyWorkspaceTasks/);
  assert.match(page, /task\.status !== "review"/);
  assert.match(page, /task\.status === "review"/);
  assert.match(page, /BUBBLE_UP_STORAGE_KEY/);
  assert.match(page, /toggleBubbleTask/);
  assert.match(page, /reorderBubbleTasks/);
  assert.match(page, /dropBubbleTask/);
  assert.match(page, /Agregar “\$\{task\.title\}” a Bubble up/);
  assert.match(page, /Tarea agregada a Bubble up en la posición/);
  assert.match(page, /bubble-up-section/);
  assert.match(page, /className="bubble-up-list"/);
  assert.match(
    page,
    /className="bubble-up-list"[\s\S]*?<strong>\{task\.title\}<\/strong>[\s\S]*?bubble-drag-handle/,
  );
  assert.match(page, /draggable/);
  assert.match(page, /GripVertical/);
  assert.match(css, /\.bubble-task-button/);
  assert.match(css, /\.bubble-up-section/);
  assert.match(css, /\.bubble-task-rank/);
  assert.match(css, /\.bubble-drag-handle/);
  assert.match(css, /\.my-task-list-row/);
  assert.match(page, /import Link from "next\/link"/);
  assert.match(page, /href=\{projectHref\(p\.id\)\}/);
  assert.match(page, /href=\{projectHref\(projectCard\.id\)\}/);
  assert.match(page, /shouldHandleInternalLink/);
  assert.match(
    page,
    /onClick=\{\(\) => setView\("mytasks"\)\}[\s\S]*?Abrir mis to-dos/,
  );
  assert.match(page, /openWorkspaceTask/);
  assert.match(page, /No tienes tareas pendientes asignadas\./);
  assert.match(page, /\{myWorkspaceTasks[\s\S]*?\.slice\(0, 7\)/);
  assert.match(
    page,
    /selectedPersonTasks = selectedPerson[\s\S]*?workspaceTasks\.filter/,
  );
  assert.match(page, /void openWorkspaceTask\(task\)/);
  assert.doesNotMatch(page, /\.neq\("status", "done"\)/);
  assert.match(
    page,
    /No tienes tareas pendientes asignadas en ningún proyecto/,
  );
  assert.match(page, /Última actividad/);
  assert.match(page, /Generar reporte semanal/);
  assert.match(page, /generateWeeklyReport/);
  assert.match(page, /Datos para reportes semanales/);
  assert.match(page, /saveReportProfile/);
  assert.match(page, /\.update\(\{ phone \}\)/);
  assert.match(page, /name="area"/);
  assert.match(page, /area_name/);
  assert.match(page, /mencionó y asignó/);
  assert.match(page, /TAMBIÉN PUEDES BUSCAR POR ÁREA/);
  assert.match(page, /Buscar responsable/);
  assert.match(page, /assigneeSuggestions/);
  assert.match(page, /assignPerson\(person\)/);
  assert.match(page, /creator-assignee-row/);
  assert.match(page, /Este to-do se guardará en/);
  assert.match(page, /setNewTaskProjectId\(activeProjectId\)/);
  assert.match(page, /project_id: targetProjectId/);
  assert.match(css, /\.task-project-target/);
  assert.match(page, /newTaskAssigneeSuggestions/);
  assert.match(page, /toggleNewTaskAssignee/);
  assert.match(page, /selectedAssigneeIds\.map/);
  assert.match(page, /To-do creado sin responsable/);
  assert.match(page, /Agregar personas/);
  assert.match(page, /projectMemberSuggestions/);
  assert.match(page, /addPersonToProject\(person\)/);
  assert.match(page, /te agregó a un proyecto/);
  assert.match(page, /from\("project_members"\)/);
  assert.match(page, /\/spartanblue-coast\.jpg/);
  assert.match(page, /linkedTaskId/);
  assert.match(page, /Cuenta creada\. Revisa tu correo para confirmar la cuenta/);
  assert.match(page, /Cambiar mi foto/);
  assert.match(page, /from\("task_assignees"\)\.upsert/);
  assert.match(page, /async function unassignPerson/);
  assert.match(
    page,
    /\.from\("task_assignees"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("user_id", personId\)/,
  );
  assert.match(page, /Desasignar a \$\{responsibleName\}/);
  assert.match(page, /from\("notifications"\)\.insert/);
  assert.match(page, /postgres_changes/);
  assert.match(page, /hasSupabase \? \[\] : demoProjects/);
  assert.match(page, /Todavía no tienes proyectos/);
  assert.match(page, /No pudimos crear el proyecto/);
  assert.match(page, /Opciones del to-do/);
  assert.match(page, /Hacer una copia…/);
  assert.match(page, /Eliminar definitivamente/);
  assert.match(page, /requestPermission/);
  assert.match(page, /Activar escritorio/);
  assert.match(page, /Escritorio activo/);
  assert.match(page, /desktop-footer-activate/);
  assert.match(page, /Tickets sin asignar/);
  assert.match(page, /Panel de tickets/);
  assert.match(page, /Abrir en panel de tickets/);
  assert.match(page, /ESPACIO PROTEGIDO/);
  assert.match(page, /home-project-grid/);
  assert.match(page, /workspaceMemberIdsByProject/);
  assert.match(page, /select\("project_id,user_id"\)/);
  assert.match(page, /const assignedIds = workspaceTasks/);
  assert.match(page, /const cardMemberIds = new Set/);
  assert.match(page, /project-nav-scroll/);
  assert.match(page, /projectsMenuOpen/);
  assert.match(page, /aria-controls="sidebar-project-list"/);
  assert.match(page, /projects-menu-trigger/);
  assert.match(page, /Mostrar contraseña/);
  assert.match(page, /Modo oscuro/);
  assert.match(page, /tw-theme/);
  assert.match(page, /value="unassigned"/);
  assert.match(page, /Activar notificaciones/);
  assert.match(page, /showDesktopNotification/);
  assert.match(page, /async function openNotification/);
  assert.match(page, /project_id: n\.project_id/);
  assert.match(page, /task_id: n\.task_id/);
  assert.match(page, /projects\(name\),tasks\(title\)/);
  assert.match(page, /Abrir notificación:/);
  assert.match(page, /Abrir tarea/);
  assert.match(css, /\.notification-origin/);
  assert.match(
    css,
    /\.bell-button > span[\s\S]*font-variant-numeric: tabular-nums/,
  );
  assert.match(css, /\.desktop-footer-activate/);
  assert.match(css, /body[\s\S]*font-size: 16px/);
  assert.match(css, /\.primary-nav button,[\s\S]*font-size: 15px/);
  assert.match(css, /\.task-card h3[\s\S]*font-size: 15px/);
  assert.match(css, /\.task-card p[\s\S]*font-size: 14px/);
  assert.match(css, /\.comments-list p[\s\S]*font-size: 14px/);
  assert.match(page, /function LinkifiedText/);
  assert.match(page, /highlightedMentions/);
  assert.match(page, /comment-mention-chips/);
  assert.match(css, /\.inline-mention/);
  assert.match(css, /\.comment-mention-chips/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /Abrir en pantalla completa/);
  assert.match(page, /Salir de pantalla completa/);
  assert.match(
    page,
    /async function openTask[\s\S]*setTaskDetailFullscreen\(false\)/,
  );
  assert.match(page, /aria-label="Cerrar to-do"/);
  assert.match(page, /async function loadTaskComments/);
  assert.match(page, /Volver a intentar/);
  assert.match(page, /async function deleteComment/);
  assert.match(page, /Borrar comentario/);
  assert.match(page, /comment-delete-trigger/);
  assert.match(css, /\.comment-delete-trigger/);
  assert.doesNotMatch(
    page,
    /profiles\(full_name\),comment_reactions\(user_id,emoji\)/,
  );
  assert.match(
    page,
    /select\("id,body,author_id,created_at,comment_attachments\(\*\)"\)/,
  );
  assert.match(page, /category: "comment-image"/);
  assert.match(page, /Shift \+ Enter agrega una línea/);
  assert.match(page, /event\.key !== "Enter" \|\| event\.shiftKey/);
  assert.match(page, /Abrir este to-do en otra pestaña/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /window\.addEventListener\("popstate"/);
  assert.match(page, /window\.history\.pushState/);
  assert.match(page, /window\.history\.replaceState/);
  assert.match(css, /\.comment-image-gallery/);
  assert.match(css, /\.pending-comment-images/);
  assert.match(page, /function CommentImagePreview/);
  assert.match(page, /Cargando vista previa/);
  assert.match(page, /Haz clic para volver a cargarla/);
  assert.match(page, /normalizedCommentImageType/);
  assert.match(page, /declaredType === "image\/jpg"/);
  assert.match(page, /event\.clipboardData\.files/);
  assert.match(page, /Reintentar imágenes/);
  assert.match(page, /uploadCommentImageBatch/);
  assert.match(page, /Vuelve a intentarlo sin duplicar el comentario/);
  assert.match(page, /eslint-disable-next-line @next\/next\/no-img-element/);
  assert.match(page, /Se publicarán con tu comentario/);
  assert.match(page, /const sessionUserId = session\?\.user\.id \|\| ""/);
  assert.doesNotMatch(page, /\}, \[session\]\);/);
  assert.match(page, /COMMENT_DRAFT_STORAGE_PREFIX/);
  assert.match(page, /window\.sessionStorage\.setItem/);
  assert.match(page, /readSavedCommentDraft\(sessionUserId, task\.id\)/);
  assert.match(
    page,
    /const reopeningSameTask = selectedTaskIdRef\.current === task\.id/,
  );
  assert.match(page, /Borrador guardado automáticamente en esta pestaña/);
  assert.match(page, /saveCommentDraft\(sessionUserId, selectedTask\.id, ""\)/);
  assert.match(driveHelpers, /"comment-image"/);
  assert.match(driveUploadRoute, /category === "comment-image"/);
  assert.match(driveFileRoute, /properties\.category === "comment-image"/);
  assert.match(
    commentImageMigration,
    /create table if not exists public\.comment_attachments/,
  );
  assert.match(
    commentImageMigration,
    /size_bytes > 0 and size_bytes <= 52428800/,
  );
  assert.match(commentImageMigration, /enable row level security/);
  assert.doesNotMatch(
    page,
    /from\("comments"\)[\s\S]{0,180}profiles\(full_name\)/,
  );
  assert.match(
    page,
    /id="task-detail-title"[\s\S]*task-assignee-primary[\s\S]*task-description/,
  );
  assert.match(css, /\.task-detail[\s\S]*width: min\(920px, 96vw\)/);
  assert.match(css, /\.task-detail\.fullscreen[\s\S]*height: 100vh/);
  assert.match(css, /\.comments-list p[\s\S]*overflow-wrap: anywhere/);
  assert.match(css, /\.inline-link/);
  assert.match(css, /data-theme="dark"\] \.focus-list > button/);
  assert.match(css, /data-theme="dark"\] \.task-label/);
  assert.match(css, /data-theme="dark"\] \.status-pill/);
  assert.match(css, /data-theme="dark"\] \.mention-menu > button/);
  assert.match(page, /Mensajes/);
  assert.doesNotMatch(page, /Check-ins/);
  assert.doesNotMatch(page, /Reportes/);
  assert.match(page, /toggleTaskReaction/);
  assert.match(page, /toggleTaskFollowing/);
  assert.match(page, /taskReactionPickerOpen/);
  assert.match(page, /role="menuitemradio"/);
  assert.match(page, /currentTaskReactionLabel \|\| "Reaccionar"/);
  assert.match(
    css,
    /task-card:has\(\.task-action-menu\) \.task-topline[\s\S]*z-index: 220/,
  );
  assert.match(css, /\.modal-layer[\s\S]*z-index: 500/);
  assert.match(css, /\.unassign-person/);
  assert.match(css, /\.create-assignee-suggestions/);
  assert.doesNotMatch(page, /const seeded = initialTasks/);
  assert.doesNotMatch(page, /Profesional · minimalista · consistente/);
  assert.match(layout, /title: "Spartanblue"/);
  assert.match(css, /--green:\s*#327b9f/i);
  assert.match(css, /--orange:\s*#c6932c/i);
  assert.match(packageJson, /"build": "next build"/);
  assert.match(supabaseClient, /persistSession:\s*true/);
  assert.match(supabaseClient, /autoRefreshToken:\s*true/);
  assert.match(emailRoute, /auth\.getUser\(token\)/);
  assert.match(emailRoute, /sendGoogleMail/);
  assert.match(emailRoute, /task_assignees\(user_id\)/);
  assert.match(emailRoute, /from\("project_members"\)/);
  assert.match(
    emailRoute,
    /assignedIds\.has\(id\) \|\| mentionMemberIds\.has\(id\)/,
  );
  assert.match(emailRoute, /claim_notification_email_delivery/);
  assert.match(emailRoute, /complete_notification_email_delivery/);
  assert.match(googleMail, /gmail\/v1\/users\/me\/messages\/send/);
  assert.match(googleMail, /multipart\/alternative/);
  assert.match(googleMail, /GOOGLE_MAIL_FROM_ADDRESS/);
  assert.match(authEmailHook, /new Webhook/);
  assert.match(authEmailHook, /SEND_EMAIL_HOOK_SECRET/);
  assert.match(authEmailHook, /sendGoogleMail/);
  assert.match(authEmailHook, /readRawBody\(request, 64 \* 1024\)/);
  assert.match(authEmailTemplate, /Restablece tu contraseña/);
  assert.match(authEmailTemplate, /Código:/);
  assert.match(envExample, /SEND_EMAIL_HOOK_SECRET=/);
  assert.match(emailDeliveryMigration, /enable row level security/);
  assert.match(emailDeliveryMigration, /revoke all on table/);
  assert.match(emailDeliveryMigration, /notification_id uuid primary key/);
  assert.match(emailTemplate, /Spartanblue/);
  assert.match(emailTemplate, /Abrir to-do/);
  assert.match(emailTemplate, /taskNotificationText/);
  assert.match(projectAccessMigration, /is_current_user_project_member/);
  assert.match(projectAccessMigration, /add_project_owner_membership/);
  assert.match(projectAccessMigration, /security definer/);
  assert.match(ownerSelectMigration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(taskActionMigration, /move_task_to_project/);
  assert.match(taskActionMigration, /copy_task_to_project/);
  assert.match(taskActionMigration, /security invoker/);
  assert.match(ticketIntakeMigration, /ingest_workspace_ticket/);
  assert.match(ticketIntakeMigration, /external_source/);
  assert.match(ticketIntakeMigration, /'unassigned'/);
  assert.match(ticketIntakeMigration, /workspace_integrations/);
  assert.match(ticketIntakeRoute, /timingSafeEqual/);
  assert.match(ticketIntakeRoute, /x-ticket-webhook-secret/);
  assert.match(ticketIntakeRoute, /workspace-ticket-intake/);
  assert.match(ticketResolveRoute, /authenticateRequest\(request\)/);
  assert.match(ticketResolveRoute, /TICKET_WEBHOOK_SECRET/);
  assert.match(ticketResolveRoute, /resolveWorkspaceTicket/);
  assert.match(ticketResolveRoute, /external_source !== "ticket_system"/);
  assert.match(ticketResolveRoute, /resolution\.length < 3/);
  assert.match(ticketResolveRoute, /\.update\(\{ status: "done" \}\)/);
  assert.match(page, /¿Cuál fue la resolución\?/);
  assert.match(page, /\/api\/tickets\/resolve/);
  assert.match(page, /Enviar y marcar como hecho/);
  assert.match(page, /Ticket resuelto y resolución enviada por correo/);
  assert.match(collaborationMigration, /project_posts/);
  assert.match(collaborationMigration, /checkin_schedules/);
  assert.match(collaborationMigration, /task_subscriptions/);
  assert.match(collaborationMigration, /run_workspace_daily_automation/);
  assert.match(collaborationMigration, /enable row level security/);
  assert.match(
    commentReactionMigration,
    /create table public\.comment_reactions/,
  );
  assert.match(commentReactionMigration, /enable row level security/);
  assert.match(commentReactionMigration, /current_user_can_access_task/);
  assert.match(commentReactionMigration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(page, /toggleCommentReaction/);
  assert.match(page, /commentReactionPickerId/);
  assert.match(page, /from\("comment_reactions"\)/);
  assert.match(page, /Reaccionar al comentario/);
  assert.match(css, /\.comment-reaction-picker/);
  assert.match(css, /\.home-project-grid/);
  assert.match(css, /\.project-nav-scroll/);
  assert.match(css, /data-theme="dark"/);
  assert.match(ticketProtectionMigration, /protect_ticket_project/);
  assert.match(ticketProtectionMigration, /before update or delete/);
  assert.match(ticketProtectionMigration, /cannot be renamed or archived/);
  assert.match(extensions, /CONVERSACIONES DEL WORKSPACE/);
  assert.match(extensions, /Publicar para todo el Workspace/);
  assert.match(extensions, /\.is\("project_id", null\)/);
  assert.match(extensions, /project_id: null/);
  assert.match(
    globalMessagesMigration,
    /alter column project_id drop not null/,
  );
  assert.match(globalMessagesMigration, /set project_id = null/);
  assert.match(globalMessagesMigration, /project_id is null/);
  assert.match(globalMessagesMigration, /current_user_can_access_post/);
  assert.match(extensions, /reactionPickerPostId/);
  assert.match(extensions, /Reaccionar/);
  assert.match(extensions, /role="menuitemradio"/);
  assert.match(extensions, /postToDelete/);
  assert.match(extensions, /Borrar definitivamente/);
  assert.match(extensions, /\.eq\("author_id", userId\)/);
  assert.match(css, /\.messages-view[\s\S]*--message-text-color: #111411/);
  assert.match(
    css,
    /data-theme="dark"\] \.messages-view[\s\S]*--message-text-color: #fff/,
  );
  assert.match(css, /\.task-card,[\s\S]*--task-content-text: #111411/);
  assert.match(css, /\.task-detail \.comments-list p/);
  assert.match(
    css,
    /data-theme="dark"\] \.task-card,[\s\S]*--task-content-text: #fff/,
  );
  assert.match(page, /projectView === "minutes"/);
  assert.match(page, /<ProjectMinutes/);
  assert.match(projectMinutes, /Minutas de juntas/);
  assert.match(projectMinutes, /Nueva minuta/);
  assert.match(projectMinutes, /Acuerdos/);
  assert.match(projectMinutes, /Próximos pasos/);
  assert.match(projectMinutes, /Seleccionar PDFs/);
  assert.match(projectMinutes, /Espacio para archivos/);
  assert.match(projectMinutes, /Visible solo para Isaac/);
  assert.match(projectMinutes, /\/api\/drive\/quota/);
  assert.match(projectMinutes, /MAX_PDF_BYTES = 50 \* 1024 \* 1024/);
  assert.match(projectMinutes, /deleteMinuteAttachment/);
  assert.doesNotMatch(projectMinutes, /canManage/);
  assert.match(projectMinutes, /\.eq\("project_id", projectId\)/);
  assert.match(
    projectMinutesMigration,
    /create table if not exists public\.project_minutes/,
  );
  assert.match(projectMinutesMigration, /enable row level security/);
  assert.match(projectMinutesMigration, /is_current_user_project_member/);
  assert.match(projectMinutesMigration, /is_current_user_project_owner/);
  assert.match(collaborativeMinutesMigration, /members update project minutes/);
  assert.match(collaborativeMinutesMigration, /members delete project minutes/);
  assert.match(
    collaborativeMinutesMigration,
    /create table if not exists public\.project_minute_attachments/,
  );
  assert.match(collaborativeMinutesMigration, /mime_type = 'application\/pdf'/);
  assert.match(
    collaborativeMinutesMigration,
    /size_bytes > 0 and size_bytes <= 52428800/,
  );
  assert.match(collaborativeMinutesMigration, /current_user_can_access_minute/);
  assert.doesNotMatch(extensions, /grouped\.map/);
  assert.match(extensions, /commentLocksRef/);
  assert.doesNotMatch(extensions, /Check-ins automáticos/);
  assert.doesNotMatch(extensions, /Carga por persona/);
  assert.match(dailyAutomationRoute, /timingSafeEqual/);
  assert.match(dailyAutomationRoute, /workspace-daily-automation/);
  assert.match(vercelConfig, /api\/automations\/daily/);
  assert.match(notificationWorker, /notificationclick/);
  assert.match(notificationWorker, /clients\.openWindow/);
  assert.match(securityHelpers, /readLimitedJson/);
  assert.match(securityHelpers, /allowedHttpsUrl/);
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /frame-ancestors 'none'/);
  assert.match(nextConfig, /poweredByHeader:\s*false/);
  assert.match(owaspMigration, /members create scoped notifications/);
  assert.match(owaspMigration, /grant update \(read_at\)/);
  assert.match(privateMediaMigration, /set public = false/);
  assert.match(privateMediaMigration, /to service_role/);
  assert.match(privateMediaMigration, /security invoker/);
  assert.doesNotMatch(privateMediaMigration, /to anon, service_role/);
  assert.match(ticketEdgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(ticketEdgeFunction, /MAX_BODY_BYTES/);
  assert.match(dailyEdgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(signupDomainMigration, /registration accepts personal and corporate email/i);
  assert.doesNotMatch(page, /thomaswagner|wmp/i);
  assert.match(page, /password\.length < 12/);
  assert.match(page, /¿Olvidaste tu contraseña\?/);
  assert.match(page, /resetPasswordForEmail\(email\)/);
  assert.match(page, /verifyOtp\(\{[\s\S]*type: "recovery"/);
  assert.match(page, /updateUser\(\{[\s\S]*password: resetPassword/);
  assert.match(page, /autoComplete="one-time-code"/);
  assert.match(page, /Las contraseñas no coinciden/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(page, /MAX_PHOTO_BYTES = 50 \* 1024 \* 1024/);
  assert.match(
    page,
    /column\.key !== "unassigned" \|\| activeProjectIsTicketInbox/,
  );
  assert.match(
    page,
    /status === "unassigned" && destination\?\.name !== TICKET_PROJECT_NAME/,
  );
  assert.match(
    page,
    /\.update\(\{ status: "todo" \}\)[\s\S]*\.neq\("project_id", inboxProject\.id\)/,
  );
  assert.match(page, /uploadDrivePhoto/);
  assert.match(page, /gdrive:/);
  assert.doesNotMatch(page, /pesar máximo 5 MB/);
  assert.match(driveUploadRoute, /authenticateRequest\(request\)/);
  assert.match(driveUploadRoute, /Origen no autorizado/);
  assert.match(driveUploadRoute, /project\.owner_id !== auth\.user\.id/);
  assert.match(driveUploadRoute, /MAX_PHOTO_BYTES/);
  assert.match(driveUploadRoute, /category === "minute-pdf"/);
  assert.match(driveUploadRoute, /from\("project_minutes"\)/);
  assert.match(
    driveFileRoute,
    /properties\.source !== "spartanblue"/,
  );
  assert.match(driveFileRoute, /properties\.category === "minute-pdf"/);
  assert.match(driveFileRoute, /Content-Disposition/);
  assert.match(driveFileRoute, /X-Content-Type-Options/);
  assert.match(googleAuth, /https:\/\/oauth2\.googleapis\.com\/token/);
  assert.match(driveHelpers, /getGoogleWorkspaceAccessToken/);
  assert.match(driveHelpers, /Origin: input\.origin/);
  assert.match(driveHelpers, /DRIVE_REFERENCE_PREFIX = "gdrive:"/);
  assert.match(driveHelpers, /MAX_PDF_BYTES = 50 \* 1024 \* 1024/);
  assert.match(driveHelpers, /isPdfMimeType/);
  assert.match(driveHelpers, /drive\/v3\/about/);
  assert.match(driveHelpers, /storageQuota\(limit,usage,usageInDrive\)/);
  assert.match(driveQuotaRoute, /authenticateRequest\(request\)/);
  assert.doesNotMatch(driveQuotaRoute, /@/);
  assert.match(driveQuotaRoute, /getDriveStorageQuota/);
  assert.match(envExample, /GOOGLE_DRIVE_REFRESH_TOKEN=/);
  assert.match(weeklyReportRoute, /\.neq\("status", "done"\)/);
  assert.match(weeklyReportRoute, /\.neq\("status", "backlog"\)/);
  assert.match(weeklyReportRoute, /accountId: project\.id/);
  assert.match(weeklyReportRoute, /accountName: cleanUntrustedText\(project\.name/);
  assert.doesNotMatch(weeklyReportRoute, /Thomas|WMP|wmp/i);
  assert.match(weeklyReportRoute, /WORKSPACE_REPORT_SECRET/);
  assert.match(weeklyReportRoute, /auth\.getUser\(token\)/);
  assert.match(weeklyReportRoute, /phone: cleanUntrustedText\(person\.phone/);
  assert.match(page, /showSaveFilePicker/);
  assert.match(page, /msSaveOrOpenBlob/);
  assert.match(page, /URL\.revokeObjectURL\(url\), 60_000/);
  assert.match(
    weeklyReportProfileMigration,
    /add column if not exists phone text/,
  );
  assert.match(
    weeklyReportProfileMigration,
    /grant update \(full_name, avatar_url, area_id, phone\)/,
  );
  assert.match(page, /task-creator-fullscreen/);
  assert.match(page, /task-creator-work-grid/);
  assert.match(page, /task-edit-body-grid/);
  assert.match(page, /task-step-editor-row/);
  assert.match(page, /function statusToneClass/);
  assert.match(page, /function tasksForStatus/);
  assert.match(page, /if \(status !== "done"\) return matchingTasks/);
  assert.match(page, /return secondTimestamp - firstTimestamp/);
  assert.match(page, /updatedAt: row\.updated_at/);
  assert.match(page, /\.select\("id,updated_at"\)/);
  assert.match(page, /status-pill \$\{statusToneClass\(task\.status\)\}/);
  assert.match(
    page,
    /status-select \$\{statusToneClass\(selectedTask\.status\)\}/,
  );
  assert.match(css, /\.status-pill\.status-todo/);
  assert.match(css, /\.status-pill\.status-in-progress/);
  assert.match(css, /\.status-pill\.status-review/);
  assert.match(css, /\.status-pill\.status-done/);
  assert.match(css, /data-theme="dark"\] \.status-pill\.status-review/);
  assert.match(page, /Agregar otro paso/);
  assert.match(page, /addNewTaskStep/);
  assert.match(page, /beginTaskEditing/);
  assert.match(page, /saveTaskDetails/);
  assert.match(page, /Crear y abrir to-do/);
  assert.match(css, /\.task-creator-fullscreen/);
  assert.match(css, /\.task-detail-editor/);
  assert.match(css, /\.task-detail\.fullscreen:has\(\.task-detail-editor\)/);
  assert.match(css, /@media \(min-width: 860px\) and \(max-width: 1099px\)/);
  assert.match(css, /\.task-creator-notes textarea[\s\S]*min-height: 180px/);
  assert.match(css, /scrollbar-gutter: stable/);
  assert.match(css, /\.task-creator-shell::-webkit-scrollbar/);
  assert.match(page, /<RichTextEditor/);
  assert.match(page, /<RichTextContent/);
  assert.match(richTextEditor, /Negritas/);
  assert.match(richTextEditor, /Subrayar/);
  assert.match(richTextEditor, /Lista con viñetas/);
  assert.match(richTextEditor, /tw-rich-v1:/);
  assert.match(
    richTextEditor,
    /event\.clipboardData\.getData\("text\/plain"\)/,
  );
  assert.match(
    weeklyReportRoute,
    /\.select\("id,title,status,due_date,projects\(id,name\)"\)/,
  );
  assert.match(weeklyReportRoute, /accountByProject\.set\(project\.id, account\)/);
  assert.match(weeklyReportRoute, /topic: title/);
  assert.doesNotMatch(weeklyReportRoute, /Thomas|WMP|wmp/i);
  assert.match(weeklyReportRoute, /if \(!date\) return "Sin fecha"/);
  assert.match(weeklyReportRoute, /update: taskDueLabel\(task\.due_date\)/);
  assert.match(
    weeklyReportRoute,
    /if \(status === "review"\) return "En revisión"/,
  );
  assert.match(
    weeklyReportRoute,
    /if \(status === "in_progress"\) return "En proceso"/,
  );
  assert.match(weeklyReportRoute, /status: reportTaskStatus\(task\.status\)/);
  assert.doesNotMatch(weeklyReportRoute, /plainTaskDescription/);
  assert.doesNotMatch(weeklyReportRoute, /task\.description/);
  await assert.rejects(
    access(new URL("../app/_sites-preview", import.meta.url)),
  );
});

test("exposes the authenticated Workspace MCP and keeps steps below context", async () => {
  const [mcpRoute, mcpServer, oauthMetadata, oauthConsent, css, packageJson] =
    await Promise.all([
      readFile(new URL("../app/mcp/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../lib/mcp/workspace-server.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/.well-known/oauth-protected-resource/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/oauth/consent/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);

  assert.match(mcpRoute, /WebStandardStreamableHTTPServerTransport/);
  assert.match(mcpRoute, /auth\.getUser\(token\)/);
  assert.match(mcpRoute, /Authorization: `Bearer \$\{token\}`/);
  assert.match(mcpRoute, /MAX_MCP_BODY_BYTES/);
  assert.match(mcpRoute, /allowRequest\(`mcp:/);
  assert.match(mcpRoute, /resource_metadata=/);
  assert.match(oauthMetadata, /authorization_servers/);
  assert.match(oauthMetadata, /\/auth\/v1/);
  assert.match(oauthConsent, /getAuthorizationDetails/);
  assert.match(oauthConsent, /approveAuthorization/);
  assert.match(oauthConsent, /denyAuthorization/);
  assert.match(packageJson, /@modelcontextprotocol\/sdk/);
  assert.match(packageJson, /"zod"/);

  const expectedTools = [
    "workspace_overview",
    "list_projects",
    "get_project",
    "list_people",
    "search_tasks",
    "get_task",
    "get_comment_image",
    "create_task",
    "update_task",
    "move_task",
    "copy_task",
    "assign_task",
    "set_task_step",
    "comment_task",
    "react_to_task",
    "follow_task",
    "react_to_comment",
    "delete_comment",
    "create_project",
    "update_project",
    "delete_project",
    "add_project_member",
    "remove_project_member",
    "list_messages",
    "create_message",
    "update_message",
    "comment_message",
    "react_to_message",
    "follow_message",
    "delete_message_comment",
    "delete_message",
    "list_minutes",
    "get_minute_pdf",
    "save_minute",
    "delete_minute_pdf",
    "delete_minute",
    "list_notifications",
    "mark_notifications_read",
    "list_activity",
    "get_my_profile",
    "update_my_profile",
    "list_areas",
    "list_templates",
    "save_template",
    "delete_template",
    "generate_weekly_report",
  ];
  for (const tool of expectedTools)
    assert.match(mcpServer, new RegExp(`"${tool}"`));
  assert.match(
    mcpServer,
    /PDF semanal breve[\s\S]*títulos y fechas[\s\S]*agrupadas por proyecto/,
  );
  assert.match(mcpServer, /destructiveHint: true/);
  assert.match(mcpServer, /confirm_title/);
  assert.match(mcpServer, /confirm_name/);
  assert.match(mcpServer, /Sin asignar solo puede usarse en Mesa de tickets/);
  assert.match(
    mcpServer,
    /Indica la resolución que se enviará por correo al solicitante/,
  );
  assert.match(mcpServer, /\/api\/tickets\/resolve/);
  assert.match(mcpServer, /resolution: z\.string\(\)\.trim\(\)\.min\(3\)/);
  assert.doesNotMatch(mcpServer, /service_role/i);
  assert.match(mcpRoute, /authInfo/);
  assert.match(mcpServer, /task_subscriptions/);
  assert.match(mcpServer, /comment_attachments/);

  assert.match(
    css,
    /\.task-creator-work-grid,[\s\S]*\.task-edit-body-grid,[\s\S]*display: block;[\s\S]*grid-template-columns: none;/,
  );
  assert.match(
    css,
    /\.task-creator-checklist,[\s\S]*\.task-edit-checklist[\s\S]*margin-top: 22px;/,
  );
});
