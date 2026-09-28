import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { cleanUntrustedText } from "../security";

const STATUS_VALUES = [
  "backlog",
  "unassigned",
  "todo",
  "in_progress",
  "review",
  "done",
] as const;
const PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;
const REACTION_VALUES = ["👍", "❤️", "🎉", "👀"] as const;
const TICKET_PROJECT_NAME = "Mesa de tickets";
const RICH_TEXT_PREFIX = "tw-rich-v1:";
const WORKSPACE_PUBLIC_ORIGIN = "https://spartanblue.vercel.app";
const RESULT_SCHEMA = {
  result: z.record(z.string(), z.unknown()),
};

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;
const destructiveAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;
const externalActionAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
} as const;
const externalReadAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
} as const;

type WorkspaceServerOptions = {
  client: SupabaseClient;
  user: User;
  accessToken: string;
  origin: string;
};

type ToolPayload = {
  summary: string;
  result: Record<string, unknown>;
};

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: (typeof STATUS_VALUES)[number];
  priority: (typeof PRIORITY_VALUES)[number];
  due_date: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  external_source?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  projects?: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
  task_assignees?: { user_id: string }[] | null;
  task_labels?: {
    labels: { id?: string; name?: string; color?: string } | null;
  }[] | null;
  task_steps?: {
    id: string;
    title: string;
    completed: boolean;
    position: number;
  }[] | null;
  task_reactions?: { user_id: string; emoji: string }[] | null;
  task_subscriptions?: { user_id: string }[] | null;
};

const taskSelect =
  "id,project_id,title,description,status,priority,due_date,position,created_by,created_at,updated_at,external_source,external_id,external_url,projects(id,name),task_assignees(user_id),task_labels(labels(id,name,color)),task_steps(id,title,completed,position),task_reactions(user_id,emoji),task_subscriptions(user_id)";

function relationOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTask(row: TaskRow) {
  const project = relationOne(row.projects);
  const steps = [...(row.task_steps || [])].sort(
    (first, second) => first.position - second.position,
  );
  return {
    id: row.id,
    project_id: row.project_id,
    project_name: project?.name || "Proyecto",
    title: row.title,
    description: row.description || "",
    description_plain: plainWorkspaceText(row.description || ""),
    description_format: row.description?.startsWith(RICH_TEXT_PREFIX)
      ? "tw-rich-v1"
      : "plain",
    status: row.status,
    status_label:
      {
        backlog: "Plantilla/backlog",
        unassigned: "Sin asignar",
        todo: "Por hacer",
        in_progress: "En curso",
        review: "En revisión",
        done: "Hecho",
      }[row.status] || row.status,
    priority: row.priority,
    due_date: row.due_date,
    position: row.position,
    assignee_ids: (row.task_assignees || []).map((item) => item.user_id),
    labels: (row.task_labels || []).flatMap((item) =>
      item.labels?.name
        ? [
            {
              id: item.labels.id,
              name: item.labels.name,
              color: item.labels.color,
            },
          ]
        : [],
    ),
    steps,
    step_progress: {
      completed: steps.filter((step) => step.completed).length,
      total: steps.length,
    },
    reactions: row.task_reactions || [],
    follower_ids: (row.task_subscriptions || []).map((item) => item.user_id),
    created_at: row.created_at,
    updated_at: row.updated_at,
    external_source: row.external_source || null,
    external_id: row.external_id || null,
    external_url: row.external_url || null,
    url: `${WORKSPACE_PUBLIC_ORIGIN}/?project=${encodeURIComponent(row.project_id)}&task=${encodeURIComponent(row.id)}`,
  };
}

function toolResponse(payload: ToolPayload) {
  return {
    structuredContent: { result: payload.result },
    content: [
      {
        type: "text" as const,
        text: `${payload.summary}\n${JSON.stringify(payload.result)}`,
      },
    ],
  };
}

function toolFailure(error: unknown) {
  const message =
    error instanceof Error ? error.message : "No se pudo completar la acción";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

async function runTool(work: () => Promise<ToolPayload>) {
  try {
    return toolResponse(await work());
  } catch (error) {
    return toolFailure(error);
  }
}

function ensureNoError(error: { message?: string } | null, message: string) {
  if (error) throw new Error(`${message}: ${error.message || "error de datos"}`);
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values));
}

function isTicketProjectName(value: string) {
  return value.trim().toLocaleLowerCase("es-MX") === TICKET_PROJECT_NAME.toLocaleLowerCase("es-MX");
}

function projectLink(projectId: string) {
  return `${WORKSPACE_PUBLIC_ORIGIN}/?project=${encodeURIComponent(projectId)}`;
}

function safeText(value: string, limit: number, field: string) {
  const clean = cleanUntrustedText(value, limit);
  if (!clean) throw new Error(`${field} no puede quedar vacío`);
  return clean;
}

function plainWorkspaceText(value: string) {
  if (!value.startsWith(RICH_TEXT_PREFIX)) return value;
  try {
    const document = JSON.parse(value.slice(RICH_TEXT_PREFIX.length)) as {
      blocks?: Array<{ inlines?: Array<{ text?: unknown }> }>;
    };
    if (!Array.isArray(document.blocks)) return "";
    return document.blocks
      .map((block) =>
        Array.isArray(block.inlines)
          ? block.inlines
              .map((inline) =>
                typeof inline.text === "string" ? inline.text : "",
              )
              .join("")
          : "",
      )
      .join("\n");
  } catch {
    return "";
  }
}

async function deleteDriveFiles(
  options: WorkspaceServerOptions,
  fileIds: string[],
) {
  for (const reference of uniqueIds(fileIds)) {
    const fileId = reference.startsWith("gdrive:")
      ? reference.slice("gdrive:".length)
      : reference;
    const response = await fetch(
      `${options.origin}/api/drive/files/${encodeURIComponent(fileId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${options.accessToken}` },
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new Error("No se pudieron borrar todos los archivos vinculados");
  }
}

async function deleteProjectImage(
  options: WorkspaceServerOptions,
  reference: string,
) {
  if (reference.startsWith("gdrive:")) {
    await deleteDriveFiles(options, [reference]);
    return;
  }
  const removed = await options.client.storage
    .from("project-images")
    .remove([reference]);
  ensureNoError(removed.error, "No se pudo retirar la foto del proyecto");
}

function attachmentFilename(header: string | null, fallback: string) {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const basic = header?.match(/filename="?([^";]+)"?/i)?.[1];
  try {
    return decodeURIComponent(encoded || basic || fallback).slice(0, 180);
  } catch {
    return fallback;
  }
}

async function requireProject(client: SupabaseClient, projectId: string) {
  const { data, error } = await client
    .from("projects")
    .select("id,name,description,color,image_url,owner_id,archived,created_at")
    .eq("id", projectId)
    .single();
  if (error || !data) throw new Error("Proyecto no encontrado o sin acceso");
  return data as {
    id: string;
    name: string;
    description: string;
    color: string;
    image_url: string | null;
    owner_id: string;
    archived: boolean;
    created_at: string;
  };
}

async function requireTask(client: SupabaseClient, taskId: string) {
  const { data, error } = await client
    .from("tasks")
    .select(taskSelect)
    .eq("id", taskId)
    .single();
  if (error || !data) throw new Error("To-do no encontrado o sin acceso");
  return data as unknown as TaskRow;
}

async function validatePeopleForProject(
  client: SupabaseClient,
  projectId: string,
  personIds: string[],
) {
  const ids = uniqueIds(personIds);
  if (!ids.length) return ids;
  const project = await requireProject(client, projectId);
  const { data, error } = await client
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .in("user_id", ids);
  ensureNoError(error, "No se pudieron validar las personas");
  const allowed = new Set([
    project.owner_id,
    ...(data || []).map((item) => item.user_id),
  ]);
  const missing = ids.filter((id) => !allowed.has(id));
  if (missing.length)
    throw new Error(
      "Hay personas que todavía no pertenecen al proyecto; agrégalas primero con add_project_member",
    );
  return ids;
}

async function recordActivity(
  client: SupabaseClient,
  userId: string,
  projectId: string,
  taskId: string | null,
  verb: "created" | "moved" | "commented" | "completed" | "reopened" | "checked",
  detail: string,
) {
  await client.from("activity_events").insert({
    actor_id: userId,
    project_id: projectId,
    task_id: taskId,
    verb,
    detail: cleanUntrustedText(detail, 1800),
  });
}

async function sendTaskEmails(
  origin: string,
  token: string,
  taskId: string,
  notificationIds: string[],
  kind: "assignment" | "mention",
  detail: string,
) {
  if (!notificationIds.length) return false;
  try {
    const response = await fetch(`${origin}/api/notifications/email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskId, notificationIds, kind, detail }),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function createTaskNotifications(
  options: WorkspaceServerOptions,
  task: TaskRow,
  recipientIds: string[],
  kind: "assignment" | "mention" | "status" | "reaction" | "subscription",
  title: string,
  body: string,
) {
  const ids = uniqueIds(recipientIds).filter((id) => id !== options.user.id);
  if (!ids.length) return { created: 0, email_sent: false };
  const inserted = await options.client
    .from("notifications")
    .insert(
      ids.map((recipientId) => ({
        user_id: recipientId,
        actor_id: options.user.id,
        project_id: task.project_id,
        task_id: task.id,
        type: kind,
        title: cleanUntrustedText(title, 450),
        body: cleanUntrustedText(body, 4500),
      })),
    )
    .select("id");
  if (inserted.error || !inserted.data)
    return { created: 0, email_sent: false };
  const notificationIds = inserted.data.map((item) => item.id);
  const emailSent =
    kind === "assignment" || kind === "mention"
      ? await sendTaskEmails(
          options.origin,
          options.accessToken,
          task.id,
          notificationIds,
          kind,
          body,
        )
      : false;
  return { created: notificationIds.length, email_sent: emailSent };
}

async function notifyTaskFollowers(
  options: WorkspaceServerOptions,
  task: TaskRow,
  title: string,
  body: string,
) {
  const { data } = await options.client
    .from("task_subscriptions")
    .select("user_id")
    .eq("task_id", task.id);
  return createTaskNotifications(
    options,
    task,
    (data || []).map((item) => item.user_id),
    "subscription",
    title,
    body,
  );
}

async function createWorkspaceNotifications(
  client: SupabaseClient,
  actorId: string,
  recipientIds: string[],
  type: "announcement" | "reaction" | "subscription",
  title: string,
  body: string,
) {
  const ids = uniqueIds(recipientIds).filter((id) => id !== actorId);
  if (!ids.length) return { created: 0 };
  const result = await client
    .from("notifications")
    .insert(
      ids.map((recipientId) => ({
        user_id: recipientId,
        actor_id: actorId,
        project_id: null,
        task_id: null,
        type,
        title: cleanUntrustedText(title, 450),
        body: cleanUntrustedText(body, 4500),
      })),
    )
    .select("id");
  return { created: result.error ? 0 : (result.data || []).length };
}

async function replaceTaskLabels(
  client: SupabaseClient,
  taskId: string,
  projectId: string,
  labels: string[],
) {
  const cleanLabels = Array.from(
    new Set(
      labels
        .map((label) => cleanUntrustedText(label, 120))
        .filter(Boolean),
    ),
  ).slice(0, 20);
  const removed = await client
    .from("task_labels")
    .delete()
    .eq("task_id", taskId);
  ensureNoError(removed.error, "No se pudieron actualizar las etiquetas");
  if (!cleanLabels.length) return;
  const saved = await client
    .from("labels")
    .upsert(
      cleanLabels.map((name) => ({
        project_id: projectId,
        name,
        color: "#327B9F",
      })),
      { onConflict: "project_id,name" },
    )
    .select("id");
  ensureNoError(saved.error, "No se pudieron preparar las etiquetas");
  const linked = await client.from("task_labels").insert(
    (saved.data || []).map((label) => ({ task_id: taskId, label_id: label.id })),
  );
  ensureNoError(linked.error, "No se pudieron vincular las etiquetas");
}

async function replaceTaskSteps(
  client: SupabaseClient,
  taskId: string,
  steps: { title: string; completed: boolean }[],
) {
  const cleanSteps = steps
    .map((step) => ({
      title: cleanUntrustedText(step.title, 1000),
      completed: Boolean(step.completed),
    }))
    .filter((step) => step.title)
    .slice(0, 100);
  const removed = await client.from("task_steps").delete().eq("task_id", taskId);
  ensureNoError(removed.error, "No se pudo reemplazar el checklist");
  if (!cleanSteps.length) return;
  const inserted = await client.from("task_steps").insert(
    cleanSteps.map((step, position) => ({
      task_id: taskId,
      title: step.title,
      completed: step.completed,
      position,
    })),
  );
  ensureNoError(inserted.error, "No se pudo guardar el checklist");
}

async function taskWithPeople(client: SupabaseClient, taskId: string) {
  const task = await requireTask(client, taskId);
  const assigneeIds = (task.task_assignees || []).map((item) => item.user_id);
  const [{ data: people }, { data: comments, error: commentError }] =
    await Promise.all([
      assigneeIds.length
        ? client
            .from("profiles")
            .select("id,full_name,email,avatar_url,areas(name)")
            .in("id", assigneeIds)
        : Promise.resolve({ data: [], error: null }),
      client
        .from("comments")
        .select("id,body,author_id,created_at,comment_reactions(user_id,emoji),comment_attachments(id,drive_file_id,file_name,mime_type,size_bytes,created_at)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);
  ensureNoError(commentError, "No se pudieron cargar los comentarios");
  const authorIds = uniqueIds(
    (comments || []).map((comment) => comment.author_id),
  );
  const { data: authors } = authorIds.length
    ? await client
        .from("profiles")
        .select("id,full_name,email,avatar_url")
        .in("id", authorIds)
    : { data: [] };
  const authorById = new Map((authors || []).map((item) => [item.id, item]));
  return {
    ...normalizeTask(task),
    assignees: people || [],
    comments: (comments || []).map((comment) => ({
      ...comment,
      author: authorById.get(comment.author_id) || null,
    })),
  };
}

export function createWorkspaceMcpServer(options: WorkspaceServerOptions) {
  const { client, user } = options;
  const server = new McpServer(
    { name: "spartanblue", version: "1.0.0" },
    {
      instructions:
        "Opera Spartanblue con los permisos del usuario conectado. Al iniciar, consulta workspace_overview. Antes de modificar, resuelve IDs reales con las herramientas de lectura; nunca inventes IDs ni personas. Para mejorar un to-do, lee get_task, conserva la intención y actualiza contenido/checklist. Sin asignar solo existe en Mesa de tickets. Pide confirmación explícita antes de borrar y usa el texto exacto requerido por la herramienta.",
    },
  );

  server.registerTool(
    "workspace_overview",
    {
      title: "Entender el Workspace",
      description:
        "Primera herramienta a usar. Explica la estructura del Workspace y devuelve proyectos, carga personal y reglas importantes.",
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async () =>
      runTool(async () => {
        const [{ data: projects, error: projectError }, { data: tasks, error: taskError }] =
          await Promise.all([
            client
              .from("projects")
              .select("id,name,description,color,image_url,owner_id,archived,created_at")
              .eq("archived", false)
              .order("created_at", { ascending: false })
              .limit(100),
            client
              .from("tasks")
              .select(taskSelect)
              .neq("status", "backlog")
              .order("updated_at", { ascending: false })
              .limit(500),
          ]);
        ensureNoError(projectError, "No se pudieron cargar los proyectos");
        ensureNoError(taskError, "No se pudieron cargar las tareas");
        const normalized = ((tasks || []) as unknown as TaskRow[]).map(normalizeTask);
        const mine = normalized.filter(
          (task) =>
            task.status !== "done" && task.assignee_ids.includes(user.id),
        );
        return {
          summary: `Workspace listo: ${(projects || []).length} proyectos y ${mine.length} tareas pendientes asignadas al usuario.`,
          result: {
            workspace: "Spartanblue",
            current_user_id: user.id,
            current_user_email: user.email || "",
            rules: [
              "Los proyectos son los espacios principales de trabajo.",
              "Estados: Por hacer, En curso, En revisión y Hecho.",
              "Sin asignar se usa únicamente dentro de Mesa de tickets.",
              "Backlog representa plantillas/presets; no debe mostrarse como una columna normal.",
              "Mensajes son generales para todo el Workspace; las minutas pertenecen a un proyecto.",
              "Asignaciones y menciones generan notificaciones; el correo se intenta enviar al correo registrado.",
              "Para mejorar una tarea, primero hay que leerla y conservar datos útiles y avances existentes.",
            ],
            projects: (projects || []).map((project) => ({
              ...project,
              url: projectLink(project.id),
            })),
            my_pending_tasks: mine.slice(0, 100),
          },
        };
      }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "Listar proyectos",
      description: "Busca proyectos accesibles por nombre y estado archivado.",
      inputSchema: {
        query: z.string().max(200).optional(),
        include_archived: z.boolean().default(false),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({ query, include_archived }) =>
      runTool(async () => {
        let request = client
          .from("projects")
          .select("id,name,description,color,image_url,owner_id,archived,created_at")
          .order("created_at", { ascending: false })
          .limit(100);
        if (!include_archived) request = request.eq("archived", false);
        const { data, error } = await request;
        ensureNoError(error, "No se pudieron cargar los proyectos");
        const needle = (query || "").trim().toLocaleLowerCase("es-MX");
        const projects = (needle
          ? (data || []).filter((project) =>
              `${project.name} ${project.description}`
                .toLocaleLowerCase("es-MX")
                .includes(needle),
            )
          : data || []).map((project) => ({
            ...project,
            url: projectLink(project.id),
          }));
        return {
          summary: `Se encontraron ${projects.length} proyectos.`,
          result: { projects },
        };
      }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Ver proyecto",
      description:
        "Obtiene un proyecto, sus integrantes y un resumen de tareas por estado.",
      inputSchema: { project_id: z.string().uuid() },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({ project_id }) =>
      runTool(async () => {
        const project = await requireProject(client, project_id);
        const [{ data: memberships }, { data: tasks, error: taskError }] =
          await Promise.all([
            client
              .from("project_members")
              .select("user_id,role,created_at")
              .eq("project_id", project_id),
            client
              .from("tasks")
              .select(taskSelect)
              .eq("project_id", project_id)
              .order("updated_at", { ascending: false })
              .limit(500),
          ]);
        ensureNoError(taskError, "No se pudieron cargar las tareas");
        const memberIds = uniqueIds([
          project.owner_id,
          ...(memberships || []).map((item) => item.user_id),
        ]);
        const { data: people } = await client
          .from("profiles")
          .select("id,full_name,email,avatar_url,role,areas(name)")
          .in("id", memberIds);
        const normalized = ((tasks || []) as unknown as TaskRow[]).map(normalizeTask);
        const counts = Object.fromEntries(
          STATUS_VALUES.map((status) => [
            status,
            normalized.filter((task) => task.status === status).length,
          ]),
        );
        return {
          summary: `${project.name}: ${memberIds.length} integrantes y ${normalized.length} tareas.`,
          result: {
            project: { ...project, url: projectLink(project.id) },
            members: people || [],
            task_counts: counts,
            recent_tasks: normalized.slice(0, 30),
          },
        };
      }),
  );

  server.registerTool(
    "list_people",
    {
      title: "Buscar personas",
      description:
        "Busca personas registradas. Con project_id devuelve únicamente integrantes asignables de ese proyecto.",
      inputSchema: {
        query: z.string().max(200).optional(),
        project_id: z.string().uuid().optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({ query, project_id }) =>
      runTool(async () => {
        let allowedIds: Set<string> | null = null;
        if (project_id) {
          const project = await requireProject(client, project_id);
          const { data } = await client
            .from("project_members")
            .select("user_id")
            .eq("project_id", project_id);
          allowedIds = new Set([
            project.owner_id,
            ...(data || []).map((item) => item.user_id),
          ]);
        }
        const { data, error } = await client
          .from("profiles")
          .select("id,full_name,email,avatar_url,role,areas(name)")
          .order("full_name")
          .limit(200);
        ensureNoError(error, "No se pudieron cargar las personas");
        const needle = (query || "").trim().toLocaleLowerCase("es-MX");
        const people = (data || []).filter((person) => {
          if (allowedIds && !allowedIds.has(person.id)) return false;
          const area = relationOne(person.areas)?.name || "";
          return !needle
            ? true
            : `${person.full_name} ${person.email} ${area}`
                .toLocaleLowerCase("es-MX")
                .includes(needle);
        });
        return {
          summary: `Se encontraron ${people.length} personas.`,
          result: { people },
        };
      }),
  );

  server.registerTool(
    "search_tasks",
    {
      title: "Buscar to-dos",
      description:
        "Busca tareas accesibles por proyecto, texto, estado, responsable y fechas. Devuelve IDs utilizables en otras herramientas.",
      inputSchema: {
        query: z.string().max(300).optional(),
        project_id: z.string().uuid().optional(),
        status: z.enum(STATUS_VALUES).optional(),
        assignee_id: z.string().uuid().optional(),
        due_before: z.string().date().optional(),
        due_after: z.string().date().optional(),
        include_done: z.boolean().default(true),
        limit: z.number().int().min(1).max(100).default(50),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({
      query,
      project_id,
      status,
      assignee_id,
      due_before,
      due_after,
      include_done,
      limit,
    }) =>
      runTool(async () => {
        let request = client
          .from("tasks")
          .select(taskSelect)
          .order("updated_at", { ascending: false })
          .limit(500);
        if (project_id) request = request.eq("project_id", project_id);
        if (status) request = request.eq("status", status);
        if (!include_done && !status) request = request.neq("status", "done");
        if (due_before) request = request.lte("due_date", due_before);
        if (due_after) request = request.gte("due_date", due_after);
        const { data, error } = await request;
        ensureNoError(error, "No se pudieron buscar los to-dos");
        const needle = (query || "").trim().toLocaleLowerCase("es-MX");
        const tasks = ((data || []) as unknown as TaskRow[])
          .map(normalizeTask)
          .filter((task) =>
            assignee_id ? task.assignee_ids.includes(assignee_id) : true,
          )
          .filter((task) =>
            needle
              ? `${task.title} ${task.description} ${task.project_name} ${task.labels.map((label) => label.name).join(" ")}`
                  .toLocaleLowerCase("es-MX")
                  .includes(needle)
              : true,
          )
          .slice(0, limit);
        return {
          summary: `Se encontraron ${tasks.length} to-dos.`,
          result: { tasks },
        };
      }),
  );

  server.registerTool(
    "get_task",
    {
      title: "Leer to-do completo",
      description:
        "Lee contexto, instrucciones, responsables, etiquetas, checklist y comentarios antes de modificar o mejorar un to-do.",
      inputSchema: { task_id: z.string().uuid() },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({ task_id }) =>
      runTool(async () => {
        const task = await taskWithPeople(client, task_id);
        return {
          summary: `To-do leído: ${task.title}.`,
          result: { task },
        };
      }),
  );

  server.registerTool(
    "get_comment_image",
    {
      title: "Ver imagen de un comentario",
      description:
        "Descarga una imagen adjunta accesible para que el agente pueda verla y comprenderla.",
      inputSchema: { attachment_id: z.string().uuid() },
      outputSchema: RESULT_SCHEMA,
      annotations: externalReadAnnotations,
    },
    async ({ attachment_id }) => {
      try {
        const { data: attachment, error } = await client
          .from("comment_attachments")
          .select("id,comment_id,drive_file_id,file_name,mime_type,size_bytes")
          .eq("id", attachment_id)
          .single();
        if (error || !attachment)
          throw new Error("Imagen no encontrada o sin acceso");
        const response = await fetch(
          `${options.origin}/api/drive/files/${encodeURIComponent(attachment.drive_file_id)}`,
          {
            headers: { Authorization: `Bearer ${options.accessToken}` },
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error("No se pudo abrir la imagen");
        const image = Buffer.from(await response.arrayBuffer());
        if (!image.byteLength || image.byteLength > 50 * 1024 * 1024)
          throw new Error("La imagen está vacía o excede 50 MB");
        const result = {
          attachment_id,
          comment_id: attachment.comment_id,
          file_name: attachment.file_name,
          mime_type: attachment.mime_type,
          size_bytes: image.byteLength,
        };
        return {
          structuredContent: { result },
          content: [
            {
              type: "text" as const,
              text: `Imagen adjunta: ${attachment.file_name}`,
            },
            {
              type: "image" as const,
              data: image.toString("base64"),
              mimeType: attachment.mime_type,
            },
          ],
        };
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "list_templates",
    {
      title: "Listar plantillas",
      description:
        "Lista los presets del backlog con sus instrucciones y checklist base.",
      inputSchema: { query: z.string().max(200).optional() },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({ query }) =>
      runTool(async () => {
        const { data, error } = await client
          .from("templates")
          .select("id,name,description,area_id,creator_id,created_at,template_steps(id,title,position)")
          .order("created_at", { ascending: false })
          .limit(100);
        ensureNoError(error, "No se pudieron cargar las plantillas");
        const needle = (query || "").trim().toLocaleLowerCase("es-MX");
        const templates = (data || [])
          .filter((template) =>
            needle
              ? `${template.name} ${template.description}`
                  .toLocaleLowerCase("es-MX")
                  .includes(needle)
              : true,
          )
          .map((template) => ({
            ...template,
            template_steps: [...(template.template_steps || [])].sort(
              (first, second) => first.position - second.position,
            ),
          }));
        return {
          summary: `Se encontraron ${templates.length} plantillas.`,
          result: { templates },
        };
      }),
  );

  server.registerTool(
    "create_task",
    {
      title: "Crear to-do",
      description:
        "Crea un to-do completo en un proyecto. Puede tomar instrucciones y steps de una plantilla. Usa IDs reales de personas ya integrantes del proyecto.",
      inputSchema: {
        project_id: z.string().uuid(),
        title: z.string().min(1).max(500),
        description: z.string().max(50_000).default(""),
        status: z.enum(STATUS_VALUES).default("todo"),
        priority: z.enum(PRIORITY_VALUES).default("medium"),
        due_date: z.string().date().nullable().optional(),
        assignee_ids: z.array(z.string().uuid()).max(50).default([]),
        labels: z.array(z.string().min(1).max(120)).max(20).default([]),
        steps: z
          .array(
            z.object({
              title: z.string().min(1).max(1000),
              completed: z.boolean().default(false),
            }),
          )
          .max(100)
          .optional(),
        template_id: z.string().uuid().optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async (input) =>
      runTool(async () => {
        const project = await requireProject(client, input.project_id);
        if (input.status === "unassigned" && !isTicketProjectName(project.name))
          throw new Error("Sin asignar solo puede usarse en Mesa de tickets");
        const assigneeIds = await validatePeopleForProject(
          client,
          input.project_id,
          input.assignee_ids,
        );
        const targetStatus =
          input.status === "unassigned" && assigneeIds.length
            ? "todo"
            : input.status;
        let description = cleanUntrustedText(input.description, 50_000);
        let steps = input.steps;
        if (input.template_id) {
          const { data: template, error } = await client
            .from("templates")
            .select("id,name,description,template_steps(title,position)")
            .eq("id", input.template_id)
            .single();
          if (error || !template) throw new Error("Plantilla no encontrada");
          if (!description) description = template.description || "";
          if (steps === undefined)
            steps = [...(template.template_steps || [])]
              .sort((first, second) => first.position - second.position)
              .map((step) => ({ title: step.title, completed: false }));
        }
        const { data: lastPosition } = await client
          .from("tasks")
          .select("position")
          .eq("project_id", input.project_id)
          .eq("status", targetStatus)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const inserted = await client
          .from("tasks")
          .insert({
            project_id: input.project_id,
            title: safeText(input.title, 500, "El título"),
            description,
            status: targetStatus,
            priority: input.priority,
            due_date: input.due_date || null,
            position: (lastPosition?.position || 0) + 1,
            created_by: user.id,
          })
          .select(taskSelect)
          .single();
        ensureNoError(inserted.error, "No se pudo crear el to-do");
        if (!inserted.data) throw new Error("No se pudo crear el to-do");
        const taskId = inserted.data.id;
        try {
          if (assigneeIds.length) {
            const assignments = await client.from("task_assignees").insert(
              assigneeIds.map((personId) => ({
                task_id: taskId,
                user_id: personId,
              })),
            );
            ensureNoError(assignments.error, "No se pudieron asignar las personas");
          }
          if (steps !== undefined)
            await replaceTaskSteps(client, taskId, steps);
          if (input.labels.length)
            await replaceTaskLabels(
              client,
              taskId,
              input.project_id,
              input.labels,
            );
        } catch (error) {
          await client.from("tasks").delete().eq("id", taskId);
          throw error;
        }
        const saved = await requireTask(client, taskId);
        await recordActivity(
          client,
          user.id,
          input.project_id,
          taskId,
          "created",
          `Creó “${saved.title}” mediante el agente`,
        );
        const notifications = await createTaskNotifications(
          options,
          saved,
          assigneeIds,
          "assignment",
          "Te asignaron un to-do",
          saved.title,
        );
        return {
          summary: `To-do creado: ${saved.title}.`,
          result: {
            task: normalizeTask(saved),
            notifications,
          },
        };
      }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Mejorar o editar to-do",
      description:
        "Edita título, contexto, prioridad, fecha, etiquetas o reemplaza el checklist completo. Lee get_task antes para conservar información y avances.",
      inputSchema: {
        task_id: z.string().uuid(),
        title: z.string().min(1).max(500).optional(),
        description: z.string().max(50_000).optional(),
        priority: z.enum(PRIORITY_VALUES).optional(),
        due_date: z.string().date().nullable().optional(),
        labels: z.array(z.string().min(1).max(120)).max(20).optional(),
        steps: z
          .array(
            z.object({
              title: z.string().min(1).max(1000),
              completed: z.boolean(),
            }),
          )
          .max(100)
          .optional(),
        change_note: z.string().max(500).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async (input) =>
      runTool(async () => {
        const current = await requireTask(client, input.task_id);
        const update: Record<string, unknown> = {};
        if (input.title !== undefined)
          update.title = safeText(input.title, 500, "El título");
        if (input.description !== undefined)
          update.description = cleanUntrustedText(input.description, 50_000);
        if (input.priority !== undefined) update.priority = input.priority;
        if (input.due_date !== undefined) update.due_date = input.due_date;
        if (
          !Object.keys(update).length &&
          input.labels === undefined &&
          input.steps === undefined
        )
          throw new Error("No se indicó ningún cambio");
        if (Object.keys(update).length) {
          const changed = await client
            .from("tasks")
            .update(update)
            .eq("id", input.task_id);
          ensureNoError(changed.error, "No se pudo actualizar el to-do");
        }
        if (input.labels !== undefined)
          await replaceTaskLabels(
            client,
            input.task_id,
            current.project_id,
            input.labels,
          );
        if (input.steps !== undefined)
          await replaceTaskSteps(client, input.task_id, input.steps);
        const saved = await taskWithPeople(client, input.task_id);
        const notifications = await notifyTaskFollowers(
          options,
          await requireTask(client, input.task_id),
          "To-do actualizado",
          saved.title,
        );
        return {
          summary: `To-do actualizado: ${saved.title}.`,
          result: {
            task: saved,
            change_note: cleanUntrustedText(
              input.change_note || "Actualización solicitada por el usuario",
              500,
            ),
            notifications,
          },
        };
      }),
  );

  server.registerTool(
    "move_task",
    {
      title: "Mover to-do",
      description:
        "Cambia el estado de una tarea y/o la mueve a otro proyecto accesible. Hecho significa terminada; unassigned solo es válido en Mesa de tickets. Para cerrar un ticket externo exige la resolución que se enviará por correo.",
      inputSchema: {
        task_id: z.string().uuid(),
        status: z.enum(STATUS_VALUES).optional(),
        target_project_id: z.string().uuid().optional(),
        resolution: z.string().trim().min(3).max(10_000).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ task_id, status, target_project_id, resolution }) =>
      runTool(async () => {
        if (!status && !target_project_id)
          throw new Error("Indica un estado o un proyecto de destino");
        const current = await requireTask(client, task_id);
        let destinationProjectId = current.project_id;
        let destinationProject = await requireProject(client, current.project_id);
        if (target_project_id && target_project_id !== current.project_id) {
          destinationProject = await requireProject(client, target_project_id);
          destinationProjectId = target_project_id;
        }
        let nextStatus = status || current.status;
        if (
          nextStatus === "unassigned" &&
          target_project_id &&
          !status &&
          !isTicketProjectName(destinationProject.name)
        )
          nextStatus = "todo";
        if (
          nextStatus === "unassigned" &&
          !isTicketProjectName(destinationProject.name)
        )
          throw new Error("Sin asignar solo puede usarse en Mesa de tickets");
        const resolvingExternalTicket =
          current.external_source === "ticket_system" &&
          current.status !== "done" &&
          nextStatus === "done";
        if (resolvingExternalTicket && !resolution)
          throw new Error(
            "Indica la resolución que se enviará por correo al solicitante antes de marcar el ticket como hecho.",
          );
        if (resolvingExternalTicket) {
          const response = await fetch(`${options.origin}/api/tickets/resolve`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${options.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ taskId: task_id, resolution }),
            cache: "no-store",
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(
              payload.error ||
                "No se pudo enviar la resolución; el ticket sigue abierto.",
            );
          }
        }
        if (destinationProjectId !== current.project_id) {
          const moved = await client.rpc("move_task_to_project", {
            p_task_id: task_id,
            p_target_project_id: destinationProjectId,
          });
          ensureNoError(moved.error, "No se pudo mover al proyecto de destino");
        }
        if (
          !resolvingExternalTicket &&
          (nextStatus !== current.status || destinationProjectId !== current.project_id)
        ) {
          const updated = await client
            .from("tasks")
            .update({ status: nextStatus })
            .eq("id", task_id);
          ensureNoError(updated.error, "No se pudo cambiar el estado");
        }
        if (nextStatus === "unassigned") {
          const unassigned = await client
            .from("task_assignees")
            .delete()
            .eq("task_id", task_id);
          ensureNoError(unassigned.error, "No se pudieron retirar los responsables");
        }
        const saved = await requireTask(client, task_id);
        const verb =
          saved.status === "done"
            ? "completed"
            : current.status === "done"
              ? "reopened"
              : "moved";
        await recordActivity(
          client,
          user.id,
          saved.project_id,
          task_id,
          verb,
          `Movió “${saved.title}” a ${saved.status}${destinationProjectId !== current.project_id ? ` en ${destinationProject.name}` : ""}`,
        );
        const notifications = await createTaskNotifications(
          options,
          saved,
          (saved.task_assignees || []).map((item) => item.user_id),
          "status",
          "Estado actualizado",
          `${saved.title} pasó a ${saved.status}`,
        );
        const followerNotifications = await notifyTaskFollowers(
          options,
          saved,
          "Estado actualizado",
          `${saved.title} pasó a ${saved.status}`,
        );
        return {
          summary: resolvingExternalTicket
            ? `Ticket resuelto: ${saved.title}. La resolución fue enviada por correo.`
            : `To-do movido: ${saved.title} ahora está en ${saved.status}.`,
          result: {
            task: normalizeTask(saved),
            notifications,
            follower_notifications: followerNotifications,
          },
        };
      }),
  );

  server.registerTool(
    "assign_task",
    {
      title: "Asignar o desasignar personas",
      description:
        "Agrega, quita o reemplaza responsables de un to-do. Las personas deben pertenecer al proyecto.",
      inputSchema: {
        task_id: z.string().uuid(),
        person_ids: z.array(z.string().uuid()).max(50),
        mode: z.enum(["add", "remove", "replace"]),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ task_id, person_ids, mode }) =>
      runTool(async () => {
        const task = await requireTask(client, task_id);
        const currentIds = (task.task_assignees || []).map((item) => item.user_id);
        const requested = uniqueIds(person_ids);
        if (mode !== "remove")
          await validatePeopleForProject(client, task.project_id, requested);
        const nextIds =
          mode === "add"
            ? uniqueIds([...currentIds, ...requested])
            : mode === "remove"
              ? currentIds.filter((id) => !requested.includes(id))
              : requested;
        await validatePeopleForProject(client, task.project_id, nextIds);
        const removed = await client
          .from("task_assignees")
          .delete()
          .eq("task_id", task_id);
        ensureNoError(removed.error, "No se pudieron actualizar responsables");
        if (nextIds.length) {
          const inserted = await client.from("task_assignees").insert(
            nextIds.map((personId) => ({
              task_id,
              user_id: personId,
            })),
          );
          ensureNoError(inserted.error, "No se pudieron guardar responsables");
        }
        const project = await requireProject(client, task.project_id);
        const nextStatus =
          nextIds.length > 0 && task.status === "unassigned"
            ? "todo"
            : nextIds.length === 0 && isTicketProjectName(project.name)
              ? "unassigned"
              : task.status;
        if (nextStatus !== task.status) {
          const statusUpdate = await client
            .from("tasks")
            .update({ status: nextStatus })
            .eq("id", task_id);
          ensureNoError(statusUpdate.error, "No se pudo ajustar el estado del to-do");
        }
        const newlyAssigned = nextIds.filter((id) => !currentIds.includes(id));
        await client.from("task_subscriptions").upsert(
          { task_id, user_id: user.id },
          { onConflict: "task_id,user_id" },
        );
        const saved = await requireTask(client, task_id);
        const notifications = await createTaskNotifications(
          options,
          saved,
          newlyAssigned,
          "assignment",
          "Te asignaron un to-do",
          saved.title,
        );
        return {
          summary: `Responsables actualizados en ${saved.title}.`,
          result: {
            task: normalizeTask(saved),
            added_person_ids: newlyAssigned,
            removed_person_ids: currentIds.filter((id) => !nextIds.includes(id)),
            notifications,
          },
        };
      }),
  );

  server.registerTool(
    "comment_task",
    {
      title: "Comentar to-do",
      description:
        "Publica un comentario o actualización de estatus. mention_person_ids etiqueta personas y dispara notificación y correo.",
      inputSchema: {
        task_id: z.string().uuid(),
        body: z.string().min(1).max(10_000),
        mention_person_ids: z.array(z.string().uuid()).max(20).default([]),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ task_id, body, mention_person_ids }) =>
      runTool(async () => {
        let task = await requireTask(client, task_id);
        const mentions = await validatePeopleForProject(
          client,
          task.project_id,
          mention_person_ids,
        );
        const cleanBody = safeText(body, 10_000, "El comentario");
        const inserted = await client
          .from("comments")
          .insert({ task_id, author_id: user.id, body: cleanBody })
          .select("id,body,author_id,created_at")
          .single();
        ensureNoError(inserted.error, "No se pudo publicar el comentario");
        if (mentions.length) {
          const assigned = await client.from("task_assignees").upsert(
            mentions.map((personId) => ({ task_id, user_id: personId })),
            { onConflict: "task_id,user_id" },
          );
          ensureNoError(assigned.error, "El comentario se guardó, pero no se pudo asignar a las personas mencionadas");
          if (task.status === "unassigned") {
            const moved = await client
              .from("tasks")
              .update({ status: "todo" })
              .eq("id", task_id);
            ensureNoError(moved.error, "No se pudo sacar el to-do de Sin asignar");
          }
          task = await requireTask(client, task_id);
        }
        await recordActivity(
          client,
          user.id,
          task.project_id,
          task_id,
          "commented",
          `Comentó en “${task.title}” mediante el agente`,
        );
        const notifications = await createTaskNotifications(
          options,
          task,
          mentions,
          "mention",
          "Te mencionaron en un comentario",
          cleanBody,
        );
        const followerNotifications = await notifyTaskFollowers(
          options,
          task,
          "Nuevo comentario en un to-do que sigues",
          `${task.title}: ${cleanBody.slice(0, 140)}`,
        );
        return {
          summary: `Comentario publicado en ${task.title}.`,
          result: {
            comment: inserted.data,
            task: normalizeTask(task),
            notifications,
            follower_notifications: followerNotifications,
          },
        };
      }),
  );

  server.registerTool(
    "copy_task",
    {
      title: "Copiar to-do",
      description:
        "Copia contenido, responsables, etiquetas y steps a otro proyecto. Los steps copiados comienzan sin marcar.",
      inputSchema: {
        task_id: z.string().uuid(),
        target_project_id: z.string().uuid(),
        status: z.enum(STATUS_VALUES).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ task_id, target_project_id, status }) =>
      runTool(async () => {
        const source = await requireTask(client, task_id);
        const destination = await requireProject(client, target_project_id);
        const nextStatus = status || source.status;
        if (nextStatus === "unassigned" && !isTicketProjectName(destination.name))
          throw new Error("Sin asignar solo puede usarse en Mesa de tickets");
        const copied = await client.rpc("copy_task_to_project", {
          p_task_id: task_id,
          p_target_project_id: target_project_id,
          p_status: nextStatus,
        });
        ensureNoError(copied.error, "No se pudo copiar el to-do");
        if (!copied.data) throw new Error("La copia no devolvió un to-do válido");
        const saved = await requireTask(client, copied.data as string);
        await recordActivity(
          client,
          user.id,
          target_project_id,
          saved.id,
          "created",
          `Copió “${source.title}” en ${destination.name}`,
        );
        return {
          summary: `To-do copiado en ${destination.name}.`,
          result: { source_task_id: task_id, task: normalizeTask(saved) },
        };
      }),
  );

  server.registerTool(
    "set_task_step",
    {
      title: "Actualizar un step",
      description:
        "Marca, desmarca o cambia el texto de un step sin reemplazar el checklist completo.",
      inputSchema: {
        task_id: z.string().uuid(),
        step_id: z.string().uuid(),
        completed: z.boolean().optional(),
        title: z.string().min(1).max(1000).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ task_id, step_id, completed, title }) =>
      runTool(async () => {
        const task = await requireTask(client, task_id);
        const step = (task.task_steps || []).find((item) => item.id === step_id);
        if (!step) throw new Error("El step no pertenece a este to-do");
        if (completed === undefined && title === undefined)
          throw new Error("Indica si se completa o un nuevo texto");
        const update: Record<string, unknown> = {};
        if (completed !== undefined) update.completed = completed;
        if (title !== undefined) update.title = safeText(title, 1000, "El step");
        const changed = await client
          .from("task_steps")
          .update(update)
          .eq("id", step_id)
          .eq("task_id", task_id);
        ensureNoError(changed.error, "No se pudo actualizar el step");
        if (completed !== undefined) {
          await recordActivity(
            client,
            user.id,
            task.project_id,
            task_id,
            "checked",
            `${completed ? "Completó" : "Reabrió"} el step “${title || step.title}”`,
          );
        }
        const saved = await requireTask(client, task_id);
        const notifications = await notifyTaskFollowers(
          options,
          saved,
          "Checklist actualizado",
          `${saved.title}: ${title || step.title}`,
        );
        return {
          summary: `Step actualizado en ${saved.title}.`,
          result: { task: normalizeTask(saved), notifications },
        };
      }),
  );

  server.registerTool(
    "react_to_task",
    {
      title: "Reaccionar a un to-do",
      description:
        "Agrega o cambia la reacción del usuario conectado. Usa null para retirar su reacción.",
      inputSchema: {
        task_id: z.string().uuid(),
        emoji: z.enum(REACTION_VALUES).nullable(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ task_id, emoji }) =>
      runTool(async () => {
        await requireTask(client, task_id);
        const result = emoji
          ? await client.from("task_reactions").upsert(
              { task_id, user_id: user.id, emoji },
              { onConflict: "task_id,user_id" },
            )
          : await client
              .from("task_reactions")
              .delete()
              .eq("task_id", task_id)
              .eq("user_id", user.id);
        ensureNoError(result.error, "No se pudo actualizar la reacción");
        const saved = await requireTask(client, task_id);
        return {
          summary: emoji ? `Reacción ${emoji} guardada.` : "Reacción retirada.",
          result: { task: normalizeTask(saved), own_reaction: emoji },
        };
      }),
  );

  server.registerTool(
    "follow_task",
    {
      title: "Seguir o dejar de seguir un to-do",
      description:
        "Activa o desactiva el seguimiento para recibir sus actualizaciones.",
      inputSchema: {
        task_id: z.string().uuid(),
        following: z.boolean(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ task_id, following }) =>
      runTool(async () => {
        await requireTask(client, task_id);
        const result = following
          ? await client.from("task_subscriptions").upsert(
              { task_id, user_id: user.id },
              { onConflict: "task_id,user_id" },
            )
          : await client
              .from("task_subscriptions")
              .delete()
              .eq("task_id", task_id)
              .eq("user_id", user.id);
        ensureNoError(result.error, "No se pudo actualizar el seguimiento");
        return {
          summary: following ? "Ahora sigues este to-do." : "Dejaste de seguir este to-do.",
          result: { task_id, following },
        };
      }),
  );

  server.registerTool(
    "react_to_comment",
    {
      title: "Reaccionar a un comentario",
      description:
        "Agrega o cambia la reacción del usuario conectado en un comentario. Usa null para retirarla.",
      inputSchema: {
        comment_id: z.string().uuid(),
        emoji: z.enum(REACTION_VALUES).nullable(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ comment_id, emoji }) =>
      runTool(async () => {
        const { data: comment, error } = await client
          .from("comments")
          .select("id,task_id,author_id,body")
          .eq("id", comment_id)
          .single();
        if (error || !comment) throw new Error("Comentario no encontrado o sin acceso");
        const task = await requireTask(client, comment.task_id);
        const result = emoji
          ? await client.from("comment_reactions").upsert(
              { comment_id, user_id: user.id, emoji },
              { onConflict: "comment_id,user_id" },
            )
          : await client
              .from("comment_reactions")
              .delete()
              .eq("comment_id", comment_id)
              .eq("user_id", user.id);
        ensureNoError(result.error, "No se pudo actualizar la reacción");
        const notifications = emoji
          ? await createTaskNotifications(
              options,
              task,
              [comment.author_id],
              "reaction",
              `Reaccionaron ${emoji} a tu comentario`,
              `${task.title}: ${comment.body.slice(0, 120)}`,
            )
          : { created: 0, email_sent: false };
        return {
          summary: emoji ? `Reacción ${emoji} guardada.` : "Reacción retirada.",
          result: { comment_id, own_reaction: emoji, notifications },
        };
      }),
  );

  server.registerTool(
    "delete_comment",
    {
      title: "Borrar comentario",
      description:
        "Borra un comentario y sus imágenes vinculadas. Requiere confirmar exactamente sus primeros 120 caracteres.",
      inputSchema: {
        comment_id: z.string().uuid(),
        confirm_text: z.string().min(1).max(120),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: destructiveAnnotations,
    },
    async ({ comment_id, confirm_text }) =>
      runTool(async () => {
        const { data: comment, error } = await client
          .from("comments")
          .select("id,task_id,body,comment_attachments(drive_file_id)")
          .eq("id", comment_id)
          .single();
        if (error || !comment) throw new Error("Comentario no encontrado o sin acceso");
        await requireTask(client, comment.task_id);
        const expected = comment.body.slice(0, 120);
        if (confirm_text !== expected)
          throw new Error("La confirmación no coincide con el comentario");
        await deleteDriveFiles(
          options,
          (comment.comment_attachments || []).map((item) => item.drive_file_id),
        );
        const deleted = await client.from("comments").delete().eq("id", comment_id);
        ensureNoError(deleted.error, "No se pudo borrar el comentario");
        return {
          summary: "Comentario borrado.",
          result: { deleted_comment_id: comment_id, task_id: comment.task_id },
        };
      }),
  );

  server.registerTool(
    "delete_task",
    {
      title: "Borrar to-do",
      description:
        "Borra definitivamente un to-do. Solo usar después de confirmación explícita del usuario; confirm_title debe coincidir exactamente con el título actual.",
      inputSchema: {
        task_id: z.string().uuid(),
        confirm_title: z.string().min(1).max(500),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: destructiveAnnotations,
    },
    async ({ task_id, confirm_title }) =>
      runTool(async () => {
        const task = await requireTask(client, task_id);
        if (confirm_title !== task.title)
          throw new Error(
            "La confirmación no coincide con el título exacto del to-do",
          );
        const { data: taskComments } = await client
          .from("comments")
          .select("comment_attachments(drive_file_id)")
          .eq("task_id", task_id);
        await deleteDriveFiles(
          options,
          (taskComments || []).flatMap((comment) =>
            (comment.comment_attachments || []).map((item) => item.drive_file_id),
          ),
        );
        const deleted = await client.from("tasks").delete().eq("id", task_id);
        ensureNoError(deleted.error, "No se pudo borrar el to-do");
        return {
          summary: `To-do borrado: ${task.title}.`,
          result: { deleted_task_id: task_id, deleted_title: task.title },
        };
      }),
  );

  server.registerTool(
    "create_project",
    {
      title: "Crear proyecto",
      description: "Crea un proyecto nuevo propiedad del usuario conectado.",
      inputSchema: {
        name: z.string().min(1).max(200),
        description: z.string().max(20_000).default(""),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#327B9F"),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ name, description, color }) =>
      runTool(async () => {
        const cleanName = safeText(name, 200, "El nombre");
        if (isTicketProjectName(cleanName))
          throw new Error("Mesa de tickets es un espacio reservado del sistema");
        const inserted = await client
          .from("projects")
          .insert({
            name: cleanName,
            description: cleanUntrustedText(description, 20_000),
            color,
            owner_id: user.id,
          })
          .select("id,name,description,color,image_url,owner_id,archived,created_at")
          .single();
        ensureNoError(inserted.error, "No se pudo crear el proyecto");
        return {
          summary: `Proyecto creado: ${inserted.data?.name}.`,
          result: {
            project: inserted.data
              ? { ...inserted.data, url: projectLink(inserted.data.id) }
              : null,
          },
        };
      }),
  );

  server.registerTool(
    "update_project",
    {
      title: "Editar proyecto",
      description:
        "Cambia nombre, descripción, color o archivado. Supabase permite la acción únicamente al propietario.",
      inputSchema: {
        project_id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(20_000).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        archived: z.boolean().optional(),
        remove_image: z.boolean().default(false),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ project_id, name, description, color, archived, remove_image }) =>
      runTool(async () => {
        const project = await requireProject(client, project_id);
        if (project.owner_id !== user.id)
          throw new Error("Solo la persona propietaria puede editar el proyecto");
        if (isTicketProjectName(project.name)) {
          if (name !== undefined && !isTicketProjectName(name))
            throw new Error("Mesa de tickets conserva su nombre protegido");
          if (archived === true)
            throw new Error("Mesa de tickets no se puede archivar");
        }
        const update: Record<string, unknown> = {};
        const imageToDelete = remove_image ? project.image_url : null;
        if (name !== undefined) update.name = safeText(name, 200, "El nombre");
        if (description !== undefined)
          update.description = cleanUntrustedText(description, 20_000);
        if (color !== undefined) update.color = color;
        if (archived !== undefined) update.archived = archived;
        if (imageToDelete) update.image_url = null;
        if (!Object.keys(update).length) throw new Error("No se indicó ningún cambio");
        const changed = await client
          .from("projects")
          .update(update)
          .eq("id", project_id)
          .select("id,name,description,color,image_url,owner_id,archived,created_at")
          .single();
        ensureNoError(changed.error, "No se pudo editar el proyecto");
        if (imageToDelete) await deleteProjectImage(options, imageToDelete);
        return {
          summary: `Proyecto actualizado: ${changed.data?.name}.`,
          result: {
            project: changed.data
              ? { ...changed.data, url: projectLink(changed.data.id) }
              : null,
          },
        };
      }),
  );

  server.registerTool(
    "delete_project",
    {
      title: "Borrar proyecto",
      description:
        "Borra definitivamente un proyecto y su contenido. Requiere confirmación explícita y el nombre exacto; Mesa de tickets está protegida contra borrado.",
      inputSchema: {
        project_id: z.string().uuid(),
        confirm_name: z.string().min(1).max(200),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: destructiveAnnotations,
    },
    async ({ project_id, confirm_name }) =>
      runTool(async () => {
        const project = await requireProject(client, project_id);
        if (project.owner_id !== user.id)
          throw new Error("Solo la persona propietaria puede borrar el proyecto");
        if (isTicketProjectName(project.name))
          throw new Error("Mesa de tickets está protegida y no se puede borrar");
        if (confirm_name !== project.name)
          throw new Error("La confirmación no coincide con el nombre exacto");
        const [{ data: projectTasks }, { data: projectMinutes }] =
          await Promise.all([
            client.from("tasks").select("id").eq("project_id", project_id),
            client
              .from("project_minutes")
              .select("project_minute_attachments(drive_file_id)")
              .eq("project_id", project_id),
          ]);
        const taskIds = (projectTasks || []).map((task) => task.id);
        const { data: taskComments } = taskIds.length
          ? await client
              .from("comments")
              .select("comment_attachments(drive_file_id)")
              .in("task_id", taskIds)
          : { data: [] };
        if (project.image_url)
          await deleteProjectImage(options, project.image_url);
        await deleteDriveFiles(options, [
          ...(projectMinutes || []).flatMap((minute) =>
            (minute.project_minute_attachments || []).map(
              (attachment) => attachment.drive_file_id,
            ),
          ),
          ...(taskComments || []).flatMap((comment) =>
            (comment.comment_attachments || []).map(
              (attachment) => attachment.drive_file_id,
            ),
          ),
        ]);
        const deleted = await client
          .from("projects")
          .delete()
          .eq("id", project_id);
        ensureNoError(deleted.error, "No se pudo borrar el proyecto");
        return {
          summary: `Proyecto borrado: ${project.name}.`,
          result: { deleted_project_id: project_id, deleted_name: project.name },
        };
      }),
  );

  server.registerTool(
    "add_project_member",
    {
      title: "Agregar persona al proyecto",
      description:
        "Agrega una persona registrada como integrante del proyecto para poder asignarle tareas.",
      inputSchema: {
        project_id: z.string().uuid(),
        person_id: z.string().uuid(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ project_id, person_id }) =>
      runTool(async () => {
        const project = await requireProject(client, project_id);
        const { data: person, error: personError } = await client
          .from("profiles")
          .select("id,full_name,email,avatar_url,areas(name)")
          .eq("id", person_id)
          .single();
        if (personError || !person) throw new Error("Persona no encontrada");
        const { data: existing } = await client
          .from("project_members")
          .select("user_id,role")
          .eq("project_id", project_id)
          .eq("user_id", person_id)
          .maybeSingle();
        if (!existing && project.owner_id !== person_id) {
          const inserted = await client.from("project_members").insert({
            project_id,
            user_id: person_id,
            role: "member",
          });
          ensureNoError(inserted.error, "No se pudo agregar la persona");
        }
        return {
          summary: `${person.full_name} pertenece ahora a ${project.name}.`,
          result: { project_id, person, already_member: Boolean(existing) },
        };
      }),
  );

  server.registerTool(
    "remove_project_member",
    {
      title: "Quitar persona del proyecto",
      description:
        "Quita una persona y sus asignaciones del proyecto. Requiere confirmación con el correo exacto y permisos de propietario.",
      inputSchema: {
        project_id: z.string().uuid(),
        person_id: z.string().uuid(),
        confirm_email: z.string().email(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: destructiveAnnotations,
    },
    async ({ project_id, person_id, confirm_email }) =>
      runTool(async () => {
        const project = await requireProject(client, project_id);
        if (project.owner_id === person_id)
          throw new Error("No se puede quitar a la persona propietaria del proyecto");
        const { data: person, error } = await client
          .from("profiles")
          .select("id,full_name,email")
          .eq("id", person_id)
          .single();
        if (error || !person) throw new Error("Persona no encontrada");
        if (person.email.toLocaleLowerCase("es-MX") !== confirm_email.toLocaleLowerCase("es-MX"))
          throw new Error("La confirmación no coincide con el correo exacto");
        const { data: projectTasks } = await client
          .from("tasks")
          .select("id")
          .eq("project_id", project_id);
        const taskIds = (projectTasks || []).map((task) => task.id);
        if (taskIds.length)
          await client
            .from("task_assignees")
            .delete()
            .eq("user_id", person_id)
            .in("task_id", taskIds);
        const deleted = await client
          .from("project_members")
          .delete()
          .eq("project_id", project_id)
          .eq("user_id", person_id);
        ensureNoError(deleted.error, "No se pudo quitar la persona");
        return {
          summary: `${person.full_name} fue retirado de ${project.name}.`,
          result: { project_id, removed_person: person },
        };
      }),
  );

  server.registerTool(
    "list_messages",
    {
      title: "Listar mensajes generales",
      description:
        "Lista mensajes y anuncios generales del Workspace, con comentarios y reacciones.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(30) },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({ limit }) =>
      runTool(async () => {
        const { data, error } = await client
          .from("project_posts")
          .select("id,project_id,author_id,kind,title,body,pinned,created_at,updated_at,post_comments(id,author_id,body,created_at),post_reactions(user_id,emoji),post_subscriptions(user_id)")
          .is("project_id", null)
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);
        ensureNoError(error, "No se pudieron cargar los mensajes");
        return {
          summary: `Se cargaron ${(data || []).length} mensajes.`,
          result: { messages: data || [] },
        };
      }),
  );

  server.registerTool(
    "create_message",
    {
      title: "Publicar mensaje o anuncio",
      description:
        "Publica un mensaje general para todo el Workspace. Los anuncios requieren título y quedan fijados.",
      inputSchema: {
        kind: z.enum(["message", "announcement"]).default("message"),
        title: z.string().max(500).default(""),
        body: z.string().min(1).max(20_000),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ kind, title, body }) =>
      runTool(async () => {
        const cleanTitle = cleanUntrustedText(title, 500);
        if (kind === "announcement" && !cleanTitle)
          throw new Error("Un anuncio necesita título");
        const inserted = await client
          .from("project_posts")
          .insert({
            project_id: null,
            author_id: user.id,
            kind,
            title: cleanTitle,
            body: safeText(body, 20_000, "El mensaje"),
            pinned: kind === "announcement",
          })
          .select("id,project_id,author_id,kind,title,body,pinned,created_at,updated_at")
          .single();
        ensureNoError(inserted.error, "No se pudo publicar el mensaje");
        if (inserted.data)
          await client.from("post_subscriptions").insert({
            post_id: inserted.data.id,
            user_id: user.id,
          });
        let notifications = { created: 0 };
        if (kind === "announcement" && inserted.data) {
          const { data: people } = await client
            .from("profiles")
            .select("id")
            .neq("id", user.id)
            .limit(1000);
          notifications = await createWorkspaceNotifications(
            client,
            user.id,
            (people || []).map((person) => person.id),
            "announcement",
            "Nuevo anuncio del Workspace",
            cleanTitle,
          );
        }
        return {
          summary: kind === "announcement" ? "Anuncio publicado." : "Mensaje publicado.",
          result: { message: inserted.data, notifications },
        };
      }),
  );

  server.registerTool(
    "update_message",
    {
      title: "Editar mensaje o anuncio",
      description:
        "Edita una conversación general creada por el usuario conectado.",
      inputSchema: {
        message_id: z.string().uuid(),
        kind: z.enum(["message", "announcement"]).optional(),
        title: z.string().max(500).optional(),
        body: z.string().min(1).max(20_000).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ message_id, kind, title, body }) =>
      runTool(async () => {
        const { data: current, error } = await client
          .from("project_posts")
          .select("id,author_id,kind,title,body")
          .eq("id", message_id)
          .single();
        if (error || !current) throw new Error("Mensaje no encontrado o sin acceso");
        const nextKind = kind || current.kind;
        const nextTitle = title === undefined ? current.title : cleanUntrustedText(title, 500);
        if (nextKind === "announcement" && !nextTitle)
          throw new Error("Un anuncio necesita título");
        const update: Record<string, unknown> = {
          kind: nextKind,
          title: nextTitle,
          pinned: nextKind === "announcement",
          updated_at: new Date().toISOString(),
        };
        if (body !== undefined) update.body = safeText(body, 20_000, "El mensaje");
        const changed = await client
          .from("project_posts")
          .update(update)
          .eq("id", message_id)
          .select("id,project_id,author_id,kind,title,body,pinned,created_at,updated_at")
          .single();
        ensureNoError(changed.error, "No se pudo editar el mensaje");
        return {
          summary: "Mensaje actualizado.",
          result: { message: changed.data },
        };
      }),
  );

  server.registerTool(
    "comment_message",
    {
      title: "Responder a un mensaje",
      description:
        "Publica una respuesta y avisa al autor y a quienes siguen la conversación.",
      inputSchema: {
        message_id: z.string().uuid(),
        body: z.string().min(1).max(10_000),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ message_id, body }) =>
      runTool(async () => {
        const { data: post, error } = await client
          .from("project_posts")
          .select("id,author_id,title,body,post_subscriptions(user_id)")
          .eq("id", message_id)
          .single();
        if (error || !post) throw new Error("Mensaje no encontrado o sin acceso");
        const cleanBody = safeText(body, 10_000, "La respuesta");
        const inserted = await client
          .from("post_comments")
          .insert({ post_id: message_id, author_id: user.id, body: cleanBody })
          .select("id,post_id,author_id,body,created_at")
          .single();
        ensureNoError(inserted.error, "No se pudo publicar la respuesta");
        await client.from("post_subscriptions").upsert(
          { post_id: message_id, user_id: user.id },
          { onConflict: "post_id,user_id" },
        );
        const recipients = uniqueIds([
          post.author_id,
          ...(post.post_subscriptions || []).map((item) => item.user_id),
        ]);
        const notifications = await createWorkspaceNotifications(
          client,
          user.id,
          recipients,
          "subscription",
          "Nueva respuesta en una conversación",
          post.title || cleanBody.slice(0, 100),
        );
        return {
          summary: "Respuesta publicada.",
          result: { comment: inserted.data, notifications },
        };
      }),
  );

  server.registerTool(
    "react_to_message",
    {
      title: "Reaccionar a un mensaje",
      description:
        "Agrega o cambia la reacción del usuario conectado. Usa null para retirarla.",
      inputSchema: {
        message_id: z.string().uuid(),
        emoji: z.enum(REACTION_VALUES).nullable(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ message_id, emoji }) =>
      runTool(async () => {
        const { data: post, error } = await client
          .from("project_posts")
          .select("id,author_id,title,body")
          .eq("id", message_id)
          .single();
        if (error || !post) throw new Error("Mensaje no encontrado o sin acceso");
        const result = emoji
          ? await client.from("post_reactions").upsert(
              { post_id: message_id, user_id: user.id, emoji },
              { onConflict: "post_id,user_id" },
            )
          : await client
              .from("post_reactions")
              .delete()
              .eq("post_id", message_id)
              .eq("user_id", user.id);
        ensureNoError(result.error, "No se pudo actualizar la reacción");
        const notifications = emoji
          ? await createWorkspaceNotifications(
              client,
              user.id,
              [post.author_id],
              "reaction",
              `Reaccionaron ${emoji} a tu mensaje`,
              post.title || post.body.slice(0, 100),
            )
          : { created: 0 };
        return {
          summary: emoji ? `Reacción ${emoji} guardada.` : "Reacción retirada.",
          result: { message_id, own_reaction: emoji, notifications },
        };
      }),
  );

  server.registerTool(
    "follow_message",
    {
      title: "Seguir o dejar de seguir un mensaje",
      description: "Activa o desactiva el seguimiento de una conversación general.",
      inputSchema: {
        message_id: z.string().uuid(),
        following: z.boolean(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ message_id, following }) =>
      runTool(async () => {
        const { data: post, error } = await client
          .from("project_posts")
          .select("id")
          .eq("id", message_id)
          .single();
        if (error || !post) throw new Error("Mensaje no encontrado o sin acceso");
        const result = following
          ? await client.from("post_subscriptions").upsert(
              { post_id: message_id, user_id: user.id },
              { onConflict: "post_id,user_id" },
            )
          : await client
              .from("post_subscriptions")
              .delete()
              .eq("post_id", message_id)
              .eq("user_id", user.id);
        ensureNoError(result.error, "No se pudo actualizar el seguimiento");
        return {
          summary: following ? "Ahora sigues esta conversación." : "Dejaste de seguir esta conversación.",
          result: { message_id, following },
        };
      }),
  );

  server.registerTool(
    "delete_message_comment",
    {
      title: "Borrar respuesta de mensaje",
      description:
        "Borra una respuesta propia. Requiere confirmar exactamente sus primeros 120 caracteres.",
      inputSchema: {
        comment_id: z.string().uuid(),
        confirm_text: z.string().min(1).max(120),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: destructiveAnnotations,
    },
    async ({ comment_id, confirm_text }) =>
      runTool(async () => {
        const { data, error } = await client
          .from("post_comments")
          .select("id,post_id,body")
          .eq("id", comment_id)
          .single();
        if (error || !data) throw new Error("Respuesta no encontrada o sin acceso");
        if (confirm_text !== data.body.slice(0, 120))
          throw new Error("La confirmación no coincide con la respuesta");
        const deleted = await client
          .from("post_comments")
          .delete()
          .eq("id", comment_id);
        ensureNoError(deleted.error, "No se pudo borrar la respuesta");
        return {
          summary: "Respuesta borrada.",
          result: { deleted_comment_id: comment_id, message_id: data.post_id },
        };
      }),
  );

  server.registerTool(
    "delete_message",
    {
      title: "Borrar mensaje",
      description:
        "Borra un mensaje general. Requiere confirmación exacta con su título o, si no tiene, con los primeros 80 caracteres del cuerpo.",
      inputSchema: {
        message_id: z.string().uuid(),
        confirm_text: z.string().min(1).max(500),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: destructiveAnnotations,
    },
    async ({ message_id, confirm_text }) =>
      runTool(async () => {
        const { data, error } = await client
          .from("project_posts")
          .select("id,title,body")
          .eq("id", message_id)
          .single();
        if (error || !data) throw new Error("Mensaje no encontrado o sin acceso");
        const expected = data.title || data.body.slice(0, 80);
        if (confirm_text !== expected)
          throw new Error("La confirmación no coincide con el texto exacto");
        const deleted = await client
          .from("project_posts")
          .delete()
          .eq("id", message_id);
        ensureNoError(deleted.error, "No se pudo borrar el mensaje");
        return {
          summary: "Mensaje borrado.",
          result: { deleted_message_id: message_id },
        };
      }),
  );

  server.registerTool(
    "list_minutes",
    {
      title: "Listar minutas",
      description: "Lista las minutas de juntas de un proyecto.",
      inputSchema: {
        project_id: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(30),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({ project_id, limit }) =>
      runTool(async () => {
        await requireProject(client, project_id);
        const { data, error } = await client
          .from("project_minutes")
          .select("id,project_id,author_id,title,meeting_date,attendees,notes,agreements,next_steps,created_at,updated_at,project_minute_attachments(id,file_name,size_bytes,created_at)")
          .eq("project_id", project_id)
          .order("meeting_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);
        ensureNoError(error, "No se pudieron cargar las minutas");
        return {
          summary: `Se cargaron ${(data || []).length} minutas.`,
          result: { minutes: data || [] },
        };
      }),
  );

  server.registerTool(
    "get_minute_pdf",
    {
      title: "Abrir PDF de una minuta",
      description:
        "Descarga un PDF adjunto accesible para que el agente pueda leerlo o entregarlo al usuario.",
      inputSchema: { attachment_id: z.string().uuid() },
      outputSchema: RESULT_SCHEMA,
      annotations: externalReadAnnotations,
    },
    async ({ attachment_id }) => {
      try {
        const { data: attachment, error } = await client
          .from("project_minute_attachments")
          .select("id,minute_id,drive_file_id,file_name,mime_type,size_bytes")
          .eq("id", attachment_id)
          .single();
        if (error || !attachment) throw new Error("PDF no encontrado o sin acceso");
        const response = await fetch(
          `${options.origin}/api/drive/files/${encodeURIComponent(attachment.drive_file_id)}`,
          {
            headers: { Authorization: `Bearer ${options.accessToken}` },
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error("No se pudo abrir el PDF");
        const pdf = Buffer.from(await response.arrayBuffer());
        if (pdf.byteLength < 5 || pdf.subarray(0, 5).toString() !== "%PDF-")
          throw new Error("El archivo adjunto no es un PDF válido");
        if (pdf.byteLength > 50 * 1024 * 1024)
          throw new Error("El PDF excede 50 MB");
        const result = {
          attachment_id,
          minute_id: attachment.minute_id,
          file_name: attachment.file_name,
          size_bytes: pdf.byteLength,
        };
        return {
          structuredContent: { result },
          content: [
            { type: "text" as const, text: `PDF adjunto: ${attachment.file_name}` },
            {
              type: "resource" as const,
              resource: {
                uri: `workspace-minute://download/${encodeURIComponent(attachment.file_name)}`,
                mimeType: "application/pdf",
                blob: pdf.toString("base64"),
              },
            },
          ],
        };
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "save_minute",
    {
      title: "Crear o editar minuta",
      description:
        "Crea una minuta o edita una existente con fecha, asistentes, notas, acuerdos y próximos pasos. No modifica PDFs adjuntos.",
      inputSchema: {
        project_id: z.string().uuid(),
        minute_id: z.string().uuid().optional(),
        title: z.string().min(1).max(200),
        meeting_date: z.string().date(),
        attendees: z.string().max(3000).default(""),
        notes: z.string().max(20_000).default(""),
        agreements: z.string().max(12_000).default(""),
        next_steps: z.string().max(12_000).default(""),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async (input) =>
      runTool(async () => {
        await requireProject(client, input.project_id);
        const payload = {
          title: safeText(input.title, 200, "El título"),
          meeting_date: input.meeting_date,
          attendees: cleanUntrustedText(input.attendees, 3000),
          notes: cleanUntrustedText(input.notes, 20_000),
          agreements: cleanUntrustedText(input.agreements, 12_000),
          next_steps: cleanUntrustedText(input.next_steps, 12_000),
          updated_at: new Date().toISOString(),
        };
        if (!payload.notes && !payload.agreements && !payload.next_steps)
          throw new Error("Agrega notas, acuerdos o próximos pasos");
        const saved = input.minute_id
          ? await client
              .from("project_minutes")
              .update(payload)
              .eq("id", input.minute_id)
              .eq("project_id", input.project_id)
              .select("id,project_id,author_id,title,meeting_date,attendees,notes,agreements,next_steps,created_at,updated_at")
              .single()
          : await client
              .from("project_minutes")
              .insert({
                ...payload,
                project_id: input.project_id,
                author_id: user.id,
              })
              .select("id,project_id,author_id,title,meeting_date,attendees,notes,agreements,next_steps,created_at,updated_at")
              .single();
        ensureNoError(saved.error, "No se pudo guardar la minuta");
        return {
          summary: input.minute_id ? "Minuta actualizada." : "Minuta creada.",
          result: { minute: saved.data },
        };
      }),
  );

  server.registerTool(
    "delete_minute",
    {
      title: "Borrar minuta",
      description:
        "Borra una minuta. Requiere confirmación explícita con el título exacto; no elimina archivos de Google Drive por separado.",
      inputSchema: {
        minute_id: z.string().uuid(),
        confirm_title: z.string().min(1).max(200),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: destructiveAnnotations,
    },
    async ({ minute_id, confirm_title }) =>
      runTool(async () => {
        const { data, error } = await client
          .from("project_minutes")
          .select("id,title,project_minute_attachments(drive_file_id)")
          .eq("id", minute_id)
          .single();
        if (error || !data) throw new Error("Minuta no encontrada o sin acceso");
        if (confirm_title !== data.title)
          throw new Error("La confirmación no coincide con el título exacto");
        await deleteDriveFiles(
          options,
          (data.project_minute_attachments || []).map((item) => item.drive_file_id),
        );
        const deleted = await client
          .from("project_minutes")
          .delete()
          .eq("id", minute_id);
        ensureNoError(deleted.error, "No se pudo borrar la minuta");
        return {
          summary: `Minuta borrada: ${data.title}.`,
          result: { deleted_minute_id: minute_id, deleted_title: data.title },
        };
      }),
  );

  server.registerTool(
    "delete_minute_pdf",
    {
      title: "Borrar PDF de una minuta",
      description:
        "Borra de Google Drive y de la minuta un PDF concreto. Requiere confirmar el nombre exacto del archivo.",
      inputSchema: {
        attachment_id: z.string().uuid(),
        confirm_file_name: z.string().min(1).max(180),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: destructiveAnnotations,
    },
    async ({ attachment_id, confirm_file_name }) =>
      runTool(async () => {
        const { data, error } = await client
          .from("project_minute_attachments")
          .select("id,minute_id,drive_file_id,file_name")
          .eq("id", attachment_id)
          .single();
        if (error || !data) throw new Error("PDF no encontrado o sin acceso");
        if (confirm_file_name !== data.file_name)
          throw new Error("La confirmación no coincide con el nombre exacto");
        await deleteDriveFiles(options, [data.drive_file_id]);
        const deleted = await client
          .from("project_minute_attachments")
          .delete()
          .eq("id", attachment_id);
        ensureNoError(deleted.error, "No se pudo actualizar la minuta");
        return {
          summary: `PDF borrado: ${data.file_name}.`,
          result: {
            deleted_attachment_id: attachment_id,
            minute_id: data.minute_id,
            deleted_file_name: data.file_name,
          },
        };
      }),
  );

  server.registerTool(
    "list_notifications",
    {
      title: "Listar notificaciones",
      description:
        "Lista notificaciones del usuario en las pestañas Nuevas, Menciones, Leídas o Todas, con enlace a su origen.",
      inputSchema: {
        tab: z.enum(["new", "mentions", "read", "all"]).default("new"),
        limit: z.number().int().min(1).max(100).default(50),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({ tab, limit }) =>
      runTool(async () => {
        let request = client
          .from("notifications")
          .select("id,user_id,actor_id,project_id,task_id,type,title,body,read_at,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (tab === "new") request = request.is("read_at", null).neq("type", "mention");
        if (tab === "mentions") request = request.eq("type", "mention");
        if (tab === "read") request = request.not("read_at", "is", null);
        const { data, error } = await request;
        ensureNoError(error, "No se pudieron cargar las notificaciones");
        const notifications = (data || []).map((notification) => ({
          ...notification,
          url: notification.task_id
            ? `${WORKSPACE_PUBLIC_ORIGIN}/?project=${encodeURIComponent(notification.project_id || "")}&task=${encodeURIComponent(notification.task_id)}`
            : notification.type === "announcement"
              ? `${WORKSPACE_PUBLIC_ORIGIN}/?view=messages`
              : WORKSPACE_PUBLIC_ORIGIN,
        }));
        return {
          summary: `Se cargaron ${notifications.length} notificaciones.`,
          result: { tab, notifications },
        };
      }),
  );

  server.registerTool(
    "mark_notifications_read",
    {
      title: "Marcar notificaciones como leídas",
      description:
        "Marca como leídas notificaciones concretas del usuario conectado.",
      inputSchema: {
        notification_ids: z.array(z.string().uuid()).min(1).max(100),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ notification_ids }) =>
      runTool(async () => {
        const ids = uniqueIds(notification_ids);
        const changed = await client
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .in("id", ids)
          .select("id,read_at");
        ensureNoError(changed.error, "No se pudieron actualizar las notificaciones");
        return {
          summary: `${(changed.data || []).length} notificaciones marcadas como leídas.`,
          result: { notifications: changed.data || [] },
        };
      }),
  );

  server.registerTool(
    "list_activity",
    {
      title: "Consultar actividad",
      description:
        "Consulta la actividad reciente general, por proyecto, persona o to-do.",
      inputSchema: {
        project_id: z.string().uuid().optional(),
        person_id: z.string().uuid().optional(),
        task_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async ({ project_id, person_id, task_id, limit }) =>
      runTool(async () => {
        let request = client
          .from("activity_events")
          .select("id,actor_id,project_id,task_id,verb,detail,created_at,profiles!activity_events_actor_id_fkey(id,full_name,email,avatar_url),projects(id,name),tasks(id,title)")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (project_id) request = request.eq("project_id", project_id);
        if (person_id) request = request.eq("actor_id", person_id);
        if (task_id) request = request.eq("task_id", task_id);
        const { data, error } = await request;
        ensureNoError(error, "No se pudo cargar la actividad");
        return {
          summary: `Se cargaron ${(data || []).length} actividades.`,
          result: { activity: data || [] },
        };
      }),
  );

  server.registerTool(
    "get_my_profile",
    {
      title: "Leer mi perfil",
      description:
        "Obtiene nombre, correo, área, foto y datos del reporte semanal del usuario conectado.",
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async () =>
      runTool(async () => {
        const { data, error } = await client
          .from("profiles")
          .select("id,full_name,email,phone,avatar_url,role,area_id,areas(id,name,color),created_at")
          .eq("id", user.id)
          .single();
        if (error || !data) throw new Error("No se pudo leer el perfil");
        return { summary: "Perfil cargado.", result: { profile: data } };
      }),
  );

  server.registerTool(
    "update_my_profile",
    {
      title: "Editar mi perfil",
      description:
        "Actualiza nombre, teléfono del reporte o asigna un área existente. La foto se sube desde la app por seguridad.",
      inputSchema: {
        full_name: z.string().min(1).max(180).optional(),
        phone: z.string().max(50).nullable().optional(),
        area_id: z.string().uuid().nullable().optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ full_name, phone, area_id }) =>
      runTool(async () => {
        const update: Record<string, unknown> = {};
        if (full_name !== undefined)
          update.full_name = safeText(full_name, 180, "El nombre");
        if (phone !== undefined)
          update.phone = phone === null ? null : cleanUntrustedText(phone, 50);
        if (area_id !== undefined) {
          if (area_id) {
            const { data: area, error } = await client
              .from("areas")
              .select("id")
              .eq("id", area_id)
              .single();
            if (error || !area) throw new Error("Área no encontrada");
          }
          update.area_id = area_id;
        }
        if (!Object.keys(update).length) throw new Error("No se indicó ningún cambio");
        const changed = await client
          .from("profiles")
          .update(update)
          .eq("id", user.id)
          .select("id,full_name,email,phone,avatar_url,role,area_id,areas(id,name,color)")
          .single();
        ensureNoError(changed.error, "No se pudo actualizar el perfil");
        return { summary: "Perfil actualizado.", result: { profile: changed.data } };
      }),
  );

  server.registerTool(
    "list_areas",
    {
      title: "Listar áreas",
      description: "Lista las áreas registradas para buscar personas o editar el perfil.",
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: readAnnotations,
    },
    async () =>
      runTool(async () => {
        const { data, error } = await client
          .from("areas")
          .select("id,name,color,created_at")
          .order("name")
          .limit(200);
        ensureNoError(error, "No se pudieron cargar las áreas");
        return {
          summary: `Se cargaron ${(data || []).length} áreas.`,
          result: { areas: data || [] },
        };
      }),
  );

  server.registerTool(
    "generate_weekly_report",
    {
      title: "Generar reporte semanal",
      description:
        "Genera el PDF semanal breve de una persona usando los títulos y fechas de sus tareas asignadas pendientes, agrupadas por proyecto.",
      inputSchema: { person_id: z.string().uuid() },
      outputSchema: RESULT_SCHEMA,
      annotations: externalActionAnnotations,
    },
    async ({ person_id }) => {
      try {
        const { data: person, error } = await client
          .from("profiles")
          .select("id,full_name,email")
          .eq("id", person_id)
          .single();
        if (error || !person) throw new Error("Persona no encontrada");
        const response = await fetch(`${options.origin}/api/reports/weekly`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ personId: person_id }),
          cache: "no-store",
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error || "No se pudo generar el reporte semanal");
        }
        const pdf = Buffer.from(await response.arrayBuffer());
        if (pdf.byteLength < 5 || pdf.subarray(0, 5).toString() !== "%PDF-")
          throw new Error("El generador devolvió un PDF inválido");
        if (pdf.byteLength > 20 * 1024 * 1024)
          throw new Error("El reporte es demasiado grande para entregarlo al agente");
        const filename = attachmentFilename(
          response.headers.get("content-disposition"),
          `Reporte semanal - ${person.full_name}.pdf`,
        );
        const result = {
          person,
          filename,
          size_bytes: pdf.byteLength,
          pending_task_count: Number(
            response.headers.get("x-report-task-count") || "0",
          ),
        };
        return {
          structuredContent: { result },
          content: [
            {
              type: "text" as const,
              text: `Reporte generado: ${filename}`,
            },
            {
              type: "resource" as const,
              resource: {
                uri: `workspace-report://download/${encodeURIComponent(filename)}`,
                mimeType: "application/pdf",
                blob: pdf.toString("base64"),
              },
            },
          ],
        };
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool(
    "save_template",
    {
      title: "Crear o editar plantilla",
      description:
        "Guarda un preset del backlog con contexto y steps reutilizables.",
      inputSchema: {
        template_id: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        description: z.string().max(10_000).default(""),
        area_id: z.string().uuid().nullable().optional(),
        steps: z.array(z.string().min(1).max(1000)).max(100).default([]),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: writeAnnotations,
    },
    async ({ template_id, name, description, area_id, steps }) =>
      runTool(async () => {
        const payload = {
          name: safeText(name, 200, "El nombre"),
          description: cleanUntrustedText(description, 10_000),
          area_id: area_id || null,
        };
        const saved = template_id
          ? await client
              .from("templates")
              .update(payload)
              .eq("id", template_id)
              .select("id,name,description,area_id,creator_id,created_at")
              .single()
          : await client
              .from("templates")
              .insert({ ...payload, creator_id: user.id })
              .select("id,name,description,area_id,creator_id,created_at")
              .single();
        ensureNoError(saved.error, "No se pudo guardar la plantilla");
        if (!saved.data) throw new Error("No se pudo guardar la plantilla");
        const removed = await client
          .from("template_steps")
          .delete()
          .eq("template_id", saved.data.id);
        ensureNoError(removed.error, "No se pudieron actualizar los steps");
        const cleanSteps = steps
          .map((step) => cleanUntrustedText(step, 1000))
          .filter(Boolean);
        if (cleanSteps.length) {
          const inserted = await client.from("template_steps").insert(
            cleanSteps.map((title, position) => ({
              template_id: saved.data.id,
              title,
              position,
            })),
          );
          ensureNoError(inserted.error, "No se pudieron guardar los steps");
        }
        return {
          summary: template_id ? "Plantilla actualizada." : "Plantilla creada.",
          result: { template: { ...saved.data, steps: cleanSteps } },
        };
      }),
  );

  server.registerTool(
    "delete_template",
    {
      title: "Borrar plantilla",
      description:
        "Borra un preset del backlog. Requiere confirmar su nombre exacto.",
      inputSchema: {
        template_id: z.string().uuid(),
        confirm_name: z.string().min(1).max(200),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: destructiveAnnotations,
    },
    async ({ template_id, confirm_name }) =>
      runTool(async () => {
        const { data, error } = await client
          .from("templates")
          .select("id,name")
          .eq("id", template_id)
          .single();
        if (error || !data) throw new Error("Plantilla no encontrada o sin acceso");
        if (confirm_name !== data.name)
          throw new Error("La confirmación no coincide con el nombre exacto");
        const deleted = await client.from("templates").delete().eq("id", template_id);
        ensureNoError(deleted.error, "No se pudo borrar la plantilla");
        return {
          summary: `Plantilla borrada: ${data.name}.`,
          result: { deleted_template_id: template_id, deleted_name: data.name },
        };
      }),
  );

  return server;
}
