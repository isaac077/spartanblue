"use client";

import Image from "next/image";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import {
  ChangeEvent,
  type DragEvent as ReactDragEvent,
  FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowUp,
  Archive,
  Bell,
  BellRing,
  Building2,
  Camera,
  CalendarClock,
  CalendarRange,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Columns3,
  Copy,
  CopyPlus,
  ExternalLink,
  Eye,
  EyeOff,
  FileDown,
  Flag,
  FolderInput,
  GripVertical,
  Inbox,
  ImagePlus,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  Maximize2,
  Menu,
  MessageCircle,
  MessageSquareText,
  Minimize2,
  MoreHorizontal,
  Moon,
  MoveRight,
  NotebookPen,
  Pin,
  Pencil,
  Plus,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  SmilePlus,
  Sparkles,
  Sun,
  Tag,
  Target,
  TicketCheck,
  Trash2,
  UserRound,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { hasSupabase, supabase } from "../lib/supabase";
import RichTextEditor, {
  plainTextFromDescription,
  RichTextContent,
} from "./components/RichTextEditor";
import WorkspaceExtensions from "./components/WorkspaceExtensions";
import ProjectMinutes from "./components/ProjectMinutes";

type Status =
  "backlog" | "unassigned" | "todo" | "in_progress" | "review" | "done";
type ProjectView = "board" | "list" | "calendar" | "minutes";
type Task = {
  id: string;
  title: string;
  description: string;
  status: Status;
  updatedAt?: string;
  priority: "low" | "medium" | "high" | "urgent";
  due: string;
  assignees: string[];
  labels: string[];
  comments: number;
  steps: { id?: string; title: string; completed: boolean }[];
  externalSource?: string;
  externalId?: string;
  externalUrl?: string;
};
type WorkspaceTask = Task & {
  projectId: string;
  projectName: string;
};
type ReportSaveHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};
type ReportSavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<ReportSaveHandle>;
};
type LegacyDownloadNavigator = Navigator & {
  msSaveOrOpenBlob?: (blob: Blob, filename?: string) => boolean;
};

const BUBBLE_UP_STORAGE_KEY = "spartanblue-workspace-bubble-up-v1";

function readBubbleUpPreferences(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const saved = window.localStorage.getItem(BUBBLE_UP_STORAGE_KEY);
    if (!saved) return {};
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([userId, taskIds]) =>
        Array.isArray(taskIds)
          ? [
              [
                userId,
                taskIds.filter(
                  (taskId): taskId is string => typeof taskId === "string",
                ),
              ],
            ]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

type WorkspaceProject = {
  id: string;
  name: string;
  color: string;
  description?: string;
  image_url?: string | null;
  image_path?: string | null;
  owner_id?: string;
  archived?: boolean;
};
type WorkspacePerson = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url?: string | null;
  avatar_path?: string | null;
  phone?: string | null;
  areas?: { name?: string } | null;
};
type TaskComment = {
  id: string;
  body: string;
  author: string;
  author_id?: string;
  time: string;
  reactions: { user_id: string; emoji: string }[];
  attachments: CommentAttachment[];
};
type CommentAttachment = {
  id: string;
  comment_id: string;
  uploaded_by: string | null;
  drive_file_id: string;
  file_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
  created_at: string;
  local_url?: string;
};
type PendingCommentImage = {
  id: string;
  file: File;
  mimeType: CommentAttachment["mime_type"];
  previewUrl: string;
};
type ActivityEvent = {
  id: string;
  actor_id: string;
  project_id: string;
  task_id?: string | null;
  verb:
    "created" | "moved" | "commented" | "completed" | "reopened" | "checked";
  detail: string;
  created_at: string;
};
type TemplateRow = {
  name: string;
  description: string;
  template_steps: { title: string; position: number }[] | null;
};
type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: Status;
  updated_at: string;
  priority: Task["priority"];
  due_date: string | null;
  external_source: string | null;
  external_id: string | null;
  external_url: string | null;
  task_assignees: { user_id: string }[] | null;
  task_labels: { labels: { name: string } | null }[] | null;
  comments: { count: number }[] | null;
  task_steps: (Task["steps"][number] & { position: number })[] | null;
};
type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  project_id?: string | null;
  task_id?: string | null;
  created_at: string;
  read_at: string | null;
  projects: { name: string } | { name: string }[] | null;
  tasks: { title: string } | { title: string }[] | null;
};
type WorkspaceNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  project_id?: string | null;
  task_id?: string | null;
  project_name?: string;
  task_title?: string;
};
type CommentRow = {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
  comment_attachments: CommentAttachment[] | null;
};
type CommentReactionRow = {
  comment_id: string;
  user_id: string;
  emoji: string;
};
type DesktopNotificationPermission = NotificationPermission | "unsupported";

const TICKET_ADMIN_URL =
  process.env.NEXT_PUBLIC_TICKET_ADMIN_URL || "";
const TICKET_PROJECT_NAME = "Mesa de tickets";
const DRIVE_REFERENCE_PREFIX = "gdrive:";
const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
const MAX_COMMENT_IMAGES = 6;
const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const COMMENT_DRAFT_STORAGE_PREFIX = "tw-comment-draft:v1";

function commentDraftStorageKey(userId: string, taskId: string) {
  return `${COMMENT_DRAFT_STORAGE_PREFIX}:${userId || "demo"}:${taskId}`;
}

function readSavedCommentDraft(userId: string, taskId: string) {
  try {
    return (
      window.sessionStorage.getItem(commentDraftStorageKey(userId, taskId)) ||
      ""
    );
  } catch {
    return "";
  }
}

function saveCommentDraft(userId: string, taskId: string, value: string) {
  try {
    const key = commentDraftStorageKey(userId, taskId);
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // El comentario permanece en memoria aunque el navegador bloquee storage.
  }
}

function normalizedCommentImageType(
  file: File,
): CommentAttachment["mime_type"] | null {
  const declaredType = file.type.trim().toLowerCase();
  if (declaredType === "image/jpg") return "image/jpeg";
  if (PHOTO_MIME_TYPES.includes(declaredType))
    return declaredType as CommentAttachment["mime_type"];
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (["jpg", "jpeg", "jfif"].includes(extension || "")) return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

function isTicketProject(project?: WorkspaceProject | null) {
  return (
    project?.name.trim().toLocaleLowerCase("es-MX") ===
    TICKET_PROJECT_NAME.toLocaleLowerCase("es-MX")
  );
}

function safeTicketUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const candidate = new URL(value);
    const trustedOrigin = new URL(TICKET_ADMIN_URL).origin;
    if (
      candidate.protocol !== "https:" ||
      candidate.origin !== trustedOrigin ||
      candidate.username ||
      candidate.password
    )
      return undefined;
    return candidate.toString();
  } catch {
    return undefined;
  }
}

function taskFromRow(row: TaskRow, knownTicketProjectId = ""): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    status:
      row.status === "unassigned" && row.project_id !== knownTicketProjectId
        ? "todo"
        : row.status,
    updatedAt: row.updated_at,
    priority: row.priority,
    due: row.due_date || "Sin fecha",
    assignees: row.task_assignees?.map((assignee) => assignee.user_id) || [],
    labels: row.task_labels?.flatMap((item) =>
      item.labels?.name ? [item.labels.name] : [],
    ) || ["General"],
    comments: row.comments?.[0]?.count || 0,
    steps: (row.task_steps || []).sort((a, b) => a.position - b.position),
    externalSource: row.external_source || undefined,
    externalId: row.external_id || undefined,
    externalUrl: safeTicketUrl(row.external_url),
  };
}

function projectHref(projectId: string) {
  return `/?project=${encodeURIComponent(projectId)}`;
}

function taskHref(projectId: string, taskId: string) {
  return `${projectHref(projectId)}&task=${encodeURIComponent(taskId)}`;
}

function shouldHandleInternalLink(event: ReactMouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

const people = [
  {
    id: "jp",
    name: "Jesús Pacheco",
    initials: "JP",
    color: "#327B9F",
    area: "Dirección",
  },
  {
    id: "am",
    name: "Ana Morales",
    initials: "AM",
    color: "#20355A",
    area: "Marketing",
  },
  {
    id: "dr",
    name: "Diego Ruiz",
    initials: "DR",
    color: "#6D706F",
    area: "Producto",
  },
  {
    id: "lc",
    name: "Lucía Cruz",
    initials: "LC",
    color: "#C6932C",
    area: "Operaciones",
  },
];

const demoProjects: WorkspaceProject[] = [
  {
    id: "demo-1",
    name: "Lanzamiento Q3",
    color: "#C6932C",
    description: "Campaña y entregables para el tercer trimestre.",
  },
  { id: "demo-2", name: "Operación interna", color: "#327B9F" },
  { id: "demo-3", name: "Experiencia cliente", color: "#20355A" },
  {
    id: "demo-tickets",
    name: TICKET_PROJECT_NAME,
    color: "#C6932C",
    description: "Solicitudes nuevas listas para asignarse y atenderse.",
  },
];

const projectColors = [
  "#327B9F",
  "#20355A",
  "#C6932C",
  "#2E7D5B",
  "#B66C12",
  "#6D706F",
];

const initialTasks: Task[] = [
  {
    id: "ticket-demo",
    title: "[TCK-2026-00024] Actualizar materiales comerciales",
    description:
      "Cliente: Empresa de ejemplo\nÁrea solicitada: Diseño gráfico & Social Media\n\nSe requiere actualizar el material para una presentación.",
    status: "unassigned",
    priority: "high",
    due: "Sin fecha",
    assignees: [],
    labels: ["Ticket", "Diseño"],
    comments: 0,
    steps: [],
    externalSource: "ticket_system",
    externalId: "demo-ticket",
    externalUrl: TICKET_ADMIN_URL,
  },
  {
    id: "t1",
    title: "Definir narrativa de campaña",
    description: "Alinear mensaje principal y tres pruebas de valor.",
    status: "backlog",
    priority: "medium",
    due: "Sin fecha",
    assignees: ["am"],
    labels: ["Estrategia"],
    comments: 2,
    steps: [
      { title: "Revisar brief", completed: true },
      { title: "Proponer narrativa", completed: false },
    ],
  },
  {
    id: "t2",
    title: "Entrevistas con clientes",
    description: "Agendar cinco sesiones de 30 minutos.",
    status: "backlog",
    priority: "high",
    due: "18 Ago",
    assignees: ["dr"],
    labels: ["Research"],
    comments: 5,
    steps: [
      { title: "Preparar guion", completed: true },
      { title: "Confirmar agenda", completed: false },
    ],
  },
  {
    id: "t3",
    title: "Rediseñar página de precios",
    description: "Nueva jerarquía, preguntas frecuentes y comparativa.",
    status: "todo",
    priority: "high",
    due: "Hoy",
    assignees: ["dr", "am"],
    labels: ["Diseño"],
    comments: 8,
    steps: [
      { title: "Wireframe", completed: true },
      { title: "UI final", completed: false },
      { title: "QA", completed: false },
    ],
  },
  {
    id: "t4",
    title: "Preparar kit comercial",
    description: "Actualizar presentación, one-pager y casos de éxito.",
    status: "todo",
    priority: "medium",
    due: "16 Ago",
    assignees: ["jp"],
    labels: ["Ventas"],
    comments: 3,
    steps: [
      { title: "Inventario", completed: true },
      { title: "Actualizar deck", completed: false },
    ],
  },
  {
    id: "t5",
    title: "Automatizar reporte semanal",
    description: "Consolidar datos del equipo en una sola vista.",
    status: "in_progress",
    priority: "urgent",
    due: "Mañana",
    assignees: ["lc"],
    labels: ["Operaciones"],
    comments: 11,
    steps: [
      { title: "Mapear fuentes", completed: true },
      { title: "Crear flujo", completed: true },
      { title: "Validar", completed: false },
    ],
  },
  {
    id: "t6",
    title: "Calendario editorial Q3",
    description: "Programar temas, responsables y fechas de publicación.",
    status: "in_progress",
    priority: "medium",
    due: "19 Ago",
    assignees: ["am"],
    labels: ["Contenido"],
    comments: 4,
    steps: [
      { title: "Temas", completed: true },
      { title: "Responsables", completed: false },
    ],
  },
  {
    id: "t7",
    title: "Validar flujo de onboarding",
    description: "Revisión final con Operaciones y Comercial.",
    status: "review",
    priority: "high",
    due: "Hoy",
    assignees: ["lc", "jp"],
    labels: ["Cliente"],
    comments: 7,
    steps: [
      { title: "Prueba interna", completed: true },
      { title: "Aprobación", completed: false },
    ],
  },
  {
    id: "t8",
    title: "Manual de tono de voz",
    description: "Versión lista y compartida con el equipo.",
    status: "done",
    priority: "low",
    due: "12 Ago",
    assignees: ["am"],
    labels: ["Marca"],
    comments: 6,
    steps: [
      { title: "Borrador", completed: true },
      { title: "Revisión", completed: true },
    ],
  },
];

const columns: { key: Status; label: string; dot: string }[] = [
  { key: "backlog", label: "Backlog", dot: "#887b6d" },
  { key: "unassigned", label: "Sin asignar", dot: "#C6932C" },
  { key: "todo", label: "Por hacer", dot: "#d08a3f" },
  { key: "in_progress", label: "En curso", dot: "#4e7b9d" },
  { key: "review", label: "En revisión", dot: "#7d68a0" },
  { key: "done", label: "Hecho", dot: "#4f8262" },
];
const workflowColumns = columns.filter((column) => column.key !== "backlog");

function statusToneClass(status: Status) {
  return `status-${status.replace(/_/g, "-")}`;
}

function tasksForStatus(taskList: Task[], status: Status) {
  const matchingTasks = taskList.filter((task) => task.status === status);
  if (status !== "done") return matchingTasks;

  return matchingTasks.sort((first, second) => {
    const firstUpdatedAt = Date.parse(first.updatedAt || "");
    const secondUpdatedAt = Date.parse(second.updatedAt || "");
    const firstTimestamp = Number.isNaN(firstUpdatedAt) ? 0 : firstUpdatedAt;
    const secondTimestamp = Number.isNaN(secondUpdatedAt) ? 0 : secondUpdatedAt;
    return secondTimestamp - firstTimestamp;
  });
}

const taskReactionOptions = [
  { emoji: "👍", label: "Me gusta" },
  { emoji: "❤️", label: "Me encanta" },
  { emoji: "🎉", label: "Celebrar" },
  { emoji: "👀", label: "Lo vi" },
] as const;

const templates = [
  {
    name: "Lanzamiento de campaña",
    description: "De la idea al reporte final.",
    steps: 4,
    stepTitles: [
      "Definir objetivo y audiencia",
      "Preparar piezas y copys",
      "Revisión y aprobación",
      "Publicar y medir",
    ],
    icon: "✦",
    color: "orange",
  },
  {
    name: "Alta de cliente",
    description: "Un onboarding claro y repetible.",
    steps: 3,
    stepTitles: [
      "Recibir datos y accesos",
      "Crear espacio de trabajo",
      "Reunión de arranque",
    ],
    icon: "↗",
    color: "green",
  },
  {
    name: "Cierre mensual",
    description: "Entregas, informe y archivo.",
    steps: 3,
    stepTitles: [
      "Conciliar entregables",
      "Preparar informe",
      "Enviar y archivar",
    ],
    icon: "✓",
    color: "blue",
  },
];

const seedNotifications: WorkspaceNotification[] = [
  {
    id: "n1",
    type: "assignment",
    title: "Ana te asignó una tarea",
    body: "Preparar kit comercial",
    time: "Hace 8 min",
    unread: true,
    project_id: "demo-1",
    task_id: "t4",
    project_name: "Lanzamiento Q3",
    task_title: "Preparar kit comercial",
  },
  {
    id: "n2",
    type: "mention",
    title: "Lucía te mencionó",
    body: "¿Puedes revisar el flujo antes de la reunión?",
    time: "Hace 32 min",
    unread: true,
    project_id: "demo-1",
    task_id: "t7",
    project_name: "Lanzamiento Q3",
    task_title: "Validar flujo de onboarding",
  },
  {
    id: "n3",
    type: "status",
    title: "Una tarea pasó a revisión",
    body: "Validar flujo de onboarding",
    time: "Hace 2 h",
    unread: true,
    project_id: "demo-1",
    task_id: "t7",
    project_name: "Lanzamiento Q3",
    task_title: "Validar flujo de onboarding",
  },
  {
    id: "n4",
    type: "due",
    title: "Vence hoy",
    body: "Rediseñar página de precios",
    time: "Hace 4 h",
    unread: false,
    project_id: "demo-1",
    task_id: "t3",
    project_name: "Lanzamiento Q3",
    task_title: "Rediseñar página de precios",
  },
];

const seedComments: Record<string, TaskComment[]> = {
  t3: [
    {
      id: "c1",
      body: "Ya quedó lista la jerarquía. Falta validar el bloque de preguntas frecuentes.",
      author: "Ana Morales",
      author_id: "am",
      time: "Hace 1 h",
      reactions: [
        { user_id: "jp", emoji: "👍" },
        { user_id: "lc", emoji: "👍" },
      ],
      attachments: [],
    },
    {
      id: "c2",
      body: "Yo reviso la versión móvil hoy por la tarde.",
      author: "Diego Ruiz",
      author_id: "dr",
      time: "Hace 38 min",
      reactions: [{ user_id: "am", emoji: "👀" }],
      attachments: [],
    },
  ],
};

const seedActivity: ActivityEvent[] = [
  {
    id: "a1",
    actor_id: "am",
    project_id: "demo-1",
    task_id: "t1",
    verb: "created",
    detail: "Creó “Definir narrativa de campaña”",
    created_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
  {
    id: "a2",
    actor_id: "dr",
    project_id: "demo-1",
    task_id: "t3",
    verb: "moved",
    detail: "Movió “Rediseñar página de precios” a Por hacer",
    created_at: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
  },
  {
    id: "a3",
    actor_id: "lc",
    project_id: "demo-1",
    task_id: "t5",
    verb: "checked",
    detail: "Completó el paso “Crear flujo”",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "a4",
    actor_id: "jp",
    project_id: "demo-1",
    task_id: "t4",
    verb: "commented",
    detail: "Comentó en “Preparar kit comercial”",
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "a5",
    actor_id: "am",
    project_id: "demo-1",
    task_id: "t8",
    verb: "completed",
    detail: "Terminó “Manual de tono de voz”",
    created_at: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
  },
];

function dueLabel(due: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  return new Date(`${due}T12:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function relativeTime(value?: string) {
  if (!value) return "Sin actividad registrada";
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} ${days === 1 ? "día" : "días"}`;
}

function projectImageStoragePath(url?: string | null) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return url.replace(/^\/+/, "");
  const markers = [
    "/storage/v1/object/public/project-images/",
    "/storage/v1/object/sign/project-images/",
  ];
  for (const marker of markers) {
    const markerIndex = url.indexOf(marker);
    if (markerIndex >= 0)
      return decodeURIComponent(
        url.slice(markerIndex + marker.length).split("?", 1)[0],
      );
  }
  return null;
}

async function signedStorageUrl(bucket: string, path?: string | null) {
  if (!path || !supabase) return null;
  if (/^https:\/\//i.test(path)) return path;
  const driveId = driveFileId(path);
  if (driveId) {
    const token = await currentAccessToken();
    if (!token) return null;
    const response = await fetch(
      `/api/drive/files/${encodeURIComponent(driveId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    return URL.createObjectURL(await response.blob());
  }
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 24 * 60 * 60);
  return error ? null : data.signedUrl;
}

function CommentImagePreview({
  attachment,
}: {
  attachment: CommentAttachment;
}) {
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{
    status: "loading" | "ready" | "error";
    url: string;
    owned: boolean;
  }>(() => ({
    status: attachment.local_url ? "ready" : "loading",
    url: attachment.local_url || "",
    owned: false,
  }));

  useEffect(() => {
    if (attachment.local_url) return;
    let active = true;
    let ownedUrl = "";
    void signedStorageUrl(
      "comment-images",
      `${DRIVE_REFERENCE_PREFIX}${attachment.drive_file_id}`,
    )
      .then((url) => {
        if (!active) {
          if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        if (!url) {
          setPreview({ status: "error", url: "", owned: false });
          return;
        }
        ownedUrl = url.startsWith("blob:") ? url : "";
        setPreview({ status: "ready", url, owned: Boolean(ownedUrl) });
      })
      .catch(() => {
        if (active) setPreview({ status: "error", url: "", owned: false });
      });
    return () => {
      active = false;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [attachment.drive_file_id, attachment.local_url, attempt]);

  if (preview.status === "loading")
    return (
      <div className="comment-image-loading" role="status">
        <Loader2 className="spin" size={20} />
        <span>Cargando vista previa…</span>
      </div>
    );

  if (preview.status === "error" || !preview.url)
    return (
      <button
        type="button"
        className="comment-image-retry"
        onClick={() => {
          setPreview({ status: "loading", url: "", owned: false });
          setAttempt((current) => current + 1);
        }}
      >
        <ImagePlus size={20} />
        <span>
          <strong>No pudimos mostrar la imagen</strong>
          <small>Haz clic para volver a cargarla</small>
        </span>
      </button>
    );

  return (
    <button
      type="button"
      className="comment-image-preview"
      onClick={() => window.open(preview.url, "_blank", "noopener,noreferrer")}
      aria-label={`Abrir ${attachment.file_name}`}
    >
      {/* Las imágenes privadas llegan como blob; el elemento nativo evita que
          el cargador de Next intercepte o difiera esa dirección temporal. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview.url}
        alt={attachment.file_name}
        loading="eager"
        decoding="async"
        onError={() => {
          if (preview.owned) URL.revokeObjectURL(preview.url);
          setPreview({ status: "error", url: "", owned: false });
        }}
      />
    </button>
  );
}

function driveFileId(reference?: string | null) {
  if (!reference?.startsWith(DRIVE_REFERENCE_PREFIX)) return null;
  const id = reference.slice(DRIVE_REFERENCE_PREFIX.length);
  return /^[A-Za-z0-9_-]{10,200}$/.test(id) ? id : null;
}

async function currentAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

async function uploadDrivePhoto(
  file: File,
  category: "avatar" | "project-image",
  subjectId: string,
) {
  const token = await currentAccessToken();
  if (!token) throw new Error("Tu sesión terminó. Vuelve a iniciar sesión.");
  const initiated = await fetch("/api/drive/uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category,
      subjectId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
    }),
  });
  const initiation = (await initiated.json().catch(() => ({}))) as {
    uploadUrl?: string;
    error?: string;
  };
  if (!initiated.ok || !initiation.uploadUrl)
    throw new Error(
      initiation.error || "No pudimos conectar con Google Drive.",
    );

  const uploaded = await fetch(initiation.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
    },
    body: file,
  });
  const metadata = (await uploaded.json().catch(() => ({}))) as { id?: string };
  if (
    !uploaded.ok ||
    !metadata.id ||
    !/^[A-Za-z0-9_-]{10,200}$/.test(metadata.id)
  )
    throw new Error("La carga a Google Drive no pudo completarse.");
  return {
    reference: `${DRIVE_REFERENCE_PREFIX}${metadata.id}`,
    url: URL.createObjectURL(file),
  };
}

async function deleteStoredImage(bucket: string, reference?: string | null) {
  if (!reference || !supabase) return true;
  const driveId = driveFileId(reference);
  if (driveId) {
    const token = await currentAccessToken();
    if (!token) return false;
    const response = await fetch(
      `/api/drive/files/${encodeURIComponent(driveId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return response.ok;
  }
  const removed = await supabase.storage.from(bucket).remove([reference]);
  return !removed.error;
}

function highlightedMentions(
  text: string,
  directory: WorkspacePerson[],
  keyPrefix: string,
): ReactNode[] {
  const mentions = directory
    .map((person) => ({ person, token: `@${person.full_name}` }))
    .sort((first, second) => second.token.length - first.token.length);
  const content: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let nextMention:
      { index: number; person: WorkspacePerson; token: string } | undefined;
    mentions.forEach(({ person, token }) => {
      const index = text.indexOf(token, cursor);
      if (
        index >= 0 &&
        (!nextMention ||
          index < nextMention.index ||
          (index === nextMention.index &&
            token.length > nextMention.token.length))
      )
        nextMention = { index, person, token };
    });

    if (!nextMention) {
      content.push(text.slice(cursor));
      break;
    }
    if (nextMention.index > cursor)
      content.push(text.slice(cursor, nextMention.index));
    content.push(
      <span
        className="inline-mention"
        key={`${keyPrefix}-${nextMention.person.id}-${nextMention.index}`}
        title={`Persona mencionada: ${nextMention.person.full_name}`}
      >
        <Avatar id={nextMention.person.id} person={nextMention.person} small />
        <strong>{nextMention.token}</strong>
      </span>,
    );
    cursor = nextMention.index + nextMention.token.length;
  }

  return content.length ? content : [text];
}

function LinkifiedText({
  text,
  directory = [],
}: {
  text: string;
  directory?: WorkspacePerson[];
}) {
  const linkPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

  return (
    <>
      {text.split(linkPattern).map((part, index) => {
        if (!/^(?:https?:\/\/|www\.)/i.test(part))
          return highlightedMentions(part, directory, `mention-${index}`);

        let linkText = part;
        let trailingPunctuation = "";
        while (/[),.;!?]$/.test(linkText)) {
          trailingPunctuation = linkText.slice(-1) + trailingPunctuation;
          linkText = linkText.slice(0, -1);
        }

        const href = /^www\./i.test(linkText)
          ? `https://${linkText}`
          : linkText;

        try {
          const url = new URL(href);
          if (url.protocol !== "http:" && url.protocol !== "https:")
            return part;
        } catch {
          return part;
        }

        return (
          <span key={`${linkText}-${index}`}>
            <a
              className="inline-link"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {linkText}
            </a>
            {trailingPunctuation}
          </span>
        );
      })}
    </>
  );
}

function Avatar({
  id,
  small = false,
  person,
}: {
  id: string;
  small?: boolean;
  person?: WorkspacePerson;
}) {
  const fallback = people.find((item) => item.id === id) || {
    name: "Equipo Spartanblue",
    initials: "TW",
    color: "#327B9F",
  };
  const name = person?.full_name || fallback.name;
  const initials = person
    ? person.full_name
        .split(" ")
        .map((word) => word[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : fallback.initials;
  return (
    <span
      className={`avatar ${small ? "avatar-small" : ""}`}
      style={{ background: fallback.color }}
      title={name}
    >
      {person?.avatar_url ? (
        <Image
          src={person.avatar_url}
          alt=""
          fill
          sizes={small ? "23px" : "52px"}
          unoptimized={person.avatar_url.startsWith("blob:")}
        />
      ) : (
        initials
      )}
    </span>
  );
}

type TaskActionMenuProps = {
  task: Task;
  projects: WorkspaceProject[];
  activeProjectId: string;
  busy: boolean;
  onOpen: () => void;
  onMoveStatus: (status: Status) => void;
  onMoveProject: (projectId: string) => void;
  onCopy: (projectId: string) => void;
  onShare: () => void;
  onDelete: () => void;
};

function TaskActionMenu({
  task,
  projects,
  activeProjectId,
  busy,
  onOpen,
  onMoveStatus,
  onMoveProject,
  onCopy,
  onShare,
  onDelete,
}: TaskActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"main" | "move" | "copy">("main");
  const menuRef = useRef<HTMLDivElement>(null);
  const activeProject = projects.find((item) => item.id === activeProjectId);
  const otherProjects = projects.filter((item) => item.id !== activeProjectId);
  const availableStatusColumns = columns.filter(
    (column) =>
      column.key !== "unassigned" ||
      activeProject?.name === TICKET_PROJECT_NAME,
  );

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
    setPanel("main");
  }

  function run(action: () => void) {
    closeMenu();
    action();
  }

  return (
    <div className="task-action-wrap" ref={menuRef}>
      <button
        type="button"
        className="icon-button card-more"
        aria-label={`Opciones de ${task.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          setOpen((current) => !current);
          setPanel("main");
        }}
      >
        {busy ? (
          <Loader2 className="spin" size={15} />
        ) : (
          <MoreHorizontal size={17} />
        )}
      </button>

      {open && (
        <div className="task-action-menu" role="menu">
          {panel === "main" ? (
            <>
              <div className="task-menu-title">
                <strong>Opciones del to-do</strong>
                <small>{task.title}</small>
              </div>
              <button type="button" role="menuitem" onClick={() => run(onOpen)}>
                <ClipboardList size={16} />
                <span>Abrir tarea</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setPanel("move")}
              >
                <MoveRight size={16} />
                <span>Mover…</span>
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setPanel("copy")}
              >
                <CopyPlus size={16} />
                <span>Hacer una copia…</span>
                <ChevronRight size={15} />
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => run(onShare)}
              >
                <Share2 size={16} />
                <span>Compartir enlace</span>
              </button>
              {task.status !== "backlog" && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => run(() => onMoveStatus("backlog"))}
                >
                  <Archive size={16} />
                  <span>Guardar en Backlog</span>
                </button>
              )}
              <div className="task-menu-separator" />
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => run(onDelete)}
              >
                <Trash2 size={16} />
                <span>Eliminar tarea</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="task-menu-back"
                onClick={() => setPanel("main")}
              >
                <ArrowLeft size={15} />
                {panel === "move" ? "Mover to-do" : "Copiar to-do"}
              </button>
              {panel === "move" && (
                <>
                  <span className="task-menu-label">ESTADO</span>
                  {availableStatusColumns.map((column) => (
                    <button
                      type="button"
                      role="menuitem"
                      className={task.status === column.key ? "selected" : ""}
                      disabled={task.status === column.key}
                      key={column.key}
                      onClick={() => run(() => onMoveStatus(column.key))}
                    >
                      <i style={{ background: column.dot }} />
                      <span>{column.label}</span>
                      {task.status === column.key && <Check size={15} />}
                    </button>
                  ))}
                  {otherProjects.length > 0 && (
                    <span className="task-menu-label">OTRO PROYECTO</span>
                  )}
                  {otherProjects.map((projectOption) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={projectOption.id}
                      onClick={() => run(() => onMoveProject(projectOption.id))}
                    >
                      <span
                        className="project-menu-dot"
                        style={{ background: projectOption.color }}
                      />
                      <span>{projectOption.name}</span>
                      <FolderInput size={15} />
                    </button>
                  ))}
                </>
              )}
              {panel === "copy" && (
                <>
                  <span className="task-menu-label">DESTINO</span>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => run(() => onCopy(activeProjectId))}
                  >
                    <Copy size={16} />
                    <span>{activeProject?.name || "Este proyecto"}</span>
                    <small>Aquí</small>
                  </button>
                  {otherProjects.map((projectOption) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={projectOption.id}
                      onClick={() => run(() => onCopy(projectOption.id))}
                    >
                      <span
                        className="project-menu-dot"
                        style={{ background: projectOption.color }}
                      />
                      <span>{projectOption.name}</span>
                      <Copy size={15} />
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectActionMenu({
  project,
  busy,
  canManage,
  onEdit,
  onArchive,
  onDelete,
}: {
  project: WorkspaceProject;
  busy: boolean;
  canManage: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const protectedProject = isTicketProject(project);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="project-action-wrap" ref={menuRef}>
      <button
        type="button"
        className="secondary-button project-menu-trigger"
        aria-label={`Administrar ${project.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
      >
        {busy ? (
          <Loader2 className="spin" size={17} />
        ) : (
          <MoreHorizontal size={18} />
        )}
      </button>
      {open && (
        <div className="task-action-menu project-action-menu" role="menu">
          <div className="task-menu-title">
            <strong>Opciones del proyecto</strong>
            <small>{project.name}</small>
          </div>
          {canManage ? (
            <>
              <button type="button" role="menuitem" onClick={() => run(onEdit)}>
                <Settings size={16} />
                <span>Editar información</span>
              </button>
              <button type="button" role="menuitem" onClick={() => run(onEdit)}>
                <Camera size={16} />
                <span>Cambiar color o foto</span>
              </button>
              {protectedProject ? (
                <p className="project-menu-protected">
                  <ShieldCheck size={16} />
                  Mesa de Tickets está protegida contra archivo y eliminación.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => run(onArchive)}
                  >
                    <Archive size={16} />
                    <span>Archivar proyecto</span>
                  </button>
                  <div className="task-menu-separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => run(onDelete)}
                  >
                    <Trash2 size={16} />
                    <span>Eliminar proyecto</span>
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="project-menu-note">
              Solo la persona propietaria puede editar o eliminar este proyecto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  href,
  directory,
  projects,
  activeProjectId,
  actionBusy,
  onOpen,
  onToggleDone,
  onMoveStatus,
  onMoveProject,
  onCopy,
  onShare,
  onDelete,
}: {
  task: Task;
  href: string;
  directory: WorkspacePerson[];
  projects: WorkspaceProject[];
  activeProjectId: string;
  actionBusy: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onMoveStatus: (status: Status) => void;
  onMoveProject: (projectId: string) => void;
  onCopy: (projectId: string) => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const complete = task.steps.filter((s) => s.completed).length;
  return (
    <article
      className="task-card"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)}
    >
      <a
        className="task-open-hit"
        aria-label={`Abrir ${task.title}`}
        href={href}
        onClick={(event) => {
          if (!shouldHandleInternalLink(event)) return;
          event.preventDefault();
          onOpen();
        }}
      />
      <div className="task-topline">
        <button
          className={`task-check ${task.status === "done" ? "checked" : ""}`}
          aria-label={
            task.status === "done" ? "Reabrir tarea" : "Completar tarea"
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone();
          }}
        >
          {task.status === "done" && <Check size={14} />}
        </button>
        <div className="label-row">
          {task.labels.map((label) => (
            <span className="task-label" key={label}>
              {label}
            </span>
          ))}
        </div>
        <TaskActionMenu
          task={task}
          projects={projects}
          activeProjectId={activeProjectId}
          busy={actionBusy}
          onOpen={onOpen}
          onMoveStatus={onMoveStatus}
          onMoveProject={onMoveProject}
          onCopy={onCopy}
          onShare={onShare}
          onDelete={onDelete}
        />
      </div>
      <h3>{task.title}</h3>
      <p>{plainTextFromDescription(task.description)}</p>
      {task.steps.length > 0 && (
        <div className="progress-line">
          <span style={{ width: `${(complete / task.steps.length) * 100}%` }} />
        </div>
      )}
      <div className="task-meta">
        <span className={`due ${task.due === "Hoy" ? "due-now" : ""}`}>
          <CalendarDays size={14} />
          {dueLabel(task.due)}
        </span>
        <span>
          <ClipboardList size={14} />
          {complete}/{task.steps.length}
        </span>
        <span>
          <MessageCircle size={14} />
          {task.comments}
        </span>
        <span className="assignees">
          {task.assignees.length > 0 ? (
            task.assignees.map((id) => (
              <Avatar
                id={id}
                person={directory.find((item) => item.id === id)}
                small
                key={id}
              />
            ))
          ) : (
            <span className="unassigned-chip">Sin asignar</span>
          )}
        </span>
      </div>
    </article>
  );
}

export default function Home() {
  const [authReady, setAuthReady] = useState(!hasSupabase);
  const [session, setSession] = useState<Session | null>(null);
  const [demo, setDemo] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordResetStep, setPasswordResetStep] = useState<
    "idle" | "email" | "verify"
  >("idle");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const preferredTheme = window.localStorage.getItem("tw-theme");
    return preferredTheme === "dark";
  });
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [tasks, setTasks] = useState<Task[]>(hasSupabase ? [] : initialTasks);
  const [workspaceTasks, setWorkspaceTasks] = useState<WorkspaceTask[]>(
    hasSupabase
      ? []
      : initialTasks.map((task) => ({
          ...task,
          projectId: "demo-1",
          projectName: "Lanzamiento Q3",
        })),
  );
  const [workspaceTasksLoading, setWorkspaceTasksLoading] =
    useState(hasSupabase);
  const [bubbleTaskIdsByUser, setBubbleTaskIdsByUser] = useState<
    Record<string, string[]>
  >(readBubbleUpPreferences);
  const [draggedBubbleTaskId, setDraggedBubbleTaskId] = useState<string | null>(
    null,
  );
  const [bubbleDropTargetId, setBubbleDropTargetId] = useState<string | null>(
    null,
  );
  const [projects, setProjects] = useState<WorkspaceProject[]>(
    hasSupabase ? [] : demoProjects,
  );
  const [archivedProjects, setArchivedProjects] = useState<WorkspaceProject[]>(
    [],
  );
  const [workspaceTemplates, setWorkspaceTemplates] = useState(templates);
  const [workspacePeople, setWorkspacePeople] = useState<WorkspacePerson[]>([]);
  const [projectMemberIds, setProjectMemberIds] = useState<string[]>(
    hasSupabase ? [] : people.map((person) => person.id),
  );
  const [workspaceMemberIdsByProject, setWorkspaceMemberIdsByProject] =
    useState<Record<string, string[]>>(
      hasSupabase
        ? {}
        : Object.fromEntries(
            demoProjects.map((item) => [
              item.id,
              people.map((person) => person.id),
            ]),
          ),
    );
  const [projectMemberModal, setProjectMemberModal] = useState(false);
  const [projectMemberSearch, setProjectMemberSearch] = useState("");
  const [projectMemberBusy, setProjectMemberBusy] = useState<string | null>(
    null,
  );
  const [teamSearch, setTeamSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<WorkspacePerson | null>(
    null,
  );
  const [weeklyReportBusy, setWeeklyReportBusy] = useState<string | null>(null);
  const [weeklyReportMessage, setWeeklyReportMessage] = useState("");
  const [reportPhoneDraft, setReportPhoneDraft] = useState("");
  const [reportProfileBusy, setReportProfileBusy] = useState(false);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>(
    hasSupabase ? [] : seedActivity,
  );
  const [activeProjectId, setActiveProjectId] = useState(
    hasSupabase ? "" : "demo-1",
  );
  const [view, setView] = useState("home");
  const [projectView, setProjectView] = useState<ProjectView>("board");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState<Status>("todo");
  const [project, setProject] = useState(hasSupabase ? "" : "Lanzamiento Q3");
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>(
    hasSupabase ? [] : seedNotifications,
  );
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<
    "new" | "mentions" | "read"
  >("new");
  const [ticketInboxCount, setTicketInboxCount] = useState(hasSupabase ? 0 : 1);
  const [desktopPermission, setDesktopPermission] =
    useState<DesktopNotificationPermission>("unsupported");
  const [desktopPromptDismissed, setDesktopPromptDismissed] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [taskCreating, setTaskCreating] = useState(false);
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskSteps, setNewTaskSteps] = useState<string[]>([""]);
  const [newTaskAssigneeIds, setNewTaskAssigneeIds] = useState<string[]>([]);
  const [newTaskAssigneeSearch, setNewTaskAssigneeSearch] = useState("");
  const [newTaskAssigneeOpen, setNewTaskAssigneeOpen] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectEditModal, setProjectEditModal] = useState(false);
  const [projectDraftColor, setProjectDraftColor] = useState("#327B9F");
  const [projectImageFile, setProjectImageFile] = useState<File | null>(null);
  const [removeProjectImage, setRemoveProjectImage] = useState(false);
  const [projectToDelete, setProjectToDelete] =
    useState<WorkspaceProject | null>(null);
  const [projectDeleteConfirmation, setProjectDeleteConfirmation] =
    useState("");
  const [taskActionBusy, setTaskActionBusy] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [ticketResolutionTask, setTicketResolutionTask] =
    useState<Task | null>(null);
  const [ticketResolutionDraft, setTicketResolutionDraft] = useState("");
  const [ticketResolutionError, setTicketResolutionError] = useState("");
  const ticketResolutionSubmittingRef = useRef(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [templateSeed, setTemplateSeed] = useState<{
    title: string;
    description: string;
    steps: string;
  } | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDetailFullscreen, setTaskDetailFullscreen] = useState(false);
  const [taskEditing, setTaskEditing] = useState(false);
  const [taskEditBusy, setTaskEditBusy] = useState(false);
  const [taskEditSteps, setTaskEditSteps] = useState<Task["steps"]>([]);
  const [commentsByTask, setCommentsByTask] = useState<
    Record<string, TaskComment[]>
  >(hasSupabase ? {} : seedComments);
  const [commentDraft, setCommentDraft] = useState("");
  const [pendingCommentImages, setPendingCommentImages] = useState<
    PendingCommentImage[]
  >([]);
  const [commentAttachmentTargetId, setCommentAttachmentTargetId] = useState<
    string | null
  >(null);
  const [commentImageError, setCommentImageError] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoadError, setCommentsLoadError] = useState("");
  const [taskReactions, setTaskReactions] = useState<
    { user_id: string; emoji: string }[]
  >([]);
  const [taskFollowing, setTaskFollowing] = useState(false);
  const [taskSocialBusy, setTaskSocialBusy] = useState(false);
  const [taskReactionPickerOpen, setTaskReactionPickerOpen] = useState(false);
  const [commentReactionPickerId, setCommentReactionPickerId] = useState<
    string | null
  >(null);
  const [commentReactionBusyId, setCommentReactionBusyId] = useState<
    string | null
  >(null);
  const [commentToDelete, setCommentToDelete] = useState<TaskComment | null>(
    null,
  );
  const [commentDeleteBusyId, setCommentDeleteBusyId] = useState<string | null>(
    null,
  );
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionedPeople, setMentionedPeople] = useState<WorkspacePerson[]>([]);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assigneeBusy, setAssigneeBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [projectsMenuOpen, setProjectsMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const assigneePickerRef = useRef<HTMLDivElement>(null);
  const taskReactionPickerRef = useRef<HTMLDivElement>(null);
  const commentReactionPickerRef = useRef<HTMLDivElement>(null);
  const commentComposeRef = useRef<HTMLDivElement>(null);
  const newTaskAssigneeRef = useRef<HTMLDivElement>(null);
  const commentSubmittingRef = useRef(false);
  const commentImageInputRef = useRef<HTMLInputElement>(null);
  const selectedTaskIdRef = useRef<string | null>(null);
  const sessionUserId = session?.user.id || "";
  const ticketProject = projects.find((item) => isTicketProject(item));
  const regularProjects = projects.filter((item) => !isTicketProject(item));
  const ticketProjectId = ticketProject?.id || "";
  const activeProjectIsTicketInbox =
    Boolean(activeProjectId) && activeProjectId === ticketProjectId;
  const workspaceProjectScope = projects.map((item) => item.id).join(",");
  const activeWorkflowColumns = workflowColumns.filter(
    (column) => column.key !== "unassigned" || activeProjectIsTicketInbox,
  );
  const activeTaskStatusColumns = columns.filter(
    (column) => column.key !== "unassigned" || activeProjectIsTicketInbox,
  );

  useEffect(() => {
    if (!supabase) return;
    const readinessTimeout = window.setTimeout(() => setAuthReady(true), 2500);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      window.clearTimeout(readinessTimeout);
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("tw-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (!("Notification" in window)) return;
    const syncPermission = window.setTimeout(() => {
      setDesktopPermission(Notification.permission);
      setDesktopPromptDismissed(
        window.sessionStorage.getItem("desktop-notifications-dismissed") ===
          "true",
      );
    }, 0);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/notification-sw.js");
    }
    return () => window.clearTimeout(syncPermission);
  }, []);

  useEffect(() => {
    if (
      !assigneePickerOpen &&
      mentionQuery === null &&
      !taskReactionPickerOpen &&
      !commentReactionPickerId &&
      !newTaskAssigneeOpen
    )
      return;
    const closeFloatingPickers = (event: PointerEvent) => {
      const target = event.target as Node;
      if (assigneePickerOpen && !assigneePickerRef.current?.contains(target)) {
        setAssigneePickerOpen(false);
        setAssigneeSearch("");
      }
      if (
        mentionQuery !== null &&
        !commentComposeRef.current?.contains(target)
      ) {
        setMentionQuery(null);
      }
      if (
        taskReactionPickerOpen &&
        !taskReactionPickerRef.current?.contains(target)
      ) {
        setTaskReactionPickerOpen(false);
      }
      if (
        commentReactionPickerId &&
        !commentReactionPickerRef.current?.contains(target)
      ) {
        setCommentReactionPickerId(null);
      }
      if (
        newTaskAssigneeOpen &&
        !newTaskAssigneeRef.current?.contains(target)
      ) {
        setNewTaskAssigneeOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAssigneePickerOpen(false);
      setAssigneeSearch("");
      setMentionQuery(null);
      setTaskReactionPickerOpen(false);
      setCommentReactionPickerId(null);
      setNewTaskAssigneeOpen(false);
    };
    document.addEventListener("pointerdown", closeFloatingPickers);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFloatingPickers);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [
    assigneePickerOpen,
    commentReactionPickerId,
    mentionQuery,
    newTaskAssigneeOpen,
    taskReactionPickerOpen,
  ]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function loadTicketInboxCount(projectId: string) {
    if (!supabase || !projectId) return;
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "unassigned");
    if (typeof count === "number") setTicketInboxCount(count);
  }

  function rememberWorkspaceProjectMembers(
    projectId: string,
    memberIds: string[],
  ) {
    if (!projectId) return;
    setWorkspaceMemberIdsByProject((current) => ({
      ...current,
      [projectId]: Array.from(
        new Set([...(current[projectId] || []), ...memberIds]),
      ),
    }));
  }

  async function loadProjectMembers(projectId: string, ownerId?: string) {
    if (!supabase || !projectId) return;
    const { data, error } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);
    if (error) {
      const fallbackIds = ownerId ? [ownerId] : [];
      setProjectMemberIds(fallbackIds);
      setWorkspaceMemberIdsByProject((current) => ({
        ...current,
        [projectId]: fallbackIds,
      }));
      return;
    }
    const memberIds = (data || []).map((membership) => membership.user_id);
    const completeMemberIds = Array.from(
      new Set(ownerId ? [ownerId, ...memberIds] : memberIds),
    );
    setProjectMemberIds(completeMemberIds);
    setWorkspaceMemberIdsByProject((current) => ({
      ...current,
      [projectId]: completeMemberIds,
    }));
  }

  async function loadLinkedTaskPreview(projectId: string, taskId: string) {
    if (!supabase) return false;
    const [projectResult, taskResult] = await Promise.all([
      supabase
        .from("projects")
        .select("id,name,color,description,image_url,owner_id,archived")
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select(
          "*,task_steps(id,title,completed,position),task_assignees(user_id),task_labels(labels(name)),comments(count)",
        )
        .eq("project_id", projectId)
        .eq("id", taskId)
        .maybeSingle(),
    ]);
    if (
      projectResult.error ||
      taskResult.error ||
      !projectResult.data ||
      !taskResult.data ||
      projectResult.data.archived
    )
      return false;

    const linkedProject = {
      ...(projectResult.data as WorkspaceProject),
      image_path: projectResult.data.image_url || null,
      image_url: null,
    };
    const linkedTask = taskFromRow(
      taskResult.data as unknown as TaskRow,
      isTicketProject(linkedProject) ? linkedProject.id : "",
    );
    setProjects((current) =>
      current.some((item) => item.id === linkedProject.id)
        ? current
        : [linkedProject, ...current],
    );
    setProject(linkedProject.name);
    setActiveProjectId(linkedProject.id);
    setView("board");
    setProjectView("board");
    setTasks([linkedTask]);
    setWorkspaceTasks((current) => [
      {
        ...linkedTask,
        projectId: linkedProject.id,
        projectName: linkedProject.name,
      },
      ...current.filter((item) => item.id !== linkedTask.id),
    ]);
    void loadProjectMembers(linkedProject.id, linkedProject.owner_id);
    void openTask(linkedTask, {
      syncHistory: false,
      projectId: linkedProject.id,
      loadRelated: false,
    });
    return true;
  }

  async function loadWorkspace(userId: string) {
    if (!supabase) return;
    const initialParams = new URLSearchParams(window.location.search);
    const linkedProjectId = initialParams.get("project");
    const linkedTaskId = initialParams.get("task");
    if (
      linkedProjectId &&
      linkedTaskId &&
      !window.history.state?.workspaceRoute
    ) {
      const deepLink = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState({ workspaceRoute: "home" }, "", "/");
      window.history.pushState({ workspaceRoute: "task" }, "", deepLink);
    }
    const linkedTaskPreviewPromise =
      linkedProjectId && linkedTaskId
        ? loadLinkedTaskPreview(linkedProjectId, linkedTaskId)
        : Promise.resolve(false);
    const [teamResult, templateResult, activityResult, projectResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,email,role,avatar_url,phone,areas(name)")
          .order("full_name"),
        supabase
          .from("templates")
          .select("name,description,template_steps(title,position)")
          .order("created_at"),
        supabase
          .from("activity_events")
          .select("id,actor_id,project_id,task_id,verb,detail,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("projects")
          .select("id,name,color,description,image_url,owner_id,archived")
          .order("created_at"),
      ]);
    const team = teamResult.data;
    const signedTeam = await Promise.all(
      ((team as unknown as WorkspacePerson[]) || []).map(async (person) => ({
        ...person,
        avatar_path: person.avatar_url || null,
        avatar_url: await signedStorageUrl("avatars", person.avatar_url),
      })),
    );
    setWorkspacePeople(signedTeam);
    setReportPhoneDraft(
      signedTeam.find((person) => person.id === userId)?.phone || "",
    );
    const templateRows = templateResult.data;
    if (templateRows?.length)
      setWorkspaceTemplates(
        (templateRows as unknown as TemplateRow[]).map((item, index) => ({
          name: item.name,
          description: item.description,
          steps: item.template_steps?.length || 0,
          stepTitles: (item.template_steps || [])
            .sort((a, b) => a.position - b.position)
            .map((step) => step.title),
          icon: ["✦", "↗", "✓"][index % 3],
          color: ["orange", "green", "blue"][index % 3],
        })),
      );
    const activityRows = activityResult.data;
    if (activityRows) setActivityEvents(activityRows as ActivityEvent[]);
    const { data: projectRows, error: projectError } = projectResult;
    if (projectError) {
      setProjects([]);
      setTasks([]);
      setProject("");
      setActiveProjectId("");
      flash("No pudimos cargar tus proyectos. Intenta de nuevo.");
      await loadNotifications(userId);
      return;
    }
    const allProjects = await Promise.all(
      ((projectRows || []) as WorkspaceProject[]).map(async (item) => ({
        ...item,
        image_path: item.image_url || null,
        image_url: await signedStorageUrl("project-images", item.image_url),
      })),
    );
    const safeProjects = allProjects.filter((item) => !item.archived);
    setProjects(safeProjects);
    setArchivedProjects(allProjects.filter((item) => item.archived));
    if (safeProjects.length) {
      const { data: membershipRows } = await supabase
        .from("project_members")
        .select("project_id,user_id")
        .in(
          "project_id",
          safeProjects.map((item) => item.id),
        );
      const membersByProject = Object.fromEntries(
        safeProjects.map((item) => [
          item.id,
          item.owner_id ? [item.owner_id] : [],
        ]),
      ) as Record<string, string[]>;
      (membershipRows || []).forEach((membership) => {
        membersByProject[membership.project_id] = Array.from(
          new Set([
            ...(membersByProject[membership.project_id] || []),
            membership.user_id,
          ]),
        );
      });
      setWorkspaceMemberIdsByProject(membersByProject);
    } else {
      setWorkspaceMemberIdsByProject({});
    }
    const inboxProject = safeProjects.find((item) => isTicketProject(item));
    if (inboxProject) {
      await Promise.all([
        loadTicketInboxCount(inboxProject.id),
        supabase
          .from("tasks")
          .update({ status: "todo" })
          .eq("status", "unassigned")
          .neq("project_id", inboxProject.id),
      ]);
    } else {
      await supabase
        .from("tasks")
        .update({ status: "todo" })
        .eq("status", "unassigned");
    }
    const initialProject =
      safeProjects.find((item) => item.id === linkedProjectId) ||
      safeProjects[0];
    await linkedTaskPreviewPromise;
    await loadWorkspaceTasks(safeProjects, inboxProject?.id || "");
    setView(linkedProjectId ? "board" : "home");
    if (initialProject) {
      setProject(initialProject.name);
      setActiveProjectId(initialProject.id);
      const [loadedTasks] = await Promise.all([
        loadProjectTasks(initialProject.id, inboxProject?.id || ""),
        loadProjectMembers(initialProject.id, initialProject.owner_id),
      ]);
      const linkedTask = loadedTasks.find((task) => task.id === linkedTaskId);
      if (linkedTask)
        await openTask(linkedTask, {
          syncHistory: false,
          projectId: initialProject.id,
        });
    } else {
      setProject("");
      setActiveProjectId("");
      setTasks([]);
      setProjectMemberIds([]);
    }
    await loadNotifications(userId);
  }

  async function loadProjectTasks(
    projectId: string,
    knownTicketProjectId = ticketProjectId,
  ) {
    if (!supabase || !session) return [];
    const { data } = await supabase
      .from("tasks")
      .select(
        "*,task_steps(id,title,completed,position),task_assignees(user_id),task_labels(labels(name)),comments(count)",
      )
      .eq("project_id", projectId)
      .order("position");
    if (!data) return [];
    const loadedTasks = (data as unknown as TaskRow[]).map((row) =>
      taskFromRow(row, knownTicketProjectId),
    );
    setTasks(loadedTasks);
    return loadedTasks;
  }

  async function loadWorkspaceTasks(
    availableProjects: WorkspaceProject[] = projects,
    knownTicketProjectId = ticketProjectId,
  ) {
    if (!supabase || !session) return [];
    const projectIds = availableProjects.map((item) => item.id);
    if (projectIds.length === 0) {
      setWorkspaceTasks([]);
      setWorkspaceTasksLoading(false);
      return [];
    }
    setWorkspaceTasksLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select(
        "*,task_steps(id,title,completed,position),task_assignees(user_id),task_labels(labels(name)),comments(count)",
      )
      .in("project_id", projectIds)
      .neq("status", "backlog")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1000);
    if (error || !data) {
      setWorkspaceTasksLoading(false);
      return [];
    }
    const projectById = new Map(
      availableProjects.map((item) => [item.id, item.name]),
    );
    const loaded = (data as unknown as TaskRow[]).map((row) => ({
      ...taskFromRow(row, knownTicketProjectId),
      projectId: row.project_id,
      projectName: projectById.get(row.project_id) || "Proyecto",
    })) as WorkspaceTask[];
    setWorkspaceTasks(loaded);
    setWorkspaceTasksLoading(false);
    return loaded;
  }

  async function loadNotifications(userId: string) {
    if (!supabase) return;
    const { data } = await supabase
      .from("notifications")
      .select(
        "id,type,title,body,project_id,task_id,created_at,read_at,projects(name),tasks(title)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications(
      ((data || []) as unknown as NotificationRow[]).map((n) => {
        const linkedProject = Array.isArray(n.projects)
          ? n.projects[0]
          : n.projects;
        const linkedTask = Array.isArray(n.tasks) ? n.tasks[0] : n.tasks;
        return {
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          project_id: n.project_id,
          task_id: n.task_id,
          project_name: linkedProject?.name,
          task_title: linkedTask?.title,
          time: new Date(n.created_at).toLocaleString("es-MX", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }),
          unread: !n.read_at,
        };
      }),
    );
  }

  async function showDesktopNotification(note: NotificationRow) {
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;
    const url = note.project_id
      ? `/?project=${note.project_id}${note.task_id ? `&task=${note.task_id}` : ""}`
      : "/";
    const options: NotificationOptions = {
      body: note.body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: `tw-${note.id}`,
      data: { url },
    };
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(note.title, options);
      } else {
        new Notification(note.title, options);
      }
    } catch {
      // La notificación interna permanece disponible si el sistema la bloquea.
    }
  }

  async function enableDesktopNotifications() {
    if (!("Notification" in window)) {
      flash("Este navegador no admite notificaciones de escritorio");
      return;
    }
    const permission = await Notification.requestPermission();
    setDesktopPermission(permission);
    if (permission === "granted") {
      setDesktopPromptDismissed(true);
      window.sessionStorage.setItem("desktop-notifications-dismissed", "true");
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.register(
          "/notification-sw.js",
        );
        await registration.showNotification("Notificaciones activadas", {
          body: "Te avisaremos de asignaciones, menciones y cambios importantes.",
          icon: "/favicon.svg",
          badge: "/favicon.svg",
          tag: "tw-notifications-enabled",
          data: { url: "/" },
        });
      }
      flash("Notificaciones de escritorio activadas");
    } else {
      flash("Puedes activarlas después desde los permisos del navegador");
    }
  }

  function dismissDesktopPrompt() {
    setDesktopPromptDismissed(true);
    window.sessionStorage.setItem("desktop-notifications-dismissed", "true");
  }

  useEffect(() => {
    if (!sessionUserId || !supabase) return;
    // La respuesta asíncrona sincroniza el workspace de la sesión activa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace(sessionUserId);
    // La carga se reinicia únicamente cuando cambia la persona autenticada,
    // no cuando Supabase renueva silenciosamente su token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId || !supabase) return;
    const userId = sessionUserId;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const note = payload.new as NotificationRow;
          void Promise.all([
            loadNotifications(userId),
            showDesktopNotification(note),
          ]);
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId || !supabase || !ticketProjectId) return;
    const channel = supabase
      .channel(`ticket-tasks:${ticketProjectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${ticketProjectId}`,
        },
        () => {
          void loadTicketInboxCount(ticketProjectId);
          if (activeProjectId === ticketProjectId)
            void loadProjectTasks(ticketProjectId);
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
    // Las funciones de carga leen la sesión y el proyecto vigentes del render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId, ticketProjectId, activeProjectId]);

  useEffect(() => {
    if (!session && !demo) return;
    const restoreWorkspaceRoute = async () => {
      const params = new URLSearchParams(window.location.search);
      const projectId = params.get("project");
      const taskId = params.get("task");
      if (!projectId) {
        closeTaskDetail(false);
        setView("home");
        setMobileNav(false);
        return;
      }
      const targetProject = projects.find((item) => item.id === projectId);
      if (!targetProject) {
        closeTaskDetail(false);
        setView("home");
        window.history.replaceState({ workspaceRoute: "home" }, "", "/");
        return;
      }
      const loadedTasks = await switchProject(targetProject, {
        syncHistory: false,
      });
      if (!taskId) {
        closeTaskDetail(false);
        return;
      }
      const targetTask = loadedTasks.find((item) => item.id === taskId);
      if (targetTask) {
        await openTask(targetTask, {
          syncHistory: false,
          projectId: targetProject.id,
        });
      } else {
        closeTaskDetail(false);
        flash("La tarea de este enlace ya no está disponible");
      }
    };
    const handlePopState = () => void restoreWorkspaceRoute();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // Las funciones restauran la vista con el estado vigente del workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId, demo, projects]);

  useEffect(() => {
    if (
      !session ||
      !supabase ||
      !workspaceProjectScope ||
      (view !== "home" && view !== "mytasks" && view !== "team")
    )
      return;
    void loadWorkspaceTasks(projects, ticketProjectId);
    // Refresh global task lists only when entering their views or project scope changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId, view, workspaceProjectScope, ticketProjectId]);

  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          `${task.title} ${plainTextFromDescription(task.description)} ${task.labels.join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (statusFilter === "all" || task.status === statusFilter),
      ),
    [tasks, search, statusFilter],
  );
  const unread = notifications.filter((n) => n.unread).length;
  const newNotificationsCount = notifications.filter(
    (notification) => notification.unread && notification.type !== "mention",
  ).length;
  const mentionNotificationsCount = notifications.filter(
    (notification) => notification.type === "mention",
  ).length;
  const unreadMentionsCount = notifications.filter(
    (notification) => notification.unread && notification.type === "mention",
  ).length;
  const readNotificationsCount = notifications.filter(
    (notification) => !notification.unread && notification.type !== "mention",
  ).length;
  const visibleNotifications = notifications.filter((notification) =>
    notificationTab === "mentions"
      ? notification.type === "mention"
      : notificationTab === "new"
        ? notification.unread && notification.type !== "mention"
        : !notification.unread && notification.type !== "mention",
  );
  const activeProject = projects.find((item) => item.id === activeProjectId);
  const canManageProject =
    Boolean(activeProject) &&
    (demo || activeProject?.owner_id === session?.user.id);
  const displayName =
    session?.user?.user_metadata?.full_name || "Jesús Pacheco";
  const firstName = displayName.split(" ")[0];
  const currentAssigneeId = session?.user?.id || "jp";
  const directory: WorkspacePerson[] = workspacePeople.length
    ? workspacePeople
    : people.map((person) => ({
        id: person.id,
        full_name: person.name,
        email: `${person.name.toLowerCase().replace(" ", ".")}@example.invalid`,
        role: "member",
        avatar_url: null,
        areas: { name: person.area },
      }));
  const currentPerson = directory.find(
    (person) => person.id === currentAssigneeId,
  );
  const projectMembers = directory.filter((person) =>
    projectMemberIds.includes(person.id),
  );
  const normalizedProjectMemberSearch = projectMemberSearch
    .trim()
    .toLowerCase();
  const projectMemberSuggestions = directory
    .filter((person) => !projectMemberIds.includes(person.id))
    .filter((person) =>
      `${person.full_name} ${person.email} ${person.areas?.name || ""}`
        .toLowerCase()
        .includes(normalizedProjectMemberSearch),
    )
    .slice(0, 8);
  const filteredDirectory = directory.filter((person) =>
    `${person.full_name} ${person.email} ${person.areas?.name || ""}`
      .toLowerCase()
      .includes(teamSearch.toLowerCase()),
  );
  const mentionSuggestions =
    mentionQuery === null
      ? []
      : directory
          .filter((person) =>
            `${person.full_name} ${person.email} ${person.areas?.name || ""}`
              .toLowerCase()
              .includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6);
  const assigneeSuggestions = directory
    .filter((person) => !selectedTask?.assignees.includes(person.id))
    .filter((person) =>
      `${person.full_name} ${person.email} ${person.areas?.name || ""}`
        .toLowerCase()
        .includes(assigneeSearch.trim().toLowerCase()),
    )
    .slice(0, 7);
  const normalizedNewTaskAssigneeSearch = newTaskAssigneeSearch
    .trim()
    .toLowerCase();
  const newTaskAssigneeSuggestions = projectMembers
    .filter((person) => !newTaskAssigneeIds.includes(person.id))
    .filter((person) =>
      `${person.full_name} ${person.email} ${person.areas?.name || ""}`
        .toLowerCase()
        .includes(normalizedNewTaskAssigneeSearch),
    )
    .slice(0, 8);
  const newTaskAssignees = projectMembers.filter((person) =>
    newTaskAssigneeIds.includes(person.id),
  );
  const currentTaskReaction = taskReactions.find(
    (reaction) => reaction.user_id === currentAssigneeId,
  );
  const currentTaskReactionLabel = taskReactionOptions.find(
    (option) => option.emoji === currentTaskReaction?.emoji,
  )?.label;
  const workflowTasks = tasks.filter((task) => task.status !== "backlog");
  const visibleWorkflowTasks = filteredTasks.filter(
    (task) => task.status !== "backlog",
  );
  const visibleWorkspaceTasks = workspaceTasks.filter((task) =>
    `${task.title} ${plainTextFromDescription(task.description)} ${task.labels.join(" ")} ${task.projectName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const workspacePendingTasks = visibleWorkspaceTasks.filter(
    (task) => task.status !== "done" && task.status !== "backlog",
  );
  const myWorkspaceTasks = workspacePendingTasks.filter((task) =>
    task.assignees.includes(currentAssigneeId),
  );
  const bubbleTaskIds = bubbleTaskIdsByUser[currentAssigneeId] || [];
  const bubbleTasks = bubbleTaskIds
    .map((taskId) => myWorkspaceTasks.find((task) => task.id === taskId))
    .filter((task): task is WorkspaceTask => Boolean(task));
  const regularMyWorkspaceTasks = myWorkspaceTasks.filter(
    (task) => !bubbleTaskIds.includes(task.id),
  );
  const orderedRegularMyWorkspaceTasks = [
    ...regularMyWorkspaceTasks.filter((task) => task.status !== "review"),
    ...regularMyWorkspaceTasks.filter((task) => task.status === "review"),
  ];
  const orderedMyWorkspaceTasks = [
    ...bubbleTasks,
    ...orderedRegularMyWorkspaceTasks,
  ];

  function persistBubbleTaskIds(taskIds: string[]) {
    const next = {
      ...bubbleTaskIdsByUser,
      [currentAssigneeId]: taskIds,
    };
    setBubbleTaskIdsByUser(next);
    try {
      window.localStorage.setItem(BUBBLE_UP_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // El orden sigue activo durante esta sesión aunque el navegador no pueda guardarlo.
    }
  }

  function toggleBubbleTask(taskId: string) {
    const validIds = bubbleTaskIds.filter((savedTaskId) =>
      myWorkspaceTasks.some((task) => task.id === savedTaskId),
    );
    if (validIds.includes(taskId)) {
      persistBubbleTaskIds(
        validIds.filter((savedTaskId) => savedTaskId !== taskId),
      );
      flash("Tarea retirada de Bubble up.");
      return;
    }

    persistBubbleTaskIds([...validIds, taskId]);
    flash(`Tarea agregada a Bubble up en la posición ${validIds.length + 1}.`);
  }

  function reorderBubbleTasks(sourceTaskId: string, targetTaskId?: string) {
    const validIds = bubbleTaskIds.filter((savedTaskId) =>
      myWorkspaceTasks.some((task) => task.id === savedTaskId),
    );
    if (!validIds.includes(sourceTaskId)) return;

    const withoutSource = validIds.filter((taskId) => taskId !== sourceTaskId);
    const targetIndex = targetTaskId
      ? validIds.indexOf(targetTaskId)
      : withoutSource.length;
    if (targetTaskId && targetIndex < 0) return;

    withoutSource.splice(
      Math.min(targetIndex, withoutSource.length),
      0,
      sourceTaskId,
    );
    if (withoutSource.every((taskId, index) => taskId === validIds[index])) {
      return;
    }

    persistBubbleTaskIds(withoutSource);
    flash("Orden de Bubble up actualizado.");
  }

  function dropBubbleTask(
    event: ReactDragEvent<HTMLElement>,
    targetTaskId?: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const sourceTaskId =
      draggedBubbleTaskId || event.dataTransfer.getData("text/plain");
    if (sourceTaskId) reorderBubbleTasks(sourceTaskId, targetTaskId);
    setDraggedBubbleTaskId(null);
    setBubbleDropTargetId(null);
  }
  const completedTasks = workflowTasks.filter(
    (task) => task.status === "done",
  ).length;
  const progress = workflowTasks.length
    ? Math.round((completedTasks / workflowTasks.length) * 100)
    : 0;
  const urgentTasks = workflowTasks.filter(
    (task) => task.priority === "urgent" && task.status !== "done",
  ).length;
  const selectedPersonTasks = selectedPerson
    ? workspaceTasks.filter((task) =>
        task.assignees.includes(selectedPerson.id),
      )
    : [];
  const selectedPersonActivity = selectedPerson
    ? activityEvents
        .filter((event) => event.actor_id === selectedPerson.id)
        .slice(0, 12)
    : [];
  const calendarGroups = [
    {
      label: "Hoy",
      caption: "Lo que necesita atención inmediata",
      tasks: visibleWorkflowTasks.filter((task) => task.due === "Hoy"),
    },
    {
      label: "Mañana",
      caption: "El siguiente paso del equipo",
      tasks: visibleWorkflowTasks.filter((task) => task.due === "Mañana"),
    },
    {
      label: "Próximos",
      caption: "Entregas con fecha programada",
      tasks: visibleWorkflowTasks.filter(
        (task) => !["Hoy", "Mañana", "Sin fecha"].includes(task.due),
      ),
    },
    {
      label: "Sin fecha",
      caption: "Pendientes que todavía pueden esperar",
      tasks: visibleWorkflowTasks.filter((task) => task.due === "Sin fecha"),
    },
  ];

  function startDemo() {
    setDemo(true);
    setProjects(demoProjects);
    setTasks(initialTasks.filter((task) => !task.externalSource));
    setActivityEvents(seedActivity);
    setNotifications(seedNotifications);
    setTicketInboxCount(1);
    setCommentsByTask(seedComments);
    setTaskReactions([]);
    setTaskFollowing(false);
    setProject("Lanzamiento Q3");
    setActiveProjectId("demo-1");
    setView("home");
    setProjectView("board");
    window.history.replaceState({ workspaceRoute: "home" }, "", "/");
  }

  function goHome() {
    closeTaskDetail(false);
    setView("home");
    setMobileNav(false);
    window.history.pushState({ workspaceRoute: "home" }, "", "/");
  }

  function openTaskCreator(
    status: Status = "todo",
    seed: { title: string; description: string; steps: string } | null = null,
  ) {
    if (!activeProjectId) {
      setProjectModal(true);
      flash("Crea un proyecto antes de agregar tareas");
      return;
    }
    setNewTaskStatus(status);
    setNewTaskProjectId(activeProjectId);
    setTemplateSeed(seed);
    setNewTaskSteps(
      seed?.steps
        .split("\n")
        .map((step) => step.trim())
        .filter(Boolean) || [""],
    );
    setNewTaskAssigneeIds([]);
    setNewTaskAssigneeSearch("");
    setNewTaskAssigneeOpen(false);
    setTaskModal(true);
  }

  function closeTaskCreator() {
    if (taskCreating) return;
    setTaskModal(false);
    setNewTaskProjectId("");
    setNewTaskSteps([""]);
    setTemplateSeed(null);
    setNewTaskAssigneeIds([]);
    setNewTaskAssigneeSearch("");
    setNewTaskAssigneeOpen(false);
  }

  function toggleNewTaskAssignee(personId: string) {
    setNewTaskAssigneeIds((current) => {
      if (current.includes(personId))
        return current.filter((id) => id !== personId);
      if (current.length >= 10) {
        flash("Puedes asignar hasta 10 personas al crear el to-do");
        return current;
      }
      return [...current, personId];
    });
    setNewTaskAssigneeSearch("");
  }

  function updateNewTaskStep(index: number, title: string) {
    setNewTaskSteps((current) =>
      current.map((step, stepIndex) => (stepIndex === index ? title : step)),
    );
  }

  function addNewTaskStep(afterIndex = newTaskSteps.length - 1) {
    setNewTaskSteps((current) => [
      ...current.slice(0, afterIndex + 1),
      "",
      ...current.slice(afterIndex + 1),
    ]);
  }

  function removeNewTaskStep(index: number) {
    setNewTaskSteps((current) => {
      const next = current.filter((_, stepIndex) => stepIndex !== index);
      return next.length ? next : [""];
    });
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage(
        "El registro no está disponible porque falta configurar el servicio de acceso de Spartanblue.",
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (authMode === "signup") {
        if (
          password.length < 12 ||
          !/[a-z]/.test(password) ||
          !/[A-Z]/.test(password) ||
          !/[0-9]/.test(password) ||
          !/[^A-Za-z0-9]/.test(password)
        ) {
          setAuthMessage(
            "Usa al menos 12 caracteres con mayúscula, minúscula, número y símbolo.",
          );
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: String(form.get("name") || "").trim(),
              area_name: String(form.get("area") || "").trim(),
            },
          },
        });
        setAuthMessage(
          error
            ? error.message
            : data.session
              ? "Cuenta creada. Ya puedes comenzar."
              : "Cuenta creada. Revisa tu correo para confirmar la cuenta y después inicia sesión.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) setAuthMessage(error.message);
      }
    } catch {
      setAuthMessage(
        "No pudimos conectar con el servicio de acceso. Inténtalo de nuevo en unos minutos.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  function passwordMeetsRequirements(password: string) {
    return (
      password.length >= 12 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
    );
  }

  function closePasswordReset() {
    setPasswordResetStep("idle");
    setResetCode("");
    setResetPassword("");
    setResetPasswordConfirm("");
    setShowResetPassword(false);
    setResetMessage("");
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || resetBusy) return;
    const email = resetEmail.trim().toLowerCase();
    setResetBusy(true);
    setResetMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        setResetMessage(
          "No pudimos enviar el código. Espera un momento e inténtalo otra vez.",
        );
        return;
      }
      setResetEmail(email);
      setPasswordResetStep("verify");
      setResetMessage(
        "Si el correo está registrado, recibirás un código de verificación. Revisa también Spam.",
      );
    } finally {
      setResetBusy(false);
    }
  }

  async function resendPasswordResetCode() {
    if (!supabase || resetBusy || !resetEmail) return;
    setResetBusy(true);
    setResetMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail);
      setResetMessage(
        error
          ? "No pudimos reenviar el código todavía. Espera un momento e inténtalo otra vez."
          : "Código reenviado. El código anterior deja de ser válido.",
      );
    } finally {
      setResetBusy(false);
    }
  }

  async function confirmPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || resetBusy) return;
    const token = resetCode.replace(/\D/g, "");
    if (token.length < 6 || token.length > 8) {
      setResetMessage("Escribe el código completo que recibiste por correo.");
      return;
    }
    if (!passwordMeetsRequirements(resetPassword)) {
      setResetMessage(
        "Usa al menos 12 caracteres con mayúscula, minúscula, número y símbolo.",
      );
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetMessage("Las contraseñas no coinciden.");
      return;
    }

    setResetBusy(true);
    setResetMessage("");
    try {
      const { error: verificationError } = await supabase.auth.verifyOtp({
        email: resetEmail,
        token,
        type: "recovery",
      });
      if (verificationError) {
        setResetMessage(
          "El código no es válido o ya venció. Solicita uno nuevo e inténtalo otra vez.",
        );
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: resetPassword,
      });
      if (updateError) {
        setResetMessage(
          "No pudimos guardar la contraseña nueva. Inténtalo otra vez.",
        );
        return;
      }
      await supabase.auth.signOut();
      closePasswordReset();
      setAuthMode("login");
      setAuthMessage(
        "Contraseña actualizada. Ya puedes iniciar sesión con la nueva.",
      );
    } finally {
      setResetBusy(false);
    }
  }

  function statusForProject(status: Status, projectId: string): Status {
    const destination = projects.find((item) => item.id === projectId);
    return status === "unassigned" && destination?.name !== TICKET_PROJECT_NAME
      ? "todo"
      : status;
  }

  async function moveTask(
    id: string,
    status: Status,
    options: { ticketResolution?: string } = {},
  ) {
    const nextStatus = statusForProject(status, activeProjectId);
    const previous = tasks.find((task) => task.id === id);
    if (!previous || previous.status === nextStatus || taskActionBusy === id)
      return;
    const resolvingTicket =
      previous.externalSource === "ticket_system" && nextStatus === "done";
    const ticketResolution = options.ticketResolution?.trim() || "";
    if (resolvingTicket && ticketResolution.length < 3) {
      setTicketResolutionTask(previous);
      setTicketResolutionDraft("");
      setTicketResolutionError("");
      return;
    }
    const optimisticUpdatedAt = new Date().toISOString();
    setTaskActionBusy(id);
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? { ...task, status: nextStatus, updatedAt: optimisticUpdatedAt }
          : task,
      ),
    );
    setSelectedTask((current) =>
      current?.id === id
        ? { ...current, status: nextStatus, updatedAt: optimisticUpdatedAt }
        : current,
    );
    const verb: ActivityEvent["verb"] =
      nextStatus === "done"
        ? "completed"
        : previous?.status === "done"
          ? "reopened"
          : "moved";
    const detail = `${nextStatus === "done" ? "Terminó" : previous?.status === "done" ? "Reabrió" : "Movió"} “${previous?.title || "una tarea"}”${nextStatus === "done" ? "" : ` a ${columns.find((column) => column.key === nextStatus)?.label}`}`;
    if (session && supabase && !id.startsWith("t") && !id.startsWith("local")) {
      let persistedUpdatedAt = optimisticUpdatedAt;
      let updateError = "";
      if (resolvingTicket) {
        try {
          const response = await fetch("/api/tickets/resolve", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ taskId: id, resolution: ticketResolution }),
          });
          const result = (await response.json().catch(() => ({}))) as {
            error?: string;
            updatedAt?: string;
          };
          if (!response.ok) {
            updateError =
              result.error ||
              "No pudimos enviar la resolución. El ticket sigue abierto.";
          } else if (result.updatedAt) {
            persistedUpdatedAt = result.updatedAt;
          }
        } catch {
          updateError =
            "No pudimos contactar la Mesa de tickets. El ticket sigue abierto.";
        }
      } else {
        const updated = await supabase
          .from("tasks")
          .update({ status: nextStatus })
          .eq("id", id)
          .select("id,updated_at")
          .single();
        if (updated.error) {
          updateError = "No pudimos mover la tarea. Intenta de nuevo.";
        } else {
          persistedUpdatedAt = updated.data.updated_at;
        }
      }
      if (updateError) {
        setTasks((current) =>
          current.map((task) =>
            task.id === id
              ? {
                  ...task,
                  status: previous.status,
                  updatedAt: previous.updatedAt,
                }
              : task,
          ),
        );
        setSelectedTask((current) =>
          current?.id === id
            ? {
                ...current,
                status: previous.status,
                updatedAt: previous.updatedAt,
              }
            : current,
        );
        setTaskActionBusy(null);
        if (resolvingTicket) {
          setTicketResolutionTask(previous);
          setTicketResolutionDraft(ticketResolution);
          setTicketResolutionError(updateError);
        }
        flash(updateError);
        return;
      }
      setTasks((current) =>
        current.map((task) =>
          task.id === id ? { ...task, updatedAt: persistedUpdatedAt } : task,
        ),
      );
      setSelectedTask((current) =>
        current?.id === id
          ? { ...current, updatedAt: persistedUpdatedAt }
          : current,
      );
      await Promise.all([
        supabase.from("notifications").insert({
          user_id: session.user.id,
          actor_id: session.user.id,
          project_id: activeProjectId,
          task_id: id,
          type: "status",
          title: "Estado actualizado",
          body: `La tarea pasó a ${columns.find((c) => c.key === nextStatus)?.label}`,
        }),
        supabase.from("activity_events").insert({
          actor_id: session.user.id,
          project_id: activeProjectId,
          task_id: id,
          verb,
          detail,
        }),
      ]);
      await notifyTaskFollowers(
        previous,
        `${displayName} actualizó un to-do que sigues`,
        `${previous.title} pasó a ${columns.find((column) => column.key === nextStatus)?.label}`,
      );
      await loadNotifications(session.user.id);
    }
    if (resolvingTicket) {
      setTicketResolutionTask(null);
      setTicketResolutionDraft("");
      setTicketResolutionError("");
    }
    setActivityEvents((current) => [
      {
        id: `activity-${Date.now()}`,
        actor_id: currentAssigneeId,
        project_id: activeProjectId,
        task_id: id,
        verb,
        detail,
        created_at: new Date().toISOString(),
      },
      ...current,
    ]);
    setTaskActionBusy(null);
    flash(
      resolvingTicket
        ? "Ticket resuelto y resolución enviada por correo."
        : `Tarea movida a ${columns.find((c) => c.key === nextStatus)?.label}`,
    );
  }

  function submitTicketResolution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !ticketResolutionTask ||
      taskActionBusy === ticketResolutionTask.id ||
      ticketResolutionSubmittingRef.current
    )
      return;
    const resolution = ticketResolutionDraft.trim();
    if (resolution.length < 3) {
      setTicketResolutionError(
        "Escribe la resolución que recibirá el solicitante.",
      );
      return;
    }
    setTicketResolutionError("");
    ticketResolutionSubmittingRef.current = true;
    void moveTask(ticketResolutionTask.id, "done", {
      ticketResolution: resolution,
    }).finally(() => {
      ticketResolutionSubmittingRef.current = false;
    });
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (taskCreating) return;
    const form = new FormData(event.currentTarget);
    const requestedStatus = String(form.get("status")) as Status;
    const targetProjectId = newTaskProjectId || activeProjectId;
    const targetProject = projects.find((item) => item.id === targetProjectId);
    if (!targetProject) {
      flash("El proyecto de destino ya no está disponible");
      return;
    }
    const selectedAssigneeIds = [...newTaskAssigneeIds];
    const newTask: Task = {
      id: `local-${Date.now()}`,
      title: String(form.get("title")),
      description: String(form.get("description")),
      updatedAt: new Date().toISOString(),
      status:
        requestedStatus === "unassigned" && selectedAssigneeIds.length > 0
          ? "todo"
          : statusForProject(requestedStatus, targetProjectId),
      priority: String(form.get("priority")) as Task["priority"],
      due: String(form.get("due") || "Sin fecha"),
      assignees: selectedAssigneeIds,
      labels: [String(form.get("label") || "General")],
      comments: 0,
      steps: newTaskSteps
        .map((title) => title.trim())
        .filter(Boolean)
        .map((title) => ({ title, completed: false })),
    };
    setTaskCreating(true);
    let assignmentNotificationPending = false;
    try {
      if (session && supabase) {
        const inserted = await supabase
          .from("tasks")
          .insert({
            project_id: targetProjectId,
            title: newTask.title,
            description: newTask.description,
            status: newTask.status,
            priority: newTask.priority,
            due_date: /^\d{4}-\d{2}-\d{2}$/.test(newTask.due)
              ? newTask.due
              : null,
            created_by: session.user.id,
          })
          .select("id")
          .single();
        if (inserted.error || !inserted.data) {
          flash("No pudimos crear el to-do. Intenta de nuevo.");
          return;
        }

        newTask.id = inserted.data.id;
        if (selectedAssigneeIds.length) {
          const assignments = await supabase.from("task_assignees").insert(
            selectedAssigneeIds.map((userId) => ({
              task_id: inserted.data.id,
              user_id: userId,
            })),
          );
          if (assignments.error) {
            newTask.assignees = [];
            assignmentNotificationPending = true;
          }
        }
        if (newTask.steps.length)
          await supabase.from("task_steps").insert(
            newTask.steps.map((step, position) => ({
              task_id: inserted.data.id,
              title: step.title,
              position,
            })),
          );
        const labelName = newTask.labels[0];
        const label = await supabase
          .from("labels")
          .upsert(
            { project_id: targetProjectId, name: labelName, color: "#327B9F" },
            { onConflict: "project_id,name" },
          )
          .select("id")
          .single();
        if (label.data)
          await supabase
            .from("task_labels")
            .insert({ task_id: inserted.data.id, label_id: label.data.id });

        const notificationRecipients = newTask.assignees.filter(
          (userId) => userId !== session.user.id,
        );
        if (notificationRecipients.length) {
          const createdNotifications = await supabase
            .from("notifications")
            .insert(
              notificationRecipients.map((userId) => ({
                user_id: userId,
                actor_id: session.user.id,
                project_id: targetProjectId,
                task_id: inserted.data.id,
                type: "assignment",
                title: `${displayName} te asignó una tarea`,
                body: newTask.title,
              })),
            )
            .select("id");
          if (createdNotifications.error || !createdNotifications.data) {
            assignmentNotificationPending = true;
          } else {
            const emailSent = await sendTaskEmail(
              inserted.data.id,
              createdNotifications.data.map((item) => item.id),
              "assignment",
              plainTextFromDescription(newTask.description),
            );
            if (!emailSent) assignmentNotificationPending = true;
          }
        }
        await supabase.from("activity_events").insert({
          actor_id: session.user.id,
          project_id: targetProjectId,
          task_id: inserted.data.id,
          verb: "created",
          detail: `Creó “${newTask.title}”`,
        });
      }

      if (targetProjectId === activeProjectId)
        setTasks((current) => [newTask, ...current]);
      setActivityEvents((current) => [
        {
          id: `activity-${Date.now()}`,
          actor_id: currentAssigneeId,
          project_id: targetProjectId,
          task_id: newTask.id,
          verb: "created",
          detail: `Creó “${newTask.title}”`,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setNotifications((current) => [
        {
          id: `n-${Date.now()}`,
          type: "system",
          title: "Tarea creada",
          body: newTask.title,
          time: "Ahora",
          unread: true,
        },
        ...current,
      ]);
      setTaskModal(false);
      setNewTaskProjectId("");
      setNewTaskSteps([""]);
      setTemplateSeed(null);
      setNewTaskAssigneeIds([]);
      setNewTaskAssigneeSearch("");
      setNewTaskAssigneeOpen(false);
      flash(
        assignmentNotificationPending
          ? "To-do creado; alguna asignación o aviso quedó pendiente"
          : newTask.assignees.length
            ? `To-do creado y asignado a ${newTask.assignees.length} ${newTask.assignees.length === 1 ? "persona" : "personas"}`
            : "To-do creado sin responsable",
      );
      await openTask(newTask, { projectId: targetProjectId });
    } finally {
      setTaskCreating(false);
    }
  }

  async function duplicateTask(
    source: Task,
    status: Status = source.status,
    destinationProjectId: string = activeProjectId,
  ) {
    if (taskActionBusy === source.id) return;
    setTaskActionBusy(source.id);
    const destinationStatus = statusForProject(status, destinationProjectId);
    const copy: Task = {
      ...source,
      id: `${source.id}-copy-${tasks.length + 1}`,
      title: `${source.title} · copia`,
      status: destinationStatus,
      updatedAt: new Date().toISOString(),
      comments: 0,
      steps: source.steps.map((step) => ({
        title: step.title,
        completed: false,
      })),
    };
    const isSavedTask =
      !source.id.startsWith("t") && !source.id.startsWith("local");
    if (session && supabase && isSavedTask) {
      const copied = await supabase.rpc("copy_task_to_project", {
        p_task_id: source.id,
        p_target_project_id: destinationProjectId,
        p_status: destinationStatus,
      });
      if (copied.error || !copied.data) {
        setTaskActionBusy(null);
        flash("No pudimos copiar la tarea. Intenta de nuevo.");
        return;
      }
      copy.id = copied.data as string;
      await supabase.from("activity_events").insert({
        actor_id: session.user.id,
        project_id: destinationProjectId,
        task_id: copy.id,
        verb: "created",
        detail: `Copió “${source.title}”`,
      });
    }
    if (destinationProjectId === activeProjectId) {
      setTasks((current) => [copy, ...current]);
      setActivityEvents((current) => [
        {
          id: `activity-${Date.now()}`,
          actor_id: currentAssigneeId,
          project_id: activeProjectId,
          task_id: copy.id,
          verb: "created",
          detail: `Copió “${source.title}”`,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
    }
    setTaskActionBusy(null);
    const destination = projects.find(
      (item) => item.id === destinationProjectId,
    );
    flash(`Copia creada en ${destination?.name || "el proyecto"}`);
  }

  async function moveTaskToProject(source: Task, destinationProjectId: string) {
    if (
      destinationProjectId === activeProjectId ||
      taskActionBusy === source.id
    )
      return;
    setTaskActionBusy(source.id);
    const isSavedTask =
      !source.id.startsWith("t") && !source.id.startsWith("local");
    const destinationStatus = statusForProject(
      source.status,
      destinationProjectId,
    );
    if (session && supabase && isSavedTask) {
      const moved = await supabase.rpc("move_task_to_project", {
        p_task_id: source.id,
        p_target_project_id: destinationProjectId,
      });
      if (moved.error) {
        setTaskActionBusy(null);
        flash("No pudimos mover la tarea a ese proyecto.");
        return;
      }
      if (destinationStatus !== source.status) {
        const normalized = await supabase
          .from("tasks")
          .update({ status: destinationStatus })
          .eq("id", source.id)
          .select("id")
          .single();
        if (normalized.error) {
          setTaskActionBusy(null);
          flash("La tarea se movió, pero no pudimos ajustar su estado.");
          return;
        }
      }
      await supabase.from("activity_events").insert({
        actor_id: session.user.id,
        project_id: destinationProjectId,
        task_id: source.id,
        verb: "moved",
        detail: `Movió “${source.title}” a este proyecto`,
      });
    }
    setTasks((current) => current.filter((task) => task.id !== source.id));
    setSelectedTask((current) => (current?.id === source.id ? null : current));
    setTaskActionBusy(null);
    const destination = projects.find(
      (item) => item.id === destinationProjectId,
    );
    flash(`Tarea movida a ${destination?.name || "otro proyecto"}`);
  }

  async function deleteTask(task: Task) {
    if (taskActionBusy === task.id) return;
    setTaskActionBusy(task.id);
    const isSavedTask =
      !task.id.startsWith("t") && !task.id.startsWith("local");
    if (session && supabase && isSavedTask) {
      const removed = await supabase
        .from("tasks")
        .delete()
        .eq("id", task.id)
        .select("id")
        .single();
      if (removed.error) {
        setTaskActionBusy(null);
        flash("No pudimos eliminar la tarea.");
        return;
      }
      await supabase.from("activity_events").insert({
        actor_id: session.user.id,
        project_id: activeProjectId,
        verb: "moved",
        detail: `Eliminó “${task.title}”`,
      });
    }
    setTasks((current) => current.filter((item) => item.id !== task.id));
    if (selectedTaskIdRef.current === task.id) selectedTaskIdRef.current = null;
    setSelectedTask((current) => (current?.id === task.id ? null : current));
    setTaskToDelete(null);
    setTaskActionBusy(null);
    flash("Tarea eliminada");
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name"));
    const description = String(form.get("description"));
    const stepTitles = String(form.get("steps") || "")
      .split("\n")
      .map((step) => step.trim())
      .filter(Boolean);
    const next = {
      name,
      description,
      steps: stepTitles.length,
      stepTitles,
      icon: "✦",
      color: "orange",
    };
    if (session && supabase) {
      const created = await supabase
        .from("templates")
        .insert({ name, description, creator_id: session.user.id })
        .select("id")
        .single();
      if (created.data && stepTitles.length)
        await supabase.from("template_steps").insert(
          stepTitles.map((title, position) => ({
            template_id: created.data.id,
            title,
            position,
          })),
        );
    }
    setWorkspaceTemplates((current) => [...current, next]);
    setTemplateModal(false);
    flash("Plantilla guardada");
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (projectBusy) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    if (!session || !supabase) {
      const next = {
        id: `demo-${Date.now()}`,
        name,
        color: "#327B9F",
        description,
        archived: false,
      };
      setProjects((all) => [...all, next]);
      setProject(name);
      setActiveProjectId(next.id);
      setTasks([]);
      setProjectMemberIds(people.map((person) => person.id));
      rememberWorkspaceProjectMembers(
        next.id,
        people.map((person) => person.id),
      );
      setProjectModal(false);
      flash("Proyecto creado");
      return;
    }
    setProjectBusy(true);
    const created = await supabase
      .from("projects")
      .insert({
        name,
        description,
        color: "#327B9F",
        owner_id: session.user.id,
      })
      .select("id,name,color,description,image_url,owner_id,archived")
      .single();
    setProjectBusy(false);
    if (created.error || !created.data) {
      flash("No pudimos crear el proyecto. Intenta de nuevo.");
      return;
    }
    setProjects((all) => [...all, created.data as WorkspaceProject]);
    setProject(name);
    setActiveProjectId(created.data.id);
    setTasks([]);
    setProjectMemberIds([session.user.id]);
    rememberWorkspaceProjectMembers(created.data.id, [session.user.id]);
    setProjectModal(false);
    flash("Proyecto creado");
  }

  async function switchProject(
    next: WorkspaceProject,
    options: { syncHistory?: boolean } = {},
  ) {
    if (options.syncHistory !== false) {
      window.history.pushState(
        { workspaceRoute: "project" },
        "",
        projectHref(next.id),
      );
    }
    setProject(next.name);
    setActiveProjectId(next.id);
    setView("board");
    setProjectView("board");
    setStatusFilter("all");
    setMobileNav(false);
    setProjectMemberModal(false);
    setProjectMemberSearch("");
    let loadedTasks: Task[] = [];
    if (session) {
      const [loaded] = await Promise.all([
        loadProjectTasks(next.id),
        loadProjectMembers(next.id, next.owner_id),
      ]);
      loadedTasks = loaded;
    } else {
      setProjectMemberIds(people.map((person) => person.id));
      if (isTicketProject(next)) {
        setTasks(initialTasks.filter((task) => task.externalSource));
      } else if (next.id === "demo-1") {
        setTasks(initialTasks.filter((task) => !task.externalSource));
      } else {
        setTasks([]);
      }
    }
    return loadedTasks;
  }

  async function openWorkspaceTask(task: WorkspaceTask) {
    const targetProject = projects.find((item) => item.id === task.projectId);
    if (!targetProject) {
      flash("El proyecto de esta tarea ya no está disponible");
      return;
    }
    const loadedTasks = await switchProject(targetProject, {
      syncHistory: false,
    });
    const fullTask = loadedTasks.find((item) => item.id === task.id) || task;
    await openTask(fullTask, { projectId: targetProject.id });
  }

  function openProjectEditor() {
    if (!activeProject) return;
    setProjectDraftColor(activeProject.color || "#327B9F");
    setProjectImageFile(null);
    setRemoveProjectImage(false);
    setProjectEditModal(true);
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProject || projectBusy) return;
    const form = new FormData(event.currentTarget);
    const name = isTicketProject(activeProject)
      ? TICKET_PROJECT_NAME
      : String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    if (!name) return;
    if (
      projectImageFile &&
      (!projectImageFile.type.match(/^image\/(jpeg|png|webp)$/) ||
        projectImageFile.size > MAX_PHOTO_BYTES)
    ) {
      flash("La foto debe ser JPG, PNG o WebP y pesar máximo 50 MB.");
      return;
    }

    setProjectBusy(true);
    let imagePath = removeProjectImage
      ? null
      : activeProject.image_path ||
        projectImageStoragePath(activeProject.image_url);
    let imageUrl = removeProjectImage ? null : activeProject.image_url || null;
    let uploadedPath: string | null = null;

    if (projectImageFile && session && supabase) {
      try {
        const uploaded = await uploadDrivePhoto(
          projectImageFile,
          "project-image",
          activeProject.id,
        );
        uploadedPath = uploaded.reference;
        imagePath = uploaded.reference;
        imageUrl = uploaded.url;
      } catch (error) {
        setProjectBusy(false);
        flash(
          error instanceof Error
            ? error.message
            : "No pudimos subir la foto del proyecto.",
        );
        return;
      }
    } else if (projectImageFile) {
      imageUrl = URL.createObjectURL(projectImageFile);
    }

    const updatedProject: WorkspaceProject = {
      ...activeProject,
      name,
      description,
      color: projectDraftColor,
      image_url: imageUrl,
      image_path: imagePath,
    };

    if (session && supabase) {
      const updated = await supabase
        .from("projects")
        .update({
          name,
          description,
          color: projectDraftColor,
          image_url: imagePath,
        })
        .eq("id", activeProject.id)
        .select("id,name,color,description,image_url,owner_id,archived")
        .single();
      if (updated.error || !updated.data) {
        if (uploadedPath) {
          await deleteStoredImage("project-images", uploadedPath);
        }
        setProjectBusy(false);
        flash("No pudimos guardar los cambios del proyecto.");
        return;
      }
      const updatedRow = updated.data as WorkspaceProject;
      Object.assign(updatedProject, {
        ...updatedRow,
        image_path: updatedRow.image_url || null,
        image_url:
          uploadedPath && updatedRow.image_url === uploadedPath
            ? imageUrl
            : await signedStorageUrl("project-images", updatedRow.image_url),
      });
      const previousPath =
        activeProject.image_path ||
        projectImageStoragePath(activeProject.image_url);
      if (
        previousPath &&
        previousPath !== uploadedPath &&
        (uploadedPath || removeProjectImage)
      ) {
        await deleteStoredImage("project-images", previousPath);
      }
    }

    setProjects((current) =>
      current.map((item) =>
        item.id === activeProject.id ? updatedProject : item,
      ),
    );
    setProject(name);
    setProjectBusy(false);
    setProjectEditModal(false);
    setProjectImageFile(null);
    setRemoveProjectImage(false);
    flash("Proyecto actualizado");
  }

  async function archiveProject(target: WorkspaceProject) {
    if (projectBusy) return;
    if (isTicketProject(target)) {
      flash("Mesa de Tickets está protegida y no se puede archivar");
      return;
    }
    setProjectBusy(true);
    if (session && supabase) {
      const archived = await supabase
        .from("projects")
        .update({ archived: true })
        .eq("id", target.id)
        .select("id")
        .single();
      if (archived.error) {
        setProjectBusy(false);
        flash("No pudimos archivar el proyecto.");
        return;
      }
    }
    const archivedTarget = { ...target, archived: true };
    const remaining = projects.filter((item) => item.id !== target.id);
    setProjects(remaining);
    setArchivedProjects((current) => [archivedTarget, ...current]);
    if (target.id === activeProjectId) {
      if (remaining[0]) await switchProject(remaining[0]);
      else {
        setActiveProjectId("");
        setProject("");
        setTasks([]);
        setView("archive");
      }
    }
    setProjectBusy(false);
    flash("Proyecto archivado");
  }

  async function restoreProject(target: WorkspaceProject) {
    if (projectBusy) return;
    setProjectBusy(true);
    if (session && supabase) {
      const restored = await supabase
        .from("projects")
        .update({ archived: false })
        .eq("id", target.id)
        .select("id,name,color,description,image_url,owner_id,archived")
        .single();
      if (restored.error || !restored.data) {
        setProjectBusy(false);
        flash("No pudimos restaurar el proyecto.");
        return;
      }
      const restoredRow = restored.data as WorkspaceProject;
      target = {
        ...restoredRow,
        image_path: restoredRow.image_url || null,
        image_url: await signedStorageUrl(
          "project-images",
          restoredRow.image_url,
        ),
      };
    } else {
      target = { ...target, archived: false };
    }
    setArchivedProjects((current) =>
      current.filter((item) => item.id !== target.id),
    );
    setProjects((current) => [...current, target]);
    setProjectBusy(false);
    await switchProject(target);
    flash("Proyecto restaurado");
  }

  async function deleteProject(target: WorkspaceProject) {
    if (projectBusy || projectDeleteConfirmation !== target.name) return;
    if (isTicketProject(target)) {
      setProjectToDelete(null);
      setProjectDeleteConfirmation("");
      flash("Mesa de Tickets está protegida y no se puede eliminar");
      return;
    }
    setProjectBusy(true);
    if (session && supabase) {
      const imagePath =
        target.image_path || projectImageStoragePath(target.image_url);
      if (imagePath) {
        const removedImage = await deleteStoredImage(
          "project-images",
          imagePath,
        );
        if (!removedImage) {
          setProjectBusy(false);
          flash("No pudimos retirar la foto del proyecto.");
          return;
        }
      }
      const removed = await supabase
        .from("projects")
        .delete()
        .eq("id", target.id)
        .select("id")
        .single();
      if (removed.error) {
        setProjectBusy(false);
        flash("No pudimos eliminar el proyecto.");
        return;
      }
    }
    const remaining = projects.filter((item) => item.id !== target.id);
    setProjects(remaining);
    setArchivedProjects((current) =>
      current.filter((item) => item.id !== target.id),
    );
    setProjectToDelete(null);
    setProjectDeleteConfirmation("");
    if (target.id === activeProjectId) {
      if (remaining[0]) await switchProject(remaining[0]);
      else {
        setActiveProjectId("");
        setProject("");
        setTasks([]);
        setView("board");
      }
    }
    setProjectBusy(false);
    flash("Proyecto eliminado");
  }

  function updateCommentDraft(value: string) {
    setCommentDraft(value);
    if (selectedTaskIdRef.current)
      saveCommentDraft(sessionUserId, selectedTaskIdRef.current, value);
    const activeMention = value.match(/(^|[\s(])@([^@\n]*)$/);
    setMentionQuery(activeMention ? activeMention[2].trimStart() : null);
  }

  function selectMention(person: WorkspacePerson) {
    setCommentDraft((current) => {
      const atIndex = current.lastIndexOf("@");
      const next = `${current.slice(0, atIndex)}@${person.full_name} `;
      if (selectedTaskIdRef.current)
        saveCommentDraft(sessionUserId, selectedTaskIdRef.current, next);
      return next;
    });
    setMentionedPeople((current) =>
      current.some((item) => item.id === person.id)
        ? current
        : [...current, person],
    );
    setMentionQuery(null);
  }

  function discardPendingCommentImages() {
    setPendingCommentImages((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setCommentAttachmentTargetId(null);
    setCommentImageError("");
    if (commentImageInputRef.current) commentImageInputRef.current.value = "";
  }

  function addPendingCommentImages(candidates: File[]) {
    if (!candidates.length) return;
    const available = Math.max(
      0,
      MAX_COMMENT_IMAGES - pendingCommentImages.length,
    );
    const accepted = candidates
      .flatMap((file) => {
        const mimeType = normalizedCommentImageType(file);
        return mimeType && file.size > 0 && file.size <= MAX_PHOTO_BYTES
          ? [{ file, mimeType }]
          : [];
      })
      .slice(0, available);
    if (accepted.length !== candidates.length) {
      const message = `Puedes adjuntar hasta ${MAX_COMMENT_IMAGES} imágenes JPG, PNG o WebP de máximo 50 MB`;
      setCommentImageError(message);
      flash(message);
    } else {
      setCommentImageError("");
    }
    setPendingCommentImages((current) => [
      ...current,
      ...accepted.map(({ file, mimeType }) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        mimeType,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function selectCommentImages(event: ChangeEvent<HTMLInputElement>) {
    const candidates = Array.from(event.target.files || []);
    event.target.value = "";
    addPendingCommentImages(candidates);
  }

  function removePendingCommentImage(id: string) {
    const removed = pendingCommentImages.find((item) => item.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    const remaining = pendingCommentImages.filter((item) => item.id !== id);
    setPendingCommentImages(remaining);
    if (!remaining.length) {
      setCommentAttachmentTargetId(null);
      setCommentImageError("");
    }
  }

  async function deleteDriveCommentImage(fileId: string) {
    const token = await currentAccessToken();
    if (!token) throw new Error("Tu sesión terminó. Vuelve a iniciar sesión.");
    const response = await fetch(
      `/api/drive/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(body.error || "No pudimos eliminar la imagen");
    }
  }

  async function uploadCommentImage(
    item: PendingCommentImage,
    commentId: string,
  ): Promise<CommentAttachment> {
    if (demo || !session || !supabase) {
      return {
        id: `attachment-local-${crypto.randomUUID()}`,
        comment_id: commentId,
        uploaded_by: currentAssigneeId,
        drive_file_id: `demo_${Date.now()}`,
        file_name: item.file.name,
        mime_type: item.mimeType,
        size_bytes: item.file.size,
        created_at: new Date().toISOString(),
        local_url: item.previewUrl,
      };
    }
    const token = await currentAccessToken();
    if (!token) throw new Error("Tu sesión terminó. Vuelve a iniciar sesión.");
    const initiated = await fetch("/api/drive/uploads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: "comment-image",
        subjectId: commentId,
        name: item.file.name,
        mimeType: item.mimeType,
        size: item.file.size,
      }),
    });
    const initiation = (await initiated.json().catch(() => ({}))) as {
      uploadUrl?: string;
      error?: string;
    };
    if (!initiated.ok || !initiation.uploadUrl)
      throw new Error(
        initiation.error || "No pudimos conectar con Google Drive",
      );
    const uploaded = await fetch(initiation.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": item.mimeType,
        "Content-Range": `bytes 0-${item.file.size - 1}/${item.file.size}`,
      },
      body: item.file,
    });
    const metadata = (await uploaded.json().catch(() => ({}))) as {
      id?: string;
    };
    if (
      !uploaded.ok ||
      !metadata.id ||
      !/^[A-Za-z0-9_-]{10,200}$/.test(metadata.id)
    )
      throw new Error("La carga de la imagen no pudo completarse");
    const inserted = await supabase
      .from("comment_attachments")
      .insert({
        comment_id: commentId,
        uploaded_by: session.user.id,
        drive_file_id: metadata.id,
        file_name: item.file.name.slice(0, 180),
        mime_type: item.mimeType,
        size_bytes: item.file.size,
      })
      .select("*")
      .single();
    if (inserted.error || !inserted.data) {
      await deleteDriveCommentImage(metadata.id).catch(() => undefined);
      throw new Error("No pudimos vincular la imagen con el comentario");
    }
    return {
      ...(inserted.data as CommentAttachment),
      local_url: item.previewUrl,
    };
  }

  async function uploadCommentImageBatch(
    items: PendingCommentImage[],
    commentId: string,
  ) {
    const results = await Promise.allSettled(
      items.map((item) => uploadCommentImage(item, commentId)),
    );
    const attachments: CommentAttachment[] = [];
    const failedImages: PendingCommentImage[] = [];
    const errors: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") attachments.push(result.value);
      else {
        failedImages.push(items[index]);
        errors.push(
          result.reason instanceof Error
            ? result.reason.message
            : "No pudimos subir la imagen",
        );
      }
    });
    return {
      attachments,
      failedImages,
      error: Array.from(new Set(errors)).join(" · "),
    };
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!session || !supabase) {
      flash("Inicia sesión para guardar tu foto de perfil");
      return;
    }
    if (!PHOTO_MIME_TYPES.includes(file.type)) {
      flash("Usa una imagen JPG, PNG o WebP");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      flash("La foto debe pesar máximo 50 MB");
      return;
    }

    setAvatarBusy(true);
    let uploaded: { reference: string; url: string };
    try {
      uploaded = await uploadDrivePhoto(file, "avatar", session.user.id);
    } catch (error) {
      setAvatarBusy(false);
      flash(
        error instanceof Error
          ? error.message
          : "No pudimos subir la foto. Intenta otra vez",
      );
      return;
    }
    const path = uploaded.reference;
    const updated = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", session.user.id);
    if (updated.error) {
      await deleteStoredImage("avatars", path);
      setAvatarBusy(false);
      flash("La foto subió, pero no pudimos guardarla en tu perfil");
      return;
    }
    const previousAvatarPath = workspacePeople.find(
      (person) => person.id === session.user.id,
    )?.avatar_path;
    setWorkspacePeople((current) =>
      current.map((person) =>
        person.id === session.user.id
          ? { ...person, avatar_url: uploaded.url, avatar_path: path }
          : person,
      ),
    );
    if (previousAvatarPath && previousAvatarPath !== path)
      await deleteStoredImage("avatars", previousAvatarPath);
    setAvatarBusy(false);
    flash("Foto de perfil actualizada");
  }

  async function loadTaskComments(taskId: string) {
    if (!supabase) return;
    setCommentsLoading(true);
    setCommentsLoadError("");
    try {
      const commentsResult = await supabase
        .from("comments")
        .select("id,body,author_id,created_at,comment_attachments(*)")
        .eq("task_id", taskId)
        .order("created_at");

      if (commentsResult.error) {
        setCommentsLoadError(
          "No pudimos recuperar la conversación. Intenta cargarla de nuevo.",
        );
        return;
      }

      const rows = (commentsResult.data || []) as unknown as CommentRow[];
      const reactionsByComment = new Map<
        string,
        { user_id: string; emoji: string }[]
      >();

      if (rows.length) {
        const reactionResult = await supabase
          .from("comment_reactions")
          .select("comment_id,user_id,emoji")
          .in(
            "comment_id",
            rows.map((comment) => comment.id),
          );
        if (!reactionResult.error) {
          for (const reaction of (reactionResult.data ||
            []) as CommentReactionRow[]) {
            const current = reactionsByComment.get(reaction.comment_id) || [];
            current.push({ user_id: reaction.user_id, emoji: reaction.emoji });
            reactionsByComment.set(reaction.comment_id, current);
          }
        }
      }

      const loadedComments = await Promise.all(
        rows.map(async (item) => ({
          id: item.id,
          body: item.body,
          author_id: item.author_id,
          author:
            directory.find((person) => person.id === item.author_id)
              ?.full_name ||
            (item.author_id === session?.user.id
              ? displayName
              : "Equipo Spartanblue"),
          time: new Date(item.created_at).toLocaleString("es-MX", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }),
          reactions: reactionsByComment.get(item.id) || [],
          // Las vistas previas cargan de forma independiente para que una foto
          // pesada no bloquee toda la conversación.
          attachments: item.comment_attachments || [],
        })),
      );

      setCommentsByTask((current) => ({
        ...current,
        [taskId]: loadedComments,
      }));
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, comments: rows.length } : task,
        ),
      );
      setSelectedTask((current) =>
        current?.id === taskId
          ? { ...current, comments: rows.length }
          : current,
      );
    } catch {
      setCommentsLoadError(
        "No pudimos recuperar la conversación. Intenta cargarla de nuevo.",
      );
    } finally {
      setCommentsLoading(false);
    }
  }

  async function openTask(
    task: Task,
    options: {
      syncHistory?: boolean;
      projectId?: string;
      loadRelated?: boolean;
    } = {},
  ) {
    if (options.syncHistory !== false) {
      const targetUrl = taskHref(options.projectId || activeProjectId, task.id);
      if (
        `${window.location.pathname}${window.location.search}` !== targetUrl
      ) {
        window.history.replaceState({ workspaceRoute: "home" }, "", "/");
        window.history.pushState({ workspaceRoute: "task" }, "", targetUrl);
      }
    }
    const reopeningSameTask = selectedTaskIdRef.current === task.id;
    selectedTaskIdRef.current = task.id;
    setSelectedTask(task);
    if (!reopeningSameTask) {
      setTaskDetailFullscreen(false);
      setTaskEditing(false);
      setTaskEditBusy(false);
      setTaskEditSteps(task.steps.map((step) => ({ ...step })));
      setCommentDraft(readSavedCommentDraft(sessionUserId, task.id));
      discardPendingCommentImages();
      setCommentsLoadError("");
      setMentionQuery(null);
      setMentionedPeople([]);
      setAssigneeSearch("");
      setAssigneePickerOpen(false);
      setTaskReactionPickerOpen(false);
      setCommentReactionPickerId(null);
      setCommentReactionBusyId(null);
    }
    if (options.loadRelated === false) {
      setCommentsLoading(true);
      return;
    }
    setTaskReactions(
      demo
        ? [
            { user_id: "am", emoji: "👍" },
            { user_id: "lc", emoji: "🎉" },
          ]
        : [],
    );
    setTaskFollowing(demo);
    if (
      session &&
      supabase &&
      !task.id.startsWith("t") &&
      !task.id.startsWith("local")
    ) {
      const [, reactionsResult, subscriptionResult] = await Promise.all([
        loadTaskComments(task.id),
        supabase
          .from("task_reactions")
          .select("user_id,emoji")
          .eq("task_id", task.id),
        supabase
          .from("task_subscriptions")
          .select("user_id")
          .eq("task_id", task.id)
          .eq("user_id", session.user.id)
          .maybeSingle(),
      ]);
      setTaskReactions(
        (reactionsResult.data || []) as { user_id: string; emoji: string }[],
      );
      setTaskFollowing(Boolean(subscriptionResult.data));
    } else {
      setCommentsLoading(false);
    }
  }

  function closeTaskDetail(syncHistory = true) {
    if (syncHistory && activeProjectId) {
      window.history.replaceState(
        { workspaceRoute: "project" },
        "",
        projectHref(activeProjectId),
      );
    }
    selectedTaskIdRef.current = null;
    setSelectedTask(null);
    setTaskDetailFullscreen(false);
    setTaskEditing(false);
    setTaskEditBusy(false);
    setTaskEditSteps([]);
    setTaskReactionPickerOpen(false);
    setCommentReactionPickerId(null);
    setCommentToDelete(null);
    discardPendingCommentImages();
  }

  async function toggleTaskReaction(emoji: string) {
    if (!selectedTask || taskSocialBusy) return;
    setTaskReactionPickerOpen(false);
    const currentReaction = taskReactions.find(
      (reaction) => reaction.user_id === currentAssigneeId,
    );
    const remove = currentReaction?.emoji === emoji;
    setTaskSocialBusy(true);
    if (
      session &&
      supabase &&
      !selectedTask.id.startsWith("t") &&
      !selectedTask.id.startsWith("local")
    ) {
      const result = remove
        ? await supabase
            .from("task_reactions")
            .delete()
            .eq("task_id", selectedTask.id)
            .eq("user_id", session.user.id)
        : await supabase.from("task_reactions").upsert(
            {
              task_id: selectedTask.id,
              user_id: session.user.id,
              emoji,
            },
            { onConflict: "task_id,user_id" },
          );
      if (result.error) {
        setTaskSocialBusy(false);
        flash("No pudimos guardar la reacción");
        return;
      }
    }
    setTaskReactions((current) =>
      remove
        ? current.filter((reaction) => reaction.user_id !== currentAssigneeId)
        : [
            ...current.filter(
              (reaction) => reaction.user_id !== currentAssigneeId,
            ),
            { user_id: currentAssigneeId, emoji },
          ],
    );
    setTaskSocialBusy(false);
  }

  async function toggleTaskFollowing() {
    if (!selectedTask || taskSocialBusy) return;
    setTaskSocialBusy(true);
    if (
      session &&
      supabase &&
      !selectedTask.id.startsWith("t") &&
      !selectedTask.id.startsWith("local")
    ) {
      const result = taskFollowing
        ? await supabase
            .from("task_subscriptions")
            .delete()
            .eq("task_id", selectedTask.id)
            .eq("user_id", session.user.id)
        : await supabase.from("task_subscriptions").insert({
            task_id: selectedTask.id,
            user_id: session.user.id,
          });
      if (result.error) {
        setTaskSocialBusy(false);
        flash("No pudimos actualizar el seguimiento");
        return;
      }
    }
    setTaskFollowing((current) => !current);
    setTaskSocialBusy(false);
    flash(
      taskFollowing
        ? "Dejaste de seguir este to-do"
        : "Ahora recibirás sus actualizaciones",
    );
  }

  async function toggleCommentReaction(comment: TaskComment, emoji: string) {
    if (!selectedTask || commentReactionBusyId) return;
    const ownReaction = comment.reactions.find(
      (reaction) => reaction.user_id === currentAssigneeId,
    );
    const remove = ownReaction?.emoji === emoji;
    const nextReactions = remove
      ? comment.reactions.filter(
          (reaction) => reaction.user_id !== currentAssigneeId,
        )
      : [
          ...comment.reactions.filter(
            (reaction) => reaction.user_id !== currentAssigneeId,
          ),
          { user_id: currentAssigneeId, emoji },
        ];

    setCommentReactionPickerId(null);
    setCommentReactionBusyId(comment.id);
    if (
      session &&
      supabase &&
      !selectedTask.id.startsWith("t") &&
      !selectedTask.id.startsWith("local")
    ) {
      const result = remove
        ? await supabase
            .from("comment_reactions")
            .delete()
            .eq("comment_id", comment.id)
            .eq("user_id", session.user.id)
        : await supabase.from("comment_reactions").upsert(
            {
              comment_id: comment.id,
              user_id: session.user.id,
              emoji,
            },
            { onConflict: "comment_id,user_id" },
          );
      if (result.error) {
        setCommentReactionBusyId(null);
        flash("No pudimos guardar la reacción al comentario");
        return;
      }
      if (
        !remove &&
        comment.author_id &&
        comment.author_id !== session.user.id
      ) {
        await supabase.from("notifications").insert({
          user_id: comment.author_id,
          actor_id: session.user.id,
          project_id: activeProjectId,
          task_id: selectedTask.id,
          type: "reaction",
          title: `${displayName} reaccionó ${emoji} a tu comentario`,
          body: `${selectedTask.title}: ${comment.body.slice(0, 120)}`,
        });
      }
    }

    setCommentsByTask((current) => ({
      ...current,
      [selectedTask.id]: (current[selectedTask.id] || []).map((item) =>
        item.id === comment.id ? { ...item, reactions: nextReactions } : item,
      ),
    }));
    setCommentReactionBusyId(null);
  }

  async function deleteComment(comment: TaskComment) {
    if (!selectedTask || commentDeleteBusyId) return;
    const canDelete =
      demo ||
      comment.author_id === currentAssigneeId ||
      activeProject?.owner_id === session?.user.id;
    if (!canDelete) {
      flash(
        "Solo el autor o la persona propietaria puede borrar el comentario",
      );
      return;
    }

    const taskId = selectedTask.id;
    setCommentDeleteBusyId(comment.id);
    if (
      session &&
      supabase &&
      !taskId.startsWith("t") &&
      !taskId.startsWith("local")
    ) {
      try {
        await Promise.all(
          comment.attachments.map((attachment) =>
            deleteDriveCommentImage(attachment.drive_file_id),
          ),
        );
      } catch {
        setCommentDeleteBusyId(null);
        flash("No pudimos borrar las imágenes del comentario");
        return;
      }
      const removed = await supabase
        .from("comments")
        .delete()
        .eq("id", comment.id)
        .eq("task_id", taskId)
        .select("id")
        .single();
      if (removed.error || !removed.data) {
        setCommentDeleteBusyId(null);
        flash("No pudimos borrar el comentario");
        return;
      }
    } else {
      comment.attachments.forEach((attachment) => {
        if (attachment.local_url) URL.revokeObjectURL(attachment.local_url);
      });
    }

    const remainingComments = (commentsByTask[taskId] || []).filter(
      (item) => item.id !== comment.id,
    );
    setCommentsByTask((current) => ({
      ...current,
      [taskId]: (current[taskId] || []).filter(
        (item) => item.id !== comment.id,
      ),
    }));
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? { ...task, comments: remainingComments.length }
          : task,
      ),
    );
    setSelectedTask((current) =>
      current?.id === taskId
        ? { ...current, comments: remainingComments.length }
        : current,
    );
    setCommentReactionPickerId(null);
    if (commentAttachmentTargetId === comment.id) discardPendingCommentImages();
    setCommentToDelete(null);
    setCommentDeleteBusyId(null);
    flash("Comentario borrado");
  }

  async function notifyTaskFollowers(task: Task, title: string, body: string) {
    if (
      !session ||
      !supabase ||
      task.id.startsWith("t") ||
      task.id.startsWith("local")
    )
      return;
    const { data } = await supabase
      .from("task_subscriptions")
      .select("user_id")
      .eq("task_id", task.id);
    const recipients = (data || []).filter(
      (subscription) => subscription.user_id !== session.user.id,
    );
    if (!recipients.length) return;
    await supabase.from("notifications").insert(
      recipients.map((subscription) => ({
        user_id: subscription.user_id,
        actor_id: session.user.id,
        project_id: activeProjectId,
        task_id: task.id,
        type: "subscription",
        title,
        body,
      })),
    );
  }

  async function toggleTaskDone(task: Task) {
    await moveTask(task.id, task.status === "done" ? "todo" : "done");
  }

  async function sendTaskEmail(
    taskId: string,
    notificationIds: string[],
    kind: "mention" | "assignment",
    detail?: string,
  ) {
    if (!session || notificationIds.length === 0) return true;
    try {
      const response = await fetch("/api/notifications/email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId,
          notificationIds,
          kind,
          detail,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function generateWeeklyReport(person: WorkspacePerson) {
    if (!session || weeklyReportBusy) return;
    setWeeklyReportBusy(person.id);
    setWeeklyReportMessage("");
    try {
      const suggestedFilename = `Reporte semanal - ${person.full_name}.pdf`.replace(
        /[<>:"/\\|?*\u0000-\u001F]/g,
        "_",
      );
      const savePicker = (window as ReportSavePickerWindow)
        .showSaveFilePicker;
      let saveHandle: ReportSaveHandle | null = null;
      if (savePicker) {
        try {
          saveHandle = await savePicker.call(window, {
            suggestedName: suggestedFilename,
            types: [
              {
                description: "Documento PDF",
                accept: { "application/pdf": [".pdf"] },
              },
            ],
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            setWeeklyReportMessage("Descarga cancelada.");
            return;
          }
          // Algunos navegadores exponen la API pero la restringen por política.
          // En ese caso continuamos con la descarga compatible tradicional.
        }
      }
      const response = await fetch("/api/reports/weekly", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ personId: person.id }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || "No pudimos generar el reporte.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const filename =
        filenameMatch?.[1] || `Reporte semanal - ${person.full_name}.pdf`;
      if (saveHandle) {
        const writable = await saveHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else if (
        (navigator as LegacyDownloadNavigator).msSaveOrOpenBlob?.(
          blob,
          filename,
        ) !== true
      ) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Windows puede tardar en tomar el Blob después del clic. Revocarlo al
        // segundo interrumpía la descarga en algunos equipos.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setWeeklyReportMessage(
        saveHandle
          ? "Reporte generado y guardado correctamente."
          : "Reporte generado con todas sus tareas pendientes asignadas.",
      );
    } catch (error) {
      setWeeklyReportMessage(
        error instanceof Error
          ? error.message
          : "No pudimos generar el reporte.",
      );
    } finally {
      setWeeklyReportBusy(null);
    }
  }

  async function saveReportProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !supabase || reportProfileBusy) return;
    const phone = reportPhoneDraft.trim();
    if (phone.length > 50) {
      flash("El teléfono no puede tener más de 50 caracteres");
      return;
    }
    setReportProfileBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("id", session.user.id);
    if (error) {
      flash("No pudimos guardar los datos del reporte");
      setReportProfileBusy(false);
      return;
    }
    setWorkspacePeople((current) =>
      current.map((person) =>
        person.id === session.user.id ? { ...person, phone } : person,
      ),
    );
    setReportProfileBusy(false);
    flash("Datos para reportes guardados");
  }

  async function addPersonToProject(person: WorkspacePerson) {
    if (!activeProject || projectMemberBusy) return;
    if (projectMemberIds.includes(person.id)) {
      flash("Esta persona ya pertenece al proyecto");
      return;
    }
    setProjectMemberBusy(person.id);
    if (!session || !supabase) {
      setProjectMemberIds((current) => [...current, person.id]);
      rememberWorkspaceProjectMembers(activeProject.id, [person.id]);
      setProjectMemberSearch("");
      setProjectMemberBusy(null);
      flash(`${person.full_name} se agregó al proyecto`);
      return;
    }

    const membership = await supabase.from("project_members").upsert(
      {
        project_id: activeProject.id,
        user_id: person.id,
        role: "member",
      },
      { onConflict: "project_id,user_id", ignoreDuplicates: true },
    );
    if (membership.error) {
      setProjectMemberBusy(null);
      flash("No pudimos agregar a esta persona al proyecto");
      return;
    }

    setProjectMemberIds((current) =>
      current.includes(person.id) ? current : [...current, person.id],
    );
    rememberWorkspaceProjectMembers(activeProject.id, [person.id]);
    setProjectMemberSearch("");

    let notificationSaved = true;
    if (person.id !== session.user.id) {
      const notification = await supabase.from("notifications").insert({
        user_id: person.id,
        actor_id: session.user.id,
        project_id: activeProject.id,
        task_id: null,
        type: "system",
        title: `${displayName} te agregó a un proyecto`,
        body: activeProject.name,
      });
      notificationSaved = !notification.error;
    }

    setProjectMemberBusy(null);
    flash(
      notificationSaved
        ? `${person.full_name} ya pertenece al proyecto`
        : `${person.full_name} fue agregado; la notificación quedó pendiente`,
    );
  }

  async function assignPerson(person: WorkspacePerson) {
    if (!selectedTask || assigneeBusy) return;
    const wasUnassigned = selectedTask.status === "unassigned";
    if (selectedTask.assignees.includes(person.id)) {
      flash("Esta persona ya está asignada");
      return;
    }
    setAssigneeBusy(true);
    const isSavedTask =
      !selectedTask.id.startsWith("t") && !selectedTask.id.startsWith("local");
    let emailSent = true;
    if (isSavedTask && session && supabase) {
      const membership = await supabase.from("project_members").upsert(
        {
          project_id: activeProjectId,
          user_id: person.id,
          role: "member",
        },
        { onConflict: "project_id,user_id", ignoreDuplicates: true },
      );
      const assignment = membership.error
        ? membership
        : await supabase
            .from("task_assignees")
            .upsert(
              { task_id: selectedTask.id, user_id: person.id },
              { onConflict: "task_id,user_id" },
            );
      if (assignment.error) {
        setAssigneeBusy(false);
        flash("No pudimos asignar a esta persona");
        return;
      }
      setProjectMemberIds((current) =>
        current.includes(person.id) ? current : [...current, person.id],
      );
      await supabase
        .from("task_subscriptions")
        .upsert(
          { task_id: selectedTask.id, user_id: session.user.id },
          { onConflict: "task_id,user_id" },
        );
      const notification = await supabase
        .from("notifications")
        .insert({
          user_id: person.id,
          actor_id: session.user.id,
          project_id: activeProjectId,
          task_id: selectedTask.id,
          type: "assignment",
          title: `${displayName} te asignó una tarea`,
          body: selectedTask.title,
        })
        .select("id")
        .single();
      if (notification.error || !notification.data) {
        setAssigneeBusy(false);
        flash("La asignación se guardó, pero falló la notificación");
        return;
      }
      emailSent = await sendTaskEmail(
        selectedTask.id,
        [notification.data.id],
        "assignment",
      );
    }
    const updated = {
      ...selectedTask,
      assignees: [...selectedTask.assignees, person.id],
    };
    rememberWorkspaceProjectMembers(activeProjectId, [person.id]);
    setSelectedTask(updated);
    setTasks((current) =>
      current.map((task) => (task.id === updated.id ? updated : task)),
    );
    setAssigneeSearch("");
    setAssigneePickerOpen(false);
    setAssigneeBusy(false);
    if (wasUnassigned) {
      await moveTask(selectedTask.id, "todo");
      return;
    }
    flash(
      emailSent
        ? `${person.full_name} recibió la asignación`
        : `${person.full_name} fue asignado; el correo quedó pendiente`,
    );
  }

  async function unassignPerson(personId: string) {
    if (!selectedTask || assigneeBusy) return;
    const task = selectedTask;
    if (!task.assignees.includes(personId)) return;
    const personName =
      directory.find((person) => person.id === personId)?.full_name ||
      "La persona";
    const isSavedTask =
      !task.id.startsWith("t") && !task.id.startsWith("local");

    setAssigneeBusy(true);
    setAssigneePickerOpen(false);
    if (isSavedTask && session && supabase) {
      const removed = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", task.id)
        .eq("user_id", personId)
        .select("task_id");
      if (removed.error) {
        setAssigneeBusy(false);
        flash("No pudimos desasignar a esta persona");
        return;
      }
      await supabase.from("activity_events").insert({
        actor_id: session.user.id,
        project_id: activeProjectId,
        task_id: task.id,
        verb: "moved",
        detail: `Desasignó a ${personName} de “${task.title}”`,
      });
    }

    const nextAssignees = task.assignees.filter((id) => id !== personId);
    setSelectedTask((current) =>
      current?.id === task.id
        ? { ...current, assignees: nextAssignees }
        : current,
    );
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, assignees: nextAssignees } : item,
      ),
    );
    setAssigneeBusy(false);
    flash(`${personName} fue desasignado`);
  }

  async function shareProject() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash("Enlace del proyecto copiado");
    } catch {
      flash("Proyecto listo para compartir");
    }
  }

  async function shareTask(task: Task) {
    const url = new URL(
      taskHref(activeProjectId, task.id),
      window.location.origin,
    ).href;
    const shareData = {
      title: task.title,
      text: `To-do de ${project}: ${task.title}`,
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        flash("Enlace del to-do compartido");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("Enlace del to-do copiado");
    } catch {
      flash("No pudimos copiar el enlace");
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      commentSubmittingRef.current ||
      !selectedTask ||
      (!commentDraft.trim() && pendingCommentImages.length === 0)
    )
      return;
    commentSubmittingRef.current = true;
    setCommentBusy(true);
    try {
      setCommentImageError("");
      if (commentAttachmentTargetId) {
        const retry = await uploadCommentImageBatch(
          [...pendingCommentImages],
          commentAttachmentTargetId,
        );
        if (retry.attachments.length) {
          setCommentsByTask((current) => ({
            ...current,
            [selectedTask.id]: (current[selectedTask.id] || []).map(
              (comment) =>
                comment.id === commentAttachmentTargetId
                  ? {
                      ...comment,
                      attachments: [
                        ...comment.attachments,
                        ...retry.attachments,
                      ],
                    }
                  : comment,
            ),
          }));
        }
        setPendingCommentImages(retry.failedImages);
        if (retry.failedImages.length) {
          const message =
            retry.error || "La imagen sigue pendiente. Intenta nuevamente.";
          setCommentImageError(message);
          flash("La imagen sigue pendiente; puedes volver a intentarlo");
        } else {
          setCommentAttachmentTargetId(null);
          flash(
            retry.attachments.length === 1
              ? "Imagen adjuntada al comentario"
              : "Imágenes adjuntadas al comentario",
          );
        }
        return;
      }
      const body = commentDraft.trim() || "Imagen adjunta";
      const pendingImages = [...pendingCommentImages];
      const peopleToAssign = mentionedPeople.filter((person) =>
        body.includes(`@${person.full_name}`),
      );
      const nextAssignees = Array.from(
        new Set([
          ...selectedTask.assignees,
          ...peopleToAssign.map((person) => person.id),
        ]),
      );
      let id = `comment-${Date.now()}`;
      if (
        session &&
        supabase &&
        !selectedTask.id.startsWith("t") &&
        !selectedTask.id.startsWith("local")
      ) {
        const inserted = await supabase
          .from("comments")
          .insert({
            task_id: selectedTask.id,
            author_id: session.user.id,
            body,
          })
          .select("id")
          .single();
        if (inserted.error) {
          flash("No pudimos publicar el comentario");
          return;
        }
        id = inserted.data.id;
        if (peopleToAssign.length) {
          const memberships = await supabase.from("project_members").upsert(
            peopleToAssign.map((person) => ({
              project_id: activeProjectId,
              user_id: person.id,
              role: "member",
            })),
            {
              onConflict: "project_id,user_id",
              ignoreDuplicates: true,
            },
          );
          if (memberships.error) {
            flash("El comentario se guardó, pero no pudimos agregar al equipo");
            return;
          }
          setProjectMemberIds((current) =>
            Array.from(
              new Set([
                ...current,
                ...peopleToAssign.map((person) => person.id),
              ]),
            ),
          );
          rememberWorkspaceProjectMembers(
            activeProjectId,
            peopleToAssign.map((person) => person.id),
          );
          await supabase.from("task_assignees").upsert(
            peopleToAssign.map((person) => ({
              task_id: selectedTask.id,
              user_id: person.id,
            })),
            { onConflict: "task_id,user_id" },
          );
          const notificationRows = await supabase
            .from("notifications")
            .insert(
              peopleToAssign.map((person) => ({
                user_id: person.id,
                actor_id: session.user.id,
                project_id: activeProjectId,
                task_id: selectedTask.id,
                type: "mention",
                title: `${displayName} te mencionó y asignó`,
                body: `${selectedTask.title}: ${body}`,
              })),
            )
            .select("id");
          if (notificationRows.error || !notificationRows.data?.length) {
            flash(
              "El comentario se guardó; las notificaciones quedaron pendientes",
            );
          } else {
            const emailSent = await sendTaskEmail(
              selectedTask.id,
              notificationRows.data.map((notification) => notification.id),
              "mention",
              body,
            );
            if (!emailSent)
              flash("El comentario se guardó; los correos quedaron pendientes");
          }
        }
        await supabase.from("activity_events").insert({
          actor_id: session.user.id,
          project_id: activeProjectId,
          task_id: selectedTask.id,
          verb: "commented",
          detail: `Comentó en “${selectedTask.title}”`,
        });
        await notifyTaskFollowers(
          selectedTask,
          `${displayName} comentó en un to-do que sigues`,
          `${selectedTask.title}: ${body.slice(0, 140)}`,
        );
      }
      const attachmentUpload = await uploadCommentImageBatch(pendingImages, id);
      const attachments = attachmentUpload.attachments;
      const failedAttachmentCount = attachmentUpload.failedImages.length;
      const comment = {
        id,
        body,
        author: session?.user?.user_metadata?.full_name || "Jesús Pacheco",
        author_id: currentAssigneeId,
        time: "Ahora",
        reactions: [],
        attachments,
      };
      setCommentsByTask((current) => ({
        ...current,
        [selectedTask.id]: [...(current[selectedTask.id] || []), comment],
      }));
      setTasks((current) =>
        current.map((task) =>
          task.id === selectedTask.id
            ? {
                ...task,
                comments: task.comments + 1,
                assignees: nextAssignees,
              }
            : task,
        ),
      );
      setSelectedTask({
        ...selectedTask,
        comments: selectedTask.comments + 1,
        assignees: nextAssignees,
      });
      setActivityEvents((current) => [
        {
          id: `activity-${Date.now()}`,
          actor_id: currentAssigneeId,
          project_id: activeProjectId,
          task_id: selectedTask.id,
          verb: "commented",
          detail: `Comentó en “${selectedTask.title}”`,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      saveCommentDraft(sessionUserId, selectedTask.id, "");
      setCommentDraft("");
      setPendingCommentImages(attachmentUpload.failedImages);
      setCommentAttachmentTargetId(failedAttachmentCount ? id : null);
      setCommentImageError(
        failedAttachmentCount
          ? attachmentUpload.error ||
              "La imagen quedó pendiente. Puedes volver a intentarlo."
          : "",
      );
      setMentionQuery(null);
      setMentionedPeople([]);
      flash(
        failedAttachmentCount
          ? `Comentario publicado; ${failedAttachmentCount} ${failedAttachmentCount === 1 ? "imagen no pudo subir" : "imágenes no pudieron subir"}`
          : peopleToAssign.length
            ? `Comentario publicado · ${peopleToAssign.length} ${peopleToAssign.length === 1 ? "persona asignada" : "personas asignadas"}`
            : "Comentario publicado",
      );
    } finally {
      window.setTimeout(() => {
        commentSubmittingRef.current = false;
        setCommentBusy(false);
      }, 400);
    }
  }

  async function toggleChecklistStep(
    step: Task["steps"][number],
    index: number,
  ) {
    if (!selectedTask) return;
    const updatedStep = { ...step, completed: !step.completed };
    const updated = {
      ...selectedTask,
      steps: selectedTask.steps.map((item, itemIndex) =>
        itemIndex === index ? updatedStep : item,
      ),
    };
    const detail = `${updatedStep.completed ? "Completó" : "Reabrió"} el paso “${step.title}” en “${selectedTask.title}”`;
    setSelectedTask(updated);
    setTasks((all) =>
      all.map((task) => (task.id === updated.id ? updated : task)),
    );
    setActivityEvents((current) => [
      {
        id: `activity-${Date.now()}`,
        actor_id: currentAssigneeId,
        project_id: activeProjectId,
        task_id: selectedTask.id,
        verb: "checked",
        detail,
        created_at: new Date().toISOString(),
      },
      ...current,
    ]);
    if (session && supabase && step.id) {
      await supabase
        .from("task_steps")
        .update({ completed: updatedStep.completed })
        .eq("id", step.id);
      await supabase.from("activity_events").insert({
        actor_id: session.user.id,
        project_id: activeProjectId,
        task_id: selectedTask.id,
        verb: "checked",
        detail,
      });
    }
  }

  function beginTaskEditing() {
    if (!selectedTask) return;
    setTaskEditSteps(
      selectedTask.steps.length
        ? selectedTask.steps.map((step) => ({ ...step }))
        : [{ title: "", completed: false }],
    );
    setTaskEditing(true);
  }

  function cancelTaskEditing() {
    if (taskEditBusy) return;
    setTaskEditing(false);
    setTaskEditSteps(selectedTask?.steps.map((step) => ({ ...step })) || []);
  }

  function updateTaskEditStep(index: number, title: string) {
    setTaskEditSteps((current) =>
      current.map((step, stepIndex) =>
        stepIndex === index ? { ...step, title } : step,
      ),
    );
  }

  function addTaskEditStep(afterIndex = taskEditSteps.length - 1) {
    setTaskEditSteps((current) => [
      ...current.slice(0, afterIndex + 1),
      { title: "", completed: false },
      ...current.slice(afterIndex + 1),
    ]);
  }

  function removeTaskEditStep(index: number) {
    setTaskEditSteps((current) => {
      const next = current.filter((_, stepIndex) => stepIndex !== index);
      return next.length ? next : [{ title: "", completed: false }];
    });
  }

  async function saveTaskDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask || taskEditBusy) return;
    const task = selectedTask;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    if (!title) {
      flash("Escribe un título para guardar el to-do");
      return;
    }
    const description = String(form.get("description") || "").trim();
    const due = String(form.get("due") || "");
    const labelName =
      String(form.get("label") || "General").trim() || "General";
    const editedSteps = taskEditSteps
      .map((step) => ({ ...step, title: step.title.trim() }))
      .filter((step) => step.title);
    const isSavedTask =
      !task.id.startsWith("t") && !task.id.startsWith("local");
    let persistedSteps = editedSteps;

    setTaskEditBusy(true);
    try {
      if (session && supabase && isSavedTask) {
        const taskUpdate = await supabase
          .from("tasks")
          .update({
            title,
            description,
            due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
          })
          .eq("id", task.id)
          .select("id")
          .single();
        if (taskUpdate.error) {
          flash("No pudimos guardar los cambios del to-do");
          return;
        }

        const existingStepIds = task.steps.flatMap((step) =>
          step.id ? [step.id] : [],
        );
        const keptStepIds = editedSteps.flatMap((step) =>
          step.id ? [step.id] : [],
        );
        const removedStepIds = existingStepIds.filter(
          (id) => !keptStepIds.includes(id),
        );
        const savedSteps: Task["steps"] = [];
        for (const [position, step] of editedSteps.entries()) {
          if (step.id) {
            const saved = await supabase
              .from("task_steps")
              .update({ title: step.title, position })
              .eq("id", step.id)
              .select("id")
              .single();
            if (saved.error) throw saved.error;
            savedSteps.push(step);
          } else {
            const saved = await supabase
              .from("task_steps")
              .insert({
                task_id: task.id,
                title: step.title,
                completed: step.completed,
                position,
              })
              .select("id")
              .single();
            if (saved.error || !saved.data) throw saved.error;
            savedSteps.push({ ...step, id: saved.data.id });
          }
        }
        if (removedStepIds.length) {
          const removed = await supabase
            .from("task_steps")
            .delete()
            .in("id", removedStepIds);
          if (removed.error) throw removed.error;
        }
        persistedSteps = savedSteps;

        const label = await supabase
          .from("labels")
          .upsert(
            { project_id: activeProjectId, name: labelName, color: "#327B9F" },
            { onConflict: "project_id,name" },
          )
          .select("id")
          .single();
        if (label.error || !label.data) throw label.error;
        const clearedLabels = await supabase
          .from("task_labels")
          .delete()
          .eq("task_id", task.id);
        if (clearedLabels.error) throw clearedLabels.error;
        const linkedLabel = await supabase
          .from("task_labels")
          .insert({ task_id: task.id, label_id: label.data.id });
        if (linkedLabel.error) throw linkedLabel.error;
        await supabase.from("activity_events").insert({
          actor_id: session.user.id,
          project_id: activeProjectId,
          task_id: task.id,
          verb: "updated",
          detail: `Editó “${title}”`,
        });
      }

      const updated: Task = {
        ...task,
        title,
        description,
        due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : "Sin fecha",
        labels: [labelName],
        steps: persistedSteps,
      };
      setSelectedTask(updated);
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? updated : item)),
      );
      setWorkspaceTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, ...updated } : item,
        ),
      );
      setTaskEditSteps(persistedSteps.map((step) => ({ ...step })));
      setTaskEditing(false);
      flash("Cambios guardados");
      await notifyTaskFollowers(
        task,
        `${displayName} actualizó un to-do que sigues`,
        title,
      );
    } catch {
      flash("No pudimos guardar todos los cambios del to-do");
    } finally {
      setTaskEditBusy(false);
    }
  }

  async function markVisibleNotificationsRead() {
    const markingMentions = notificationTab === "mentions";
    setNotifications((current) =>
      current.map((notification) =>
        notification.unread &&
        (markingMentions
          ? notification.type === "mention"
          : notification.type !== "mention")
          ? { ...notification, unread: false }
          : notification,
      ),
    );
    if (session && supabase) {
      const update = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", session.user.id)
        .is("read_at", null);
      if (markingMentions) await update.eq("type", "mention");
      else await update.neq("type", "mention");
    }
    if (!markingMentions) setNotificationTab("read");
  }

  async function markNotification(id: string) {
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, unread: false } : n)),
    );
    if (session && supabase)
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
  }

  async function openNotification(note: WorkspaceNotification) {
    void markNotification(note.id);
    setNotificationOpen(false);
    setMobileNav(false);

    if (
      !note.task_id &&
      ["announcement", "reaction", "subscription"].includes(note.type)
    ) {
      setView("messages");
      return;
    }

    if (!note.project_id) {
      setView("home");
      if (!note.task_id)
        flash("Esta notificación no tiene un origen disponible");
      return;
    }

    const targetProject = [...projects, ...archivedProjects].find(
      (item) => item.id === note.project_id,
    );
    if (!targetProject) {
      flash("El proyecto de esta notificación ya no está disponible");
      return;
    }

    setProject(targetProject.name);
    setActiveProjectId(targetProject.id);
    setView(
      note.type === "announcement" && !note.task_id ? "messages" : "board",
    );
    setProjectView("board");
    setStatusFilter("all");
    selectedTaskIdRef.current = null;
    setSelectedTask(null);

    if (!session || !supabase) {
      setProjectMemberIds(people.map((person) => person.id));
      if (targetProject.id === "demo-1") setTasks(initialTasks);
      const targetTask = initialTasks.find((task) => task.id === note.task_id);
      if (targetTask) await openTask(targetTask);
      else if (note.task_id)
        flash("La tarea de esta notificación ya no está disponible");
      return;
    }

    const [targetTasks] = await Promise.all([
      loadProjectTasks(targetProject.id),
      loadProjectMembers(targetProject.id, targetProject.owner_id),
    ]);
    if (!note.task_id) return;
    const targetTask = targetTasks.find((task) => task.id === note.task_id);
    if (targetTask) await openTask(targetTask);
    else flash("La tarea de esta notificación ya no está disponible");
  }

  if (!authReady)
    return (
      <main className="loading-screen">
        <Loader2 className="spin" />
        <span>Preparando tu espacio…</span>
      </main>
    );
  if ((!session && !demo) || passwordResetStep !== "idle")
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <Image
            className="auth-city"
            src="/spartanblue-coast.jpg"
            alt="Costa mediterránea"
            fill
            priority
            sizes="(max-width: 780px) 0px, 54vw"
          />
          <div className="auth-story-shade" aria-hidden="true" />
          <div className="story-brand brand">
            <Image
              src="/spartanblue-logo.png"
              alt="Spartanblue"
              width={594}
              height={243}
              priority
            />
          </div>
          <div className="story-copy">
            <span className="brand-rule" aria-hidden="true">
              <i />
              <i />
            </span>
            <h1>
              Llega lejos;
              <br />
              el futuro es <em>brillante.</em>
            </h1>
            <p>
              Un espacio para conectar personas, proyectos y
              objetivos compartidos.
            </p>
          </div>
          <div className="auth-ribbon" aria-hidden="true">
            <i />
          </div>
          <small className="auth-copyright">
            © 2026 Spartanblue · Workspace interno
          </small>
        </section>
        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-brand-mobile brand">
              <Image
                src="/spartanblue-logo.png"
                alt="Spartanblue"
                width={746}
                height={238}
                priority
              />
            </div>
            <h2>
              {passwordResetStep === "email"
                ? "Recuperar contraseña"
                : passwordResetStep === "verify"
                  ? "Verifica tu correo"
                  : authMode === "login"
                    ? "Iniciar sesión"
                    : "Crear cuenta"}
            </h2>
            <p>
              {passwordResetStep === "email"
                ? "Te enviaremos un código para comprobar que la cuenta es tuya."
                : passwordResetStep === "verify"
                  ? `Escribe el código enviado a ${resetEmail} y elige una contraseña nueva.`
                  : authMode === "login"
                    ? "Bienvenido de nuevo. Ingresa tus datos para continuar."
                    : "Registra tus datos para entrar al workspace interno."}
            </p>
            {passwordResetStep === "email" ? (
              <form onSubmit={requestPasswordReset}>
                <label>
                  Correo electrónico registrado
                  <span className="auth-input">
                    <Mail size={19} aria-hidden="true" />
                    <input
                      name="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                      placeholder="nombre@empresa.com"
                      autoComplete="email"
                      required
                    />
                  </span>
                </label>
                {resetMessage && (
                  <div className="auth-message" role="status">
                    {resetMessage}
                  </div>
                )}
                <button
                  className="primary-button auth-submit"
                  disabled={resetBusy}
                >
                  {resetBusy ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    "Enviar código"
                  )}
                </button>
              </form>
            ) : passwordResetStep === "verify" ? (
              <form onSubmit={confirmPasswordReset}>
                <label>
                  Código de verificación
                  <span className="auth-input auth-code-input">
                    <ShieldCheck size={19} aria-hidden="true" />
                    <input
                      name="reset-code"
                      type="text"
                      value={resetCode}
                      onChange={(event) =>
                        setResetCode(
                          event.target.value.replace(/\D/g, "").slice(0, 8),
                        )
                      }
                      placeholder="Código recibido"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      minLength={6}
                      maxLength={8}
                      required
                    />
                  </span>
                </label>
                <label>
                  Nueva contraseña
                  <span className="auth-input">
                    <LockKeyhole size={19} aria-hidden="true" />
                    <input
                      name="new-password"
                      type={showResetPassword ? "text" : "password"}
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                      placeholder="12 caracteres, mayúscula, número y símbolo"
                      autoComplete="new-password"
                      minLength={12}
                      required
                    />
                    <button
                      type="button"
                      className="password-visibility"
                      aria-label={
                        showResetPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                      aria-pressed={showResetPassword}
                      onClick={() =>
                        setShowResetPassword((current) => !current)
                      }
                    >
                      {showResetPassword ? (
                        <EyeOff size={19} />
                      ) : (
                        <Eye size={19} />
                      )}
                    </button>
                  </span>
                </label>
                <label>
                  Confirmar contraseña
                  <span className="auth-input">
                    <LockKeyhole size={19} aria-hidden="true" />
                    <input
                      name="confirm-password"
                      type={showResetPassword ? "text" : "password"}
                      value={resetPasswordConfirm}
                      onChange={(event) =>
                        setResetPasswordConfirm(event.target.value)
                      }
                      placeholder="Repite la contraseña nueva"
                      autoComplete="new-password"
                      minLength={12}
                      required
                    />
                  </span>
                </label>
                {resetMessage && (
                  <div className="auth-message" role="status">
                    {resetMessage}
                  </div>
                )}
                <button
                  className="primary-button auth-submit"
                  disabled={resetBusy}
                >
                  {resetBusy ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    "Guardar contraseña nueva"
                  )}
                </button>
                <button
                  type="button"
                  className="auth-text-button"
                  onClick={resendPasswordResetCode}
                  disabled={resetBusy}
                >
                  Reenviar código
                </button>
              </form>
            ) : (
              <form onSubmit={handleAuth}>
                {authMode === "signup" && (
                  <label>
                    Nombre completo
                    <span className="auth-input">
                      <UserRound size={19} aria-hidden="true" />
                      <input name="name" placeholder="Tu nombre" required />
                    </span>
                  </label>
                )}
                <label>
                  Correo electrónico
                  <span className="auth-input">
                    <Mail size={19} aria-hidden="true" />
                    <input
                      name="email"
                      type="email"
                      placeholder="nombre@empresa.com"
                      autoComplete="email"
                      required
                    />
                  </span>
                </label>
                <label>
                  Contraseña
                  <span className="auth-input">
                    <LockKeyhole size={19} aria-hidden="true" />
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={
                        authMode === "signup"
                          ? "12 caracteres, mayúscula, número y símbolo"
                          : "Ingresa tu contraseña"
                      }
                      autoComplete={
                        authMode === "login"
                          ? "current-password"
                          : "new-password"
                      }
                      minLength={authMode === "signup" ? 12 : 6}
                      required
                    />
                    <button
                      type="button"
                      className="password-visibility"
                      aria-label={
                        showPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </span>
                </label>
                {authMode === "signup" && (
                  <label>
                    Área
                    <span className="auth-input">
                      <Building2 size={19} aria-hidden="true" />
                      <input
                        name="area"
                        placeholder="Ej. Marketing, Jurídico o Dirección"
                        autoComplete="organization-title"
                        maxLength={80}
                        required
                      />
                    </span>
                  </label>
                )}
                {authMode === "login" && (
                  <button
                    type="button"
                    className="forgot-password-button"
                    onClick={() => {
                      setPasswordResetStep("email");
                      setAuthMessage("");
                      setResetMessage("");
                    }}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
                {authMessage && (
                  <div className="auth-message">{authMessage}</div>
                )}
                <button
                  className="primary-button auth-submit"
                  disabled={authBusy}
                >
                  {authBusy ? (
                    <Loader2 className="spin" size={18} />
                  ) : authMode === "login" ? (
                    "Iniciar sesión"
                  ) : (
                    "Crear mi cuenta"
                  )}
                </button>
              </form>
            )}
            {passwordResetStep !== "idle" ? (
              <button
                type="button"
                className="auth-back-button"
                onClick={closePasswordReset}
              >
                <ArrowLeft size={17} /> Volver a iniciar sesión
              </button>
            ) : (
              <>
                <div className="auth-switch">
                  <span>
                    {authMode === "login"
                      ? "¿No tienes una cuenta?"
                      : "¿Ya tienes una cuenta?"}
                  </span>
                  <button
                    onClick={() => {
                      setAuthMode(authMode === "login" ? "signup" : "login");
                      setAuthMessage("");
                    }}
                  >
                    {authMode === "login" ? "Regístrate" : "Iniciar sesión"}
                  </button>
                </div>
              </>
            )}
            <small className="auth-mobile-copyright">
              © 2026 Spartanblue
            </small>
          </div>
        </section>
      </main>
    );

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="sidebar-head">
          <div className="brand sidebar-brand">
            <Image
              src="/spartanblue-logo.png"
              alt="Spartanblue"
              width={746}
              height={238}
              priority
            />
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">TW</span>
          <span>
            <strong>Spartanblue</strong>
            <small>Equipo interno</small>
          </span>
          <ChevronDown size={15} />
        </div>
        <div className="sidebar-navigation-scroll">
          <nav className="primary-nav">
            <button
              className={view === "home" ? "active" : ""}
              onClick={goHome}
            >
              <LayoutDashboard size={18} />
              Inicio
            </button>
            <button
              className={view === "mytasks" ? "active" : ""}
              onClick={() => setView("mytasks")}
            >
              <ListTodo size={18} />
              Mis tareas
              <span className="nav-count">{myWorkspaceTasks.length}</span>
            </button>
            <button
              className={view === "inbox" ? "active" : ""}
              onClick={() => {
                setView("inbox");
                setNotificationTab("new");
                setNotificationOpen(true);
              }}
            >
              <Inbox size={18} />
              Bandeja<span className="nav-dot">{unread}</span>
            </button>
            <button
              className={view === "messages" ? "active" : ""}
              onClick={() => {
                setMobileNav(false);
                setView("messages");
              }}
            >
              <MessageSquareText size={18} />
              Mensajes
            </button>
            {ticketProject ? (
              <Link
                href={projectHref(ticketProject.id)}
                className={
                  view === "board" && activeProjectId === ticketProjectId
                    ? "active"
                    : ""
                }
                title="Clic derecho o Ctrl/Cmd + clic para abrir en otra pestaña"
                onClick={(event) => {
                  if (!shouldHandleInternalLink(event)) return;
                  event.preventDefault();
                  setMobileNav(false);
                  setStatusFilter("all");
                  void switchProject(ticketProject);
                }}
              >
                <TicketCheck size={18} />
                Tickets sin asignar
                <span className="nav-count ticket-count">
                  {ticketInboxCount}
                </span>
              </Link>
            ) : (
              <button disabled>
                <TicketCheck size={18} />
                Tickets sin asignar
                <span className="nav-count ticket-count">
                  {ticketInboxCount}
                </span>
              </button>
            )}
            {TICKET_ADMIN_URL && <a
              className="ticket-admin-link"
              href={TICKET_ADMIN_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={18} />
              Panel de tickets
            </a>}
          </nav>
          <div className="nav-section projects-nav-section">
            <div className="section-label projects-section-label">
              <button
                type="button"
                className={`projects-menu-trigger ${projectsMenuOpen ? "open" : ""}`}
                aria-expanded={projectsMenuOpen}
                aria-controls="sidebar-project-list"
                onClick={() => setProjectsMenuOpen((current) => !current)}
              >
                <ChevronRight size={15} aria-hidden="true" />
                <span>PROYECTOS</span>
                <span className="projects-menu-count">
                  {regularProjects.length}
                </span>
              </button>
              <button
                type="button"
                className="new-project-shortcut"
                aria-label="Nuevo proyecto"
                title="Nuevo proyecto"
                onClick={() => setProjectModal(true)}
              >
                <Plus size={15} />
              </button>
            </div>
            {projectsMenuOpen && (
              <div
                id="sidebar-project-list"
                className="project-nav-scroll"
                role="region"
                aria-label="Lista desplazable de proyectos"
              >
                {regularProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={projectHref(p.id)}
                    className={`project-link ${activeProjectId === p.id && view === "board" ? "active" : ""}`}
                    title="Clic derecho o Ctrl/Cmd + clic para abrir en otra pestaña"
                    onClick={(event) => {
                      if (!shouldHandleInternalLink(event)) return;
                      event.preventDefault();
                      void switchProject(p);
                    }}
                  >
                    <span style={{ background: p.color }} />
                    {p.name}
                  </Link>
                ))}
                {regularProjects.length === 0 && (
                  <button
                    className="empty-project-link"
                    onClick={() => setProjectModal(true)}
                  >
                    <Plus size={15} /> Crear proyecto
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="nav-section">
            <div className="section-label">
              <span>ORGANIZACIÓN</span>
            </div>
            <button
              className={view === "backlog" ? "active" : ""}
              onClick={() => setView("backlog")}
            >
              <ClipboardList size={17} />
              Backlog y presets
            </button>
            <button
              className={view === "team" ? "active" : ""}
              onClick={() => setView("team")}
            >
              <Users size={17} />
              Personas y áreas
            </button>
            <button
              className={view === "archive" ? "active" : ""}
              onClick={() => setView("archive")}
            >
              <Archive size={17} />
              Archivados
            </button>
            <button
              className={view === "settings" ? "active" : ""}
              onClick={() => setView("settings")}
            >
              <Settings size={17} />
              Configuración
            </button>
          </div>
        </div>
        <div className="sidebar-footer">
          <button onClick={() => setView("settings")}>
            <Avatar id={currentAssigneeId} person={currentPerson} />
            <span>
              <strong>
                {session?.user?.user_metadata?.full_name || "Jesús Pacheco"}
              </strong>
              <small>{demo ? "Modo demostración" : session?.user?.email}</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={21} />
          </button>
          <div className="search-box">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tareas, personas o proyectos…"
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <button
              className="icon-button bell-button"
              onClick={() => {
                if (!notificationOpen) setNotificationTab("new");
                setNotificationOpen(!notificationOpen);
              }}
            >
              <Bell size={20} />
              {unread > 0 && <span>{unread}</span>}
            </button>
            <button className="profile-button" onClick={() => setView("team")}>
              <Avatar id={currentAssigneeId} person={currentPerson} />
              <ChevronDown size={14} />
            </button>
          </div>
        </header>

        {view === "messages" && (
          <WorkspaceExtensions
            userId={currentAssigneeId}
            directory={directory}
            demo={demo}
            onToast={flash}
          />
        )}

        {view === "board" && activeProject && (
          <div className="content board-content">
            <section
              className={`project-masthead ${activeProject.image_url ? "has-project-cover" : ""}`}
              style={{ borderTopColor: activeProject?.color || "#327B9F" }}
            >
              {activeProject.image_url && (
                <div className="project-cover">
                  <Image
                    src={activeProject.image_url}
                    alt={`Portada de ${activeProject.name}`}
                    fill
                    sizes="(max-width: 780px) 100vw, 75vw"
                    unoptimized={activeProject.image_url.startsWith("blob:")}
                  />
                  <span
                    className="project-cover-accent"
                    style={{ background: activeProject.color }}
                  />
                </div>
              )}
              <div className="project-header">
                <div className="project-title-block">
                  <div className="breadcrumbs">
                    Proyectos <span>/</span> {project}
                  </div>
                  <div className="project-title-row">
                    <span
                      className="project-mark"
                      style={{ background: activeProject?.color || "#327B9F" }}
                    >
                      TW
                    </span>
                    <div>
                      <span className="project-kicker">
                        CENTRO DEL PROYECTO
                      </span>
                      <h1>{project}</h1>
                    </div>
                  </div>
                  <p>
                    {activeProject?.description ||
                      "Coordinamos responsables, conversaciones y entregables en un solo lugar."}
                  </p>
                </div>
                <div className="project-actions">
                  <button
                    className="project-people"
                    type="button"
                    aria-label={`Administrar personas de ${activeProject.name}`}
                    onClick={() => setProjectMemberModal(true)}
                  >
                    {projectMembers.slice(0, 3).map((person) => (
                      <Avatar id={person.id} person={person} key={person.id} />
                    ))}
                    {projectMembers.length > 3 && (
                      <span className="more-people">
                        +{projectMembers.length - 3}
                      </span>
                    )}
                    {projectMembers.length === 0 && (
                      <span className="project-people-empty">Sin equipo</span>
                    )}
                  </button>
                  <button
                    className="secondary-button add-project-people"
                    type="button"
                    onClick={() => setProjectMemberModal(true)}
                  >
                    <UserPlus size={17} />
                    Agregar personas
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void shareProject()}
                  >
                    <Copy size={16} />
                    Compartir
                  </button>
                  <ProjectActionMenu
                    project={activeProject}
                    busy={projectBusy}
                    canManage={canManageProject}
                    onEdit={openProjectEditor}
                    onArchive={() => void archiveProject(activeProject)}
                    onDelete={() => {
                      setProjectDeleteConfirmation("");
                      setProjectToDelete(activeProject);
                    }}
                  />
                  <button
                    className="primary-button"
                    onClick={() => openTaskCreator()}
                  >
                    <Plus size={18} />
                    Nueva tarea
                  </button>
                </div>
              </div>
              <div className="project-snapshot">
                <div
                  className="progress-orb"
                  style={{
                    background: `conic-gradient(${activeProject?.color || "#327B9F"} ${progress * 3.6}deg, #e8e6df 0deg)`,
                  }}
                >
                  <span>{progress}%</span>
                </div>
                <div className="snapshot-copy">
                  <strong>Avance general</strong>
                  <small>
                    {completedTasks} de {workflowTasks.length} tareas terminadas
                  </small>
                </div>
                <div className="snapshot-stat">
                  <Target size={18} />
                  <span>
                    <strong>{workflowTasks.length - completedTasks}</strong>
                    <small>pendientes</small>
                  </span>
                </div>
                <div className="snapshot-stat urgent">
                  <Flag size={18} />
                  <span>
                    <strong>{urgentTasks}</strong>
                    <small>prioridad alta</small>
                  </span>
                </div>
                <div className="snapshot-note">
                  <Sparkles size={17} />
                  <span>
                    <strong>Ritmo del equipo</strong>
                    <small>
                      {progress >= 60
                        ? "El proyecto va muy bien"
                        : "Cada paso cuenta"}
                    </small>
                  </span>
                </div>
              </div>
            </section>

            <div className="view-tabs">
              <button
                className={projectView === "board" ? "active" : ""}
                onClick={() => setProjectView("board")}
              >
                <Columns3 size={15} />
                Tablero
              </button>
              <button
                className={projectView === "list" ? "active" : ""}
                onClick={() => setProjectView("list")}
              >
                <ListChecks size={15} />
                To-dos
              </button>
              <button
                className={projectView === "calendar" ? "active" : ""}
                onClick={() => setProjectView("calendar")}
              >
                <CalendarRange size={15} />
                Agenda
              </button>
              <button
                className={projectView === "minutes" ? "active" : ""}
                onClick={() => setProjectView("minutes")}
              >
                <NotebookPen size={15} />
                Minutas
              </button>
              <span />
              {projectView !== "minutes" && (
                <div className="filter-wrap">
                  <button
                    className={`filter-button ${statusFilter !== "all" ? "active-filter" : ""}`}
                    onClick={() => setFilterOpen(!filterOpen)}
                  >
                    <SlidersHorizontal size={15} />
                    {statusFilter === "all"
                      ? "Filtrar"
                      : columns.find((item) => item.key === statusFilter)
                          ?.label}
                  </button>
                  {filterOpen && (
                    <div className="filter-menu">
                      <button
                        className={statusFilter === "all" ? "selected" : ""}
                        onClick={() => {
                          setStatusFilter("all");
                          setFilterOpen(false);
                        }}
                      >
                        Todos los estados
                      </button>
                      {activeWorkflowColumns.map((item) => (
                        <button
                          key={item.key}
                          className={
                            statusFilter === item.key ? "selected" : ""
                          }
                          onClick={() => {
                            setStatusFilter(item.key);
                            setFilterOpen(false);
                          }}
                        >
                          <i style={{ background: item.dot }} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {projectView === "board" && (
              <div className="kanban">
                {activeWorkflowColumns.map((column) => {
                  const columnTasks = tasksForStatus(
                    visibleWorkflowTasks,
                    column.key,
                  );
                  return (
                    <section
                      className={`kanban-column column-${column.key}`}
                      key={column.key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) =>
                        void moveTask(
                          e.dataTransfer.getData("taskId"),
                          column.key,
                        )
                      }
                    >
                      <div className="column-header">
                        <div>
                          <i style={{ background: column.dot }} />
                          <strong>{column.label}</strong>
                          <span>{columnTasks.length}</span>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`Agregar en ${column.label}`}
                          onClick={() => openTaskCreator(column.key)}
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                      <div className="column-body">
                        {columnTasks.map((task) => (
                          <TaskCard
                            task={task}
                            href={taskHref(activeProjectId, task.id)}
                            directory={directory}
                            projects={projects}
                            activeProjectId={activeProjectId}
                            actionBusy={taskActionBusy === task.id}
                            onOpen={() => void openTask(task)}
                            onToggleDone={() => void toggleTaskDone(task)}
                            onMoveStatus={(status) =>
                              void moveTask(task.id, status)
                            }
                            onMoveProject={(projectId) =>
                              void moveTaskToProject(task, projectId)
                            }
                            onCopy={(projectId) =>
                              void duplicateTask(task, task.status, projectId)
                            }
                            onShare={() => void shareTask(task)}
                            onDelete={() => setTaskToDelete(task)}
                            key={task.id}
                          />
                        ))}
                        <button
                          className="add-card"
                          onClick={() => openTaskCreator(column.key)}
                        >
                          <Plus size={16} />
                          Agregar tarea
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {projectView === "list" && (
              <div className="todo-lists">
                {activeWorkflowColumns.map((column) => {
                  const columnTasks = tasksForStatus(
                    visibleWorkflowTasks,
                    column.key,
                  );
                  return (
                    <section className="todo-group" key={column.key}>
                      <header>
                        <div>
                          <i style={{ background: column.dot }} />
                          <h2>{column.label}</h2>
                          <span>{columnTasks.length}</span>
                        </div>
                        <button onClick={() => openTaskCreator(column.key)}>
                          <Plus size={16} />
                          Agregar
                        </button>
                      </header>
                      <div className="todo-rows">
                        {columnTasks.map((task) => {
                          const complete = task.steps.filter(
                            (step) => step.completed,
                          ).length;
                          return (
                            <article className="todo-row" key={task.id}>
                              <button
                                className={`todo-check ${task.status === "done" ? "checked" : ""}`}
                                aria-label={
                                  task.status === "done"
                                    ? "Reabrir tarea"
                                    : "Completar tarea"
                                }
                                onClick={() => void toggleTaskDone(task)}
                              >
                                {task.status === "done" && <Check size={15} />}
                              </button>
                              <a
                                className="todo-main"
                                href={taskHref(activeProjectId, task.id)}
                                onClick={(event) => {
                                  if (!shouldHandleInternalLink(event)) return;
                                  event.preventDefault();
                                  void openTask(task);
                                }}
                              >
                                <span>
                                  <strong>{task.title}</strong>
                                  <small>
                                    {plainTextFromDescription(
                                      task.description,
                                    ) || "Sin descripción"}
                                  </small>
                                </span>
                              </a>
                              <span
                                className={`priority-badge priority-${task.priority}`}
                              >
                                <Flag size={12} />
                                {task.priority === "urgent"
                                  ? "Urgente"
                                  : task.priority === "high"
                                    ? "Alta"
                                    : task.priority === "low"
                                      ? "Baja"
                                      : "Media"}
                              </span>
                              <span
                                className={`todo-due ${task.due === "Hoy" ? "due-now" : ""}`}
                              >
                                <CalendarDays size={14} />
                                {dueLabel(task.due)}
                              </span>
                              <span className="todo-progress">
                                <ClipboardList size={14} />
                                {complete}/{task.steps.length}
                              </span>
                              <span className="assignees">
                                {task.assignees.length > 0 ? (
                                  task.assignees.map((id) => (
                                    <Avatar
                                      id={id}
                                      person={directory.find(
                                        (person) => person.id === id,
                                      )}
                                      small
                                      key={id}
                                    />
                                  ))
                                ) : (
                                  <span className="unassigned-chip">
                                    Sin asignar
                                  </span>
                                )}
                              </span>
                              <TaskActionMenu
                                task={task}
                                projects={projects}
                                activeProjectId={activeProjectId}
                                busy={taskActionBusy === task.id}
                                onOpen={() => void openTask(task)}
                                onMoveStatus={(status) =>
                                  void moveTask(task.id, status)
                                }
                                onMoveProject={(projectId) =>
                                  void moveTaskToProject(task, projectId)
                                }
                                onCopy={(projectId) =>
                                  void duplicateTask(
                                    task,
                                    task.status,
                                    projectId,
                                  )
                                }
                                onShare={() => void shareTask(task)}
                                onDelete={() => setTaskToDelete(task)}
                              />
                            </article>
                          );
                        })}
                        {columnTasks.length === 0 && (
                          <div className="empty-row">
                            No hay tareas aquí. El equipo va despejando el
                            camino.
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {projectView === "calendar" && (
              <div className="schedule-grid">
                {calendarGroups.map((group) => (
                  <section className="schedule-group" key={group.label}>
                    <header>
                      <span>{group.label.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <h2>{group.label}</h2>
                        <p>{group.caption}</p>
                      </div>
                      <strong>{group.tasks.length}</strong>
                    </header>
                    <div>
                      {group.tasks.map((task) => (
                        <a
                          className="schedule-task"
                          key={task.id}
                          href={taskHref(activeProjectId, task.id)}
                          onClick={(event) => {
                            if (!shouldHandleInternalLink(event)) return;
                            event.preventDefault();
                            void openTask(task);
                          }}
                        >
                          <span
                            className={`priority priority-${task.priority}`}
                          />
                          <span>
                            <strong>{task.title}</strong>
                            <small>
                              {
                                columns.find((item) => item.key === task.status)
                                  ?.label
                              }{" "}
                              · {task.labels[0]}
                            </small>
                          </span>
                          <span className="assignees">
                            {task.assignees.map((id) => (
                              <Avatar
                                id={id}
                                person={directory.find(
                                  (person) => person.id === id,
                                )}
                                small
                                key={id}
                              />
                            ))}
                          </span>
                        </a>
                      ))}
                      {group.tasks.length === 0 && (
                        <p className="schedule-empty">
                          Sin entregas por ahora.
                        </p>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {projectView === "minutes" && (
              <ProjectMinutes
                projectId={activeProject.id}
                projectName={activeProject.name}
                userId={currentAssigneeId}
                directory={directory}
                demo={demo}
                showStorageMeter={!demo && Boolean(session)}
                onToast={flash}
              />
            )}
          </div>
        )}

        {view === "board" && !activeProject && (
          <div className="content board-content empty-workspace-wrap">
            <section className="empty-workspace">
              <span className="empty-workspace-mark">
                <Plus size={24} />
              </span>
              <span className="eyebrow">TU PRIMER ESPACIO</span>
              <h1>Todavía no tienes proyectos</h1>
              <p>
                Crea un proyecto para organizar responsables, conversaciones,
                pendientes y fechas en un solo lugar.
              </p>
              <button
                className="primary-button"
                onClick={() => setProjectModal(true)}
              >
                <Plus size={18} /> Crear primer proyecto
              </button>
            </section>
          </div>
        )}

        {view === "backlog" && (
          <div className="content simple-view backlog-view">
            <span className="eyebrow">BIBLIOTECA DE TRABAJO</span>
            <div className="simple-head">
              <div>
                <h1>Backlog y presets</h1>
                <p>
                  Aquí viven las tareas base. No aparecen en el tablero hasta
                  que decides moverlas o hacer una copia.
                </p>
              </div>
              <div className="backlog-head-actions">
                <button
                  className="secondary-button"
                  onClick={() => setTemplateModal(true)}
                >
                  <Sparkles size={17} />
                  Nuevo preset
                </button>
                <button
                  className="primary-button"
                  onClick={() => openTaskCreator("backlog")}
                >
                  <Plus size={18} />
                  Nueva tarea base
                </button>
              </div>
            </div>
            <section className="backlog-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">TAREAS GUARDADAS</span>
                  <h2>Base del proyecto</h2>
                </div>
                <span>
                  {tasks.filter((task) => task.status === "backlog").length}{" "}
                  guardadas
                </span>
              </div>
              <div className="backlog-grid">
                {tasks
                  .filter((task) => task.status === "backlog")
                  .map((task) => (
                    <article className="backlog-card" key={task.id}>
                      <div className="backlog-card-top">
                        <span className="task-label">{task.labels[0]}</span>
                        <div className="backlog-card-tools">
                          <span>
                            <ClipboardList size={14} />
                            {task.steps.length} pasos
                          </span>
                          <TaskActionMenu
                            task={task}
                            projects={projects}
                            activeProjectId={activeProjectId}
                            busy={taskActionBusy === task.id}
                            onOpen={() => void openTask(task)}
                            onMoveStatus={(status) =>
                              void moveTask(task.id, status)
                            }
                            onMoveProject={(projectId) =>
                              void moveTaskToProject(task, projectId)
                            }
                            onCopy={(projectId) =>
                              void duplicateTask(task, "todo", projectId)
                            }
                            onShare={() => void shareTask(task)}
                            onDelete={() => setTaskToDelete(task)}
                          />
                        </div>
                      </div>
                      <h3>{task.title}</h3>
                      <p>{plainTextFromDescription(task.description)}</p>
                      <div className="backlog-actions">
                        <button
                          onClick={() => void duplicateTask(task, "todo")}
                        >
                          <Copy size={15} />
                          Hacer copia
                        </button>
                        <button
                          className="promote"
                          onClick={() => void moveTask(task.id, "todo")}
                        >
                          <ChevronDown size={15} />
                          Mover a Por hacer
                        </button>
                      </div>
                    </article>
                  ))}
                {tasks.every((task) => task.status !== "backlog") && (
                  <div className="empty-row">
                    Todavía no hay tareas base. Guarda aquí los procesos que
                    quieras reutilizar.
                  </div>
                )}
              </div>
            </section>
            <section className="backlog-section presets-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">PRESETS REUTILIZABLES</span>
                  <h2>Procesos listos para arrancar</h2>
                </div>
                <span>{workspaceTemplates.length} presets</span>
              </div>
              <div className="template-grid">
                {workspaceTemplates.map((template) => (
                  <article className="template-card" key={template.name}>
                    <span className={`template-icon ${template.color}`}>
                      {template.icon}
                    </span>
                    <div>
                      <h3>{template.name}</h3>
                      <p>{template.description}</p>
                      <span>{template.steps} pasos incluidos</span>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setView("board");
                        openTaskCreator("todo", {
                          title: template.name,
                          description: template.description,
                          steps: template.stepTitles.join("\n"),
                        });
                      }}
                    >
                      Crear to-do
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
        {view === "team" && (
          <div className="content simple-view people-view">
            <span className="eyebrow">TU ORGANIZACIÓN</span>
            <div className="simple-head">
              <div>
                <h1>Personas y áreas</h1>
                <p>
                  Busca a cualquier persona para revisar su actividad reciente y
                  las tareas que tiene asignadas.
                </p>
              </div>
              <div className="profile-actions">
                <label
                  className={`secondary-button avatar-upload ${avatarBusy ? "busy" : ""}`}
                >
                  {avatarBusy ? <Loader2 size={18} /> : <Camera size={18} />}
                  {avatarBusy ? "Subiendo…" : "Cambiar mi foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void uploadAvatar(event)}
                    disabled={avatarBusy}
                  />
                </label>
                <button
                  className="primary-button"
                  onClick={() => void shareProject()}
                >
                  <Copy size={18} />
                  Compartir acceso
                </button>
              </div>
            </div>
            <label className="people-search">
              <Search size={18} />
              <input
                value={teamSearch}
                onChange={(event) => setTeamSearch(event.target.value)}
                placeholder="Buscar por nombre, correo o área…"
              />
              <span>{filteredDirectory.length} personas</span>
            </label>
            <div className="people-grid">
              {filteredDirectory.map((person) => {
                const latest = activityEvents.find(
                  (event) => event.actor_id === person.id,
                );
                const assigned = tasks.filter(
                  (task) =>
                    task.assignees.includes(person.id) &&
                    task.status !== "done",
                ).length;
                return (
                  <button
                    className="person-card"
                    key={person.id}
                    onClick={() => setSelectedPerson(person)}
                  >
                    <Avatar id={person.id} person={person} />
                    <div>
                      <h3>{person.full_name}</h3>
                      <p>{person.email}</p>
                      <span>{person.areas?.name || "Sin área"}</span>
                      <small>
                        {assigned} tareas activas ·{" "}
                        {relativeTime(latest?.created_at)}
                      </small>
                    </div>
                    <ChevronDown size={18} />
                  </button>
                );
              })}
              {filteredDirectory.length === 0 && (
                <div className="empty-row">
                  No encontramos personas con esa búsqueda.
                </div>
              )}
            </div>
            <div className="area-list">
              <h2>Áreas</h2>
              {[
                "Dirección",
                "Operaciones",
                "Comercial",
                "Marketing",
                "Producto",
                "Administración",
              ].map((area, index) => (
                <div key={area}>
                  <i
                    style={{
                      background: [
                        "#327B9F",
                        "#20355A",
                        "#C6932C",
                        "#6D706F",
                        "#2E7D5B",
                        "#B66C12",
                      ][index],
                    }}
                  />
                  <span>{area}</span>
                  <strong>
                    {
                      directory.filter((person) => person.areas?.name === area)
                        .length
                    }{" "}
                    personas
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
        {view === "home" && (
          <div className="content simple-view home-view">
            <section className="home-hero">
              <div>
                <span className="eyebrow">
                  BUEN DÍA, {firstName.toUpperCase()}
                </span>
                <h1>Tu trabajo, con calma y claridad.</h1>
                <p>Un vistazo rápido a lo que mueve hoy a Spartanblue.</p>
                <button
                  className="primary-button"
                  onClick={() => setView("mytasks")}
                >
                  <ListChecks size={17} />
                  Abrir mis to-dos
                </button>
              </div>
              <div className="home-date">
                <span>HOY</span>
                <strong suppressHydrationWarning>
                  {new Date().toLocaleDateString("es-MX", { day: "2-digit" })}
                </strong>
                <small suppressHydrationWarning>
                  {new Date().toLocaleDateString("es-MX", {
                    month: "long",
                    year: "numeric",
                  })}
                </small>
              </div>
            </section>
            <section className="home-project-board">
              <div className="home-project-heading">
                <div>
                  <span className="eyebrow">ESPACIOS DE TRABAJO</span>
                  <h2>Tus proyectos</h2>
                  <p>Entra directo al proyecto que necesitas.</p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => setProjectModal(true)}
                >
                  <Plus size={17} />
                  Nuevo proyecto
                </button>
              </div>
              <div className="home-project-grid">
                {regularProjects.map((projectCard) => {
                  const assignedIds = workspaceTasks
                    .filter((task) => task.projectId === projectCard.id)
                    .flatMap((task) => task.assignees);
                  const cardMemberIds = new Set([
                    ...(workspaceMemberIdsByProject[projectCard.id] || []),
                    ...assignedIds,
                    ...(projectCard.owner_id ? [projectCard.owner_id] : []),
                  ]);
                  const cardPeople = directory.filter((person) =>
                    cardMemberIds.has(person.id),
                  );
                  return (
                    <Link
                      href={projectHref(projectCard.id)}
                      className="home-project-card"
                      key={projectCard.id}
                      title="Clic derecho o Ctrl/Cmd + clic para abrir en otra pestaña"
                      onClick={(event) => {
                        if (!shouldHandleInternalLink(event)) return;
                        event.preventDefault();
                        void switchProject(projectCard);
                      }}
                    >
                      <span
                        className="home-project-accent"
                        style={{ background: projectCard.color }}
                      />
                      {projectCard.image_url && (
                        <span className="home-project-cover">
                          <Image
                            src={projectCard.image_url}
                            alt=""
                            fill
                            sizes="(max-width: 780px) 100vw, 280px"
                            unoptimized={projectCard.image_url.startsWith(
                              "blob:",
                            )}
                          />
                        </span>
                      )}
                      <span className="home-project-card-head">
                        <strong>{projectCard.name}</strong>
                        <Pin size={15} aria-hidden="true" />
                      </span>
                      <span className="home-project-description">
                        {projectCard.description ||
                          "Tareas, conversaciones y archivos del proyecto."}
                      </span>
                      <span className="home-project-card-foot">
                        <span className="home-project-people">
                          {cardPeople.slice(0, 6).map((person) => (
                            <Avatar
                              id={person.id}
                              person={person}
                              key={person.id}
                              small
                            />
                          ))}
                          {cardPeople.length > 6 && (
                            <small>+{cardPeople.length - 6}</small>
                          )}
                          {cardPeople.length === 0 && (
                            <small>Equipo del proyecto</small>
                          )}
                        </span>
                        <span className="home-project-open">Abrir</span>
                      </span>
                    </Link>
                  );
                })}
                {regularProjects.length === 0 && (
                  <button
                    type="button"
                    className="home-project-card home-project-empty"
                    onClick={() => setProjectModal(true)}
                  >
                    <Plus size={24} />
                    <strong>Crea tu primer proyecto</strong>
                    <span>Organiza aquí el siguiente trabajo del equipo.</span>
                  </button>
                )}
              </div>
              {ticketProject && (
                <article className="home-ticket-space">
                  <span className="ticket-space-icon">
                    <TicketCheck size={24} />
                  </span>
                  <div>
                    <span className="ticket-space-label">
                      <ShieldCheck size={15} /> ESPACIO PROTEGIDO
                    </span>
                    <h3>{ticketProject.name}</h3>
                    <p>
                      Recibe las solicitudes nuevas sin mezclarlas con los demás
                      proyectos.
                    </p>
                  </div>
                  <span className="ticket-space-count">
                    <strong>{ticketInboxCount}</strong>
                    <small>sin asignar</small>
                  </span>
                  <Link
                    className="primary-button"
                    href={projectHref(ticketProject.id)}
                    title="Clic derecho o Ctrl/Cmd + clic para abrir en otra pestaña"
                    onClick={(event) => {
                      if (!shouldHandleInternalLink(event)) return;
                      event.preventDefault();
                      void switchProject(ticketProject);
                    }}
                  >
                    Abrir mesa
                  </Link>
                  <a
                    className="secondary-button"
                    href={TICKET_ADMIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={16} /> Panel
                  </a>
                </article>
              )}
            </section>
            <div className="home-metrics">
              <article>
                <span className="metric-icon blue">
                  <Target size={19} />
                </span>
                <div>
                  <strong>{myWorkspaceTasks.length}</strong>
                  <small>Tareas activas</small>
                </div>
              </article>
              <article>
                <span className="metric-icon red">
                  <Flag size={19} />
                </span>
                <div>
                  <strong>
                    {
                      myWorkspaceTasks.filter(
                        (task) => task.priority === "urgent",
                      ).length
                    }
                  </strong>
                  <small>Necesitan atención</small>
                </div>
              </article>
              <article>
                <span className="metric-icon graphite">
                  <Users size={19} />
                </span>
                <div>
                  <strong>{workspacePeople.length || people.length}</strong>
                  <small>Personas conectadas</small>
                </div>
              </article>
            </div>
            <div className="home-grid">
              <section>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">TU ENFOQUE</span>
                    <h2>Lo siguiente</h2>
                  </div>
                  <button onClick={() => setView("mytasks")}>Ver todo</button>
                </div>
                <div className="focus-list">
                  {orderedMyWorkspaceTasks.slice(0, 7).map((task) => (
                    <button
                      key={task.id}
                      className={
                        bubbleTaskIds.includes(task.id)
                          ? "bubbled-task"
                          : undefined
                      }
                      onClick={() => void openWorkspaceTask(task)}
                    >
                      <span className={`priority priority-${task.priority}`} />
                      <span>
                        <strong>{task.title}</strong>
                        <small>
                          {task.projectName} · {dueLabel(task.due)}
                        </small>
                      </span>
                      <span
                        className={`status-pill ${statusToneClass(task.status)}`}
                      >
                        {
                          columns.find((column) => column.key === task.status)
                            ?.label
                        }
                      </span>
                    </button>
                  ))}
                  {!workspaceTasksLoading && myWorkspaceTasks.length === 0 && (
                    <div className="empty-row">
                      No tienes tareas pendientes asignadas.
                    </div>
                  )}
                  {workspaceTasksLoading && (
                    <div className="empty-row">Cargando pendientes…</div>
                  )}
                </div>
              </section>
              <aside className="home-pulse">
                <span className="eyebrow">PULSO DEL EQUIPO</span>
                <h2>{progress}% completado</h2>
                <p>
                  El avance se actualiza conforme el equipo cierra sus to-dos.
                </p>
                <div className="pulse-bar">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="pulse-people">
                  {directory.slice(0, 6).map((person) => (
                    <Avatar id={person.id} person={person} key={person.id} />
                  ))}
                </div>
                <button onClick={() => setView("team")}>
                  Ver al equipo <ChevronDown size={14} />
                </button>
              </aside>
            </div>
          </div>
        )}
        {view === "settings" && (
          <div className="content simple-view settings-view">
            <div className="settings-heading">
              <span className="eyebrow">PREFERENCIAS</span>
              <h1>Configuración</h1>
              <p>Personaliza cómo se ve y cómo te avisa tu workspace.</p>
            </div>
            <section className="settings-card">
              <div className="settings-card-title">
                <span className="settings-card-icon report-profile">
                  <FileDown size={21} />
                </span>
                <div>
                  <h2>Datos para reportes semanales</h2>
                  <p>
                    Se guardan en tu perfil y se rellenan automáticamente en
                    cada PDF.
                  </p>
                </div>
              </div>
              <form
                className="report-profile-form"
                onSubmit={saveReportProfile}
              >
                <label>
                  <span>Responsable</span>
                  <input
                    value={currentPerson?.full_name || displayName}
                    readOnly
                  />
                </label>
                <label>
                  <span>Área / departamento</span>
                  <input
                    value={currentPerson?.areas?.name || "Sin área"}
                    readOnly
                  />
                </label>
                <label>
                  <span>Correo</span>
                  <input
                    value={currentPerson?.email || session?.user.email || ""}
                    readOnly
                  />
                </label>
                <label>
                  <span>Teléfono</span>
                  <input
                    type="tel"
                    value={reportPhoneDraft}
                    maxLength={50}
                    autoComplete="tel"
                    placeholder="Ej. +52 442 000 0000"
                    onChange={(event) =>
                      setReportPhoneDraft(event.target.value)
                    }
                  />
                </label>
                <div className="report-profile-actions">
                  <small>
                    Nombre, correo y área provienen de tu perfil del Workspace.
                  </small>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={reportProfileBusy}
                  >
                    {reportProfileBusy ? (
                      <Loader2 className="spin" size={17} />
                    ) : (
                      <Check size={17} />
                    )}
                    {reportProfileBusy ? "Guardando…" : "Guardar datos"}
                  </button>
                </div>
              </form>
            </section>
            <section className="settings-card">
              <div className="settings-card-title">
                <span className="settings-card-icon">
                  {darkMode ? <Moon size={21} /> : <Sun size={21} />}
                </span>
                <div>
                  <h2>Apariencia</h2>
                  <p>Elige el tema que te resulte más cómodo para trabajar.</p>
                </div>
              </div>
              <button
                type="button"
                className="settings-switch-row"
                role="switch"
                aria-checked={darkMode}
                onClick={() => setDarkMode((current) => !current)}
              >
                <span>
                  <strong>Modo oscuro</strong>
                  <small>
                    {darkMode
                      ? "Activado en este navegador"
                      : "Usar el tema claro de Spartanblue"}
                  </small>
                </span>
                <span className={`toggle-switch ${darkMode ? "active" : ""}`}>
                  <i />
                </span>
              </button>
            </section>
            <section className="settings-card">
              <div className="settings-card-title">
                <span className="settings-card-icon notification">
                  <BellRing size={21} />
                </span>
                <div>
                  <h2>Notificaciones del escritorio</h2>
                  <p>Recibe avisos aunque estés trabajando en otra pestaña.</p>
                </div>
              </div>
              <div className="settings-action-row">
                <span>
                  <strong>
                    {desktopPermission === "granted"
                      ? "Notificaciones activadas"
                      : "Notificaciones desactivadas"}
                  </strong>
                  <small>
                    {desktopPermission === "denied"
                      ? "El navegador las bloqueó; puedes cambiarlo desde sus permisos."
                      : "Te avisaremos de asignaciones, menciones y cambios importantes."}
                  </small>
                </span>
                {desktopPermission !== "granted" &&
                  desktopPermission !== "unsupported" && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void enableDesktopNotifications()}
                    >
                      <Bell size={17} /> Activar
                    </button>
                  )}
              </div>
            </section>
          </div>
        )}
        {(view === "mytasks" || view === "archive") && (
          <div className="content simple-view">
            <div className="mytasks-heading">
              <div>
                <span className="eyebrow">
                  {view === "archive" ? "HISTORIAL" : "ENFOQUE PERSONAL"}
                </span>
                <h1>
                  {view === "archive" ? "Proyectos archivados" : "Mis tareas"}
                </h1>
                <p>
                  {view === "archive"
                    ? "Aquí aparecerá el trabajo cerrado que decidas conservar."
                    : "Estas son las tareas que requieren tu atención."}
                </p>
              </div>
            </div>
            <div
              className={`focus-list ${
                view === "mytasks" ? "mytasks-focus-list" : ""
              }`}
            >
              {view === "archive" ? (
                archivedProjects.length ? (
                  <div className="archived-project-grid">
                    {archivedProjects.map((archivedProject) => (
                      <article
                        className="archived-project-card"
                        key={archivedProject.id}
                      >
                        <span
                          className="archived-project-color"
                          style={{ background: archivedProject.color }}
                        />
                        {archivedProject.image_url && (
                          <div className="archived-project-image">
                            <Image
                              src={archivedProject.image_url}
                              alt=""
                              fill
                              sizes="200px"
                              unoptimized={archivedProject.image_url.startsWith(
                                "blob:",
                              )}
                            />
                          </div>
                        )}
                        <div>
                          <strong>{archivedProject.name}</strong>
                          <small>
                            {archivedProject.description || "Sin descripción"}
                          </small>
                        </div>
                        <div className="archived-project-actions">
                          <button
                            className="secondary-button"
                            disabled={projectBusy}
                            onClick={() => void restoreProject(archivedProject)}
                          >
                            <MoveRight size={15} /> Restaurar
                          </button>
                          {(demo ||
                            archivedProject.owner_id === session?.user.id) &&
                            !isTicketProject(archivedProject) && (
                              <button
                                className="icon-button archive-delete"
                                aria-label={`Eliminar ${archivedProject.name}`}
                                onClick={() => {
                                  setProjectDeleteConfirmation("");
                                  setProjectToDelete(archivedProject);
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-row">
                    Todavía no hay proyectos archivados.
                  </div>
                )
              ) : (
                <div className="mytasks-sections">
                  <section
                    className={`bubble-up-section ${
                      draggedBubbleTaskId ? "is-reordering" : ""
                    }`}
                    onDragOver={(event) => {
                      if (!draggedBubbleTaskId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setBubbleDropTargetId(null);
                    }}
                    onDrop={(event) => dropBubbleTask(event)}
                  >
                    <header className="bubble-up-heading">
                      <div>
                        <span className="bubble-up-title">
                          <ArrowUp size={18} strokeWidth={2.4} /> Bubble up
                        </span>
                        <small>
                          Tus siguientes tareas, en el orden que tú decidas.
                        </small>
                      </div>
                      <span className="bubble-up-count">
                        {bubbleTasks.length}
                      </span>
                    </header>
                    {bubbleTasks.length ? (
                      <div className="bubble-up-list">
                        {bubbleTasks.map((task, taskIndex) => (
                          <div
                            key={task.id}
                            className={`my-task-list-row bubbled-task ${
                              draggedBubbleTaskId === task.id
                                ? "is-dragging"
                                : ""
                            } ${
                              bubbleDropTargetId === task.id
                                ? "is-drop-target"
                                : ""
                            }`}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", task.id);
                              setDraggedBubbleTaskId(task.id);
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              event.dataTransfer.dropEffect = "move";
                              setBubbleDropTargetId(task.id);
                            }}
                            onDrop={(event) => dropBubbleTask(event, task.id)}
                            onDragEnd={() => {
                              setDraggedBubbleTaskId(null);
                              setBubbleDropTargetId(null);
                            }}
                          >
                            <span
                              className="bubble-task-rank"
                              aria-label={`Posición ${taskIndex + 1}`}
                            >
                              {taskIndex + 1}
                            </span>
                            <button
                              type="button"
                              className="my-task-open"
                              onClick={() => void openWorkspaceTask(task)}
                            >
                              <span className="bubble-task-copy">
                                <strong>{task.title}</strong>
                                <span className="bubble-task-meta">
                                  <small>
                                    {task.due
                                      ? dueLabel(task.due)
                                      : "Sin fecha"}
                                  </small>
                                  {task.status === "review" && (
                                    <span className="bubble-review-mark">
                                      En revisión
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                            <span
                              className="bubble-drag-handle"
                              title="Arrastra para cambiar el orden"
                              aria-hidden="true"
                            >
                              <GripVertical size={18} />
                            </span>
                            <button
                              type="button"
                              className="bubble-task-button active"
                              aria-label={`Quitar “${task.title}” de Bubble up`}
                              title="Quitar de Bubble up"
                              onClick={() => toggleBubbleTask(task.id)}
                            >
                              <ArrowUp size={18} strokeWidth={2.4} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bubble-up-empty">
                        Pulsa la flecha de una tarea para agregarla aquí.
                      </div>
                    )}
                  </section>

                  <section className="mytasks-queue-section">
                    <header className="mytasks-queue-heading">
                      <strong>Resto de mis tareas</strong>
                      <small>
                        En revisión se mantiene al final, salvo que la subas a
                        Bubble up.
                      </small>
                    </header>
                    <div className="mytasks-queue-list">
                      {orderedRegularMyWorkspaceTasks.map((task) => (
                        <div key={task.id} className="my-task-list-row">
                          <button
                            type="button"
                            className="my-task-open"
                            onClick={() => void openWorkspaceTask(task)}
                          >
                            <span
                              className={`priority priority-${task.priority}`}
                            />
                            <span>
                              <strong>{task.title}</strong>
                              <small>
                                {task.projectName} · {dueLabel(task.due)}
                              </small>
                            </span>
                            <span
                              className={`status-pill ${statusToneClass(task.status)}`}
                            >
                              {
                                columns.find(
                                  (column) => column.key === task.status,
                                )?.label
                              }
                            </span>
                          </button>
                          <button
                            type="button"
                            className="bubble-task-button"
                            aria-label={`Agregar “${task.title}” a Bubble up`}
                            title="Agregar a Bubble up"
                            onClick={() => toggleBubbleTask(task.id)}
                          >
                            <ArrowUp size={18} strokeWidth={2.4} />
                          </button>
                        </div>
                      ))}
                      {!orderedRegularMyWorkspaceTasks.length &&
                        bubbleTasks.length > 0 && (
                          <div className="empty-row">
                            Todas tus tareas están en Bubble up.
                          </div>
                        )}
                    </div>
                  </section>
                </div>
              )}
              {view === "mytasks" &&
                !workspaceTasksLoading &&
                myWorkspaceTasks.length === 0 && (
                  <div className="empty-row">
                    No tienes tareas pendientes asignadas en ningún proyecto.
                  </div>
                )}
              {view === "mytasks" && workspaceTasksLoading && (
                <div className="empty-row">Cargando tus tareas…</div>
              )}
            </div>
          </div>
        )}
      </section>

      {session &&
        !demo &&
        desktopPermission === "default" &&
        !desktopPromptDismissed && (
          <aside className="desktop-notification-prompt" aria-live="polite">
            <span className="desktop-prompt-icon">
              <Bell size={20} />
            </span>
            <div>
              <strong>Recibe avisos en tu escritorio</strong>
              <p>
                Entérate al momento cuando te asignen o mencionen en un to-do.
              </p>
            </div>
            <button className="secondary-button" onClick={dismissDesktopPrompt}>
              Ahora no
            </button>
            <button
              className="primary-button"
              onClick={() => void enableDesktopNotifications()}
            >
              Activar notificaciones
            </button>
          </aside>
        )}

      {notificationOpen && (
        <>
          <button
            className="drawer-backdrop"
            aria-label="Cerrar notificaciones"
            onClick={() => setNotificationOpen(false)}
          />
          <aside className="notification-drawer">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">ACTIVIDAD</span>
                <h2>Notificaciones</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setNotificationOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="notification-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={notificationTab === "new"}
                className={notificationTab === "new" ? "active" : ""}
                onClick={() => setNotificationTab("new")}
              >
                Nuevas <span>{newNotificationsCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={notificationTab === "mentions"}
                className={notificationTab === "mentions" ? "active" : ""}
                onClick={() => setNotificationTab("mentions")}
              >
                Menciones <span>{mentionNotificationsCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={notificationTab === "read"}
                className={notificationTab === "read" ? "active" : ""}
                onClick={() => setNotificationTab("read")}
              >
                Leídas <span>{readNotificationsCount}</span>
              </button>
            </div>
            {((notificationTab === "new" && newNotificationsCount > 0) ||
              (notificationTab === "mentions" && unreadMentionsCount > 0)) && (
              <div className="drawer-tools">
                <button onClick={() => void markVisibleNotificationsRead()}>
                  <CheckCircle2 size={16} />
                  {notificationTab === "mentions"
                    ? "Marcar menciones como leídas"
                    : "Marcar todo como leído"}
                </button>
              </div>
            )}
            <div className="notification-list">
              {visibleNotifications.map((note) => (
                <button
                  key={note.id}
                  className={note.unread ? "unread" : ""}
                  aria-label={`Abrir notificación: ${note.task_title || note.title}`}
                  onClick={() => void openNotification(note)}
                >
                  <span className={`notification-icon type-${note.type}`}>
                    {note.type === "mention" ? (
                      "@"
                    ) : note.type === "due" ? (
                      <CalendarDays size={17} />
                    ) : note.type === "checkin" ? (
                      <CalendarClock size={17} />
                    ) : note.type === "announcement" ? (
                      <MessageSquareText size={17} />
                    ) : note.type === "status" ? (
                      <Check size={17} />
                    ) : (
                      <Bell size={17} />
                    )}
                  </span>
                  <span className="notification-copy">
                    <strong>{note.title}</strong>
                    {note.task_title && (
                      <span className="notification-origin">
                        <ListTodo size={14} />
                        <span>
                          <b>Tarea</b>
                          {note.task_title}
                        </span>
                      </span>
                    )}
                    {note.project_name && (
                      <span className="notification-project">
                        Proyecto · {note.project_name}
                      </span>
                    )}
                    {note.body && note.body !== note.task_title && (
                      <p>{note.body}</p>
                    )}
                    <small>
                      {note.time}
                      <span>
                        {note.task_id ? "Abrir tarea" : "Ver origen"}
                        <ChevronRight size={13} />
                      </span>
                    </small>
                  </span>
                  {note.unread && <i />}
                </button>
              ))}
              {visibleNotifications.length === 0 && (
                <div className="notification-empty">
                  {notificationTab === "new" ? (
                    <CheckCircle2 size={25} />
                  ) : notificationTab === "mentions" ? (
                    <span className="notification-empty-mention">@</span>
                  ) : (
                    <Bell size={25} />
                  )}
                  <strong>
                    {notificationTab === "new"
                      ? "Estás al día"
                      : notificationTab === "mentions"
                        ? "Todavía no hay menciones"
                        : "Todavía no hay notificaciones leídas"}
                  </strong>
                  <p>
                    {notificationTab === "new"
                      ? "Las notificaciones nuevas aparecerán aquí."
                      : notificationTab === "mentions"
                        ? "Cuando alguien te etiquete en un comentario, aparecerá aquí."
                        : "Cuando leas una notificación, se guardará en esta pestaña."}
                  </p>
                </div>
              )}
            </div>
            <div className="drawer-footer">
              <button
                className="drawer-signout"
                onClick={async () => {
                  if (supabase && session) await supabase.auth.signOut();
                  setDemo(false);
                  setNotificationOpen(false);
                }}
              >
                <LogOut size={17} />
                Cerrar sesión
              </button>
              {desktopPermission === "granted" ? (
                <span className="desktop-footer-status active">
                  <CheckCircle2 size={16} />
                  Escritorio activo
                </span>
              ) : desktopPermission === "unsupported" ? (
                <span className="desktop-footer-status">No disponible</span>
              ) : (
                <button
                  type="button"
                  className="desktop-footer-activate"
                  onClick={() => void enableDesktopNotifications()}
                >
                  <BellRing size={16} />
                  Activar escritorio
                </button>
              )}
            </div>
          </aside>
        </>
      )}

      {taskModal && (
        <div className="modal-layer task-creator-layer">
          <button
            className="modal-backdrop"
            aria-label="Cerrar"
            onClick={closeTaskCreator}
          />
          <form
            className="modal-card task-creator-fullscreen"
            onSubmit={createTask}
          >
            <header className="task-creator-topbar">
              <div>
                <span className="eyebrow">NUEVO TO-DO</span>
                <strong>
                  {projects.find((item) => item.id === newTaskProjectId)
                    ?.name ||
                    project ||
                    "Proyecto"}
                </strong>
              </div>
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={taskCreating}
                  onClick={closeTaskCreator}
                >
                  Cancelar
                </button>
                <button className="primary-button" disabled={taskCreating}>
                  {taskCreating ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <Check size={17} />
                  )}
                  {taskCreating ? "Creando…" : "Crear to-do"}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Cerrar creación del to-do"
                  disabled={taskCreating}
                  onClick={closeTaskCreator}
                >
                  <X size={22} />
                </button>
              </div>
            </header>

            <main className="task-creator-shell">
              <section className="task-editor-sheet">
                <div className="task-creator-title">
                  <span className="task-creator-check" aria-hidden="true">
                    <Circle size={31} />
                  </span>
                  <label>
                    <span>Título del to-do</span>
                    <input
                      className="task-title-input"
                      name="title"
                      defaultValue={templateSeed?.title || ""}
                      placeholder="¿Qué hay que hacer?"
                      required
                    />
                  </label>
                </div>

                <div className="task-project-target">
                  <Building2 size={19} aria-hidden="true" />
                  <span>
                    Este to-do se guardará en
                    <strong>
                      {projects.find((item) => item.id === newTaskProjectId)
                        ?.name ||
                        project ||
                        "el proyecto actual"}
                    </strong>
                  </span>
                </div>

                <div className="task-creator-meta">
                  <div className="task-creator-field-row creator-assignee-row">
                    <strong>Responsable</strong>
                    <div
                      className="create-assignee-field"
                      ref={newTaskAssigneeRef}
                    >
                      <div className="create-assignee-selected">
                        {newTaskAssignees.map((person) => (
                          <span key={person.id}>
                            <Avatar id={person.id} person={person} small />
                            {person.full_name}
                            <button
                              type="button"
                              aria-label={`Quitar a ${person.full_name}`}
                              onClick={() => toggleNewTaskAssignee(person.id)}
                            >
                              <X size={13} />
                            </button>
                          </span>
                        ))}
                        {newTaskAssignees.length === 0 && (
                          <span className="create-unassigned-state">
                            <UserRound size={16} />
                            Sin responsable
                          </span>
                        )}
                      </div>
                      <div className="create-assignee-search-box">
                        <Search size={18} aria-hidden="true" />
                        <input
                          id="new-task-assignee-search"
                          aria-label="Buscar responsable"
                          value={newTaskAssigneeSearch}
                          placeholder="Escribe un nombre, correo o área…"
                          autoComplete="off"
                          onFocus={() => setNewTaskAssigneeOpen(true)}
                          onChange={(event) => {
                            setNewTaskAssigneeSearch(event.target.value);
                            setNewTaskAssigneeOpen(true);
                          }}
                        />
                        {newTaskAssigneeIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewTaskAssigneeIds([]);
                              setNewTaskAssigneeSearch("");
                            }}
                          >
                            Dejar sin asignar
                          </button>
                        )}
                      </div>
                      {newTaskAssigneeOpen && (
                        <div
                          className="create-assignee-suggestions"
                          role="listbox"
                          aria-label="Personas del proyecto"
                        >
                          <small>PERSONAS DEL PROYECTO</small>
                          {newTaskAssigneeSuggestions.map((person) => (
                            <button
                              type="button"
                              role="option"
                              aria-selected="false"
                              key={person.id}
                              onClick={() => toggleNewTaskAssignee(person.id)}
                            >
                              <Avatar id={person.id} person={person} />
                              <span>
                                <strong>{person.full_name}</strong>
                                <small>
                                  {person.areas?.name || "Sin área"} ·{" "}
                                  {person.email}
                                </small>
                              </span>
                              <em>Asignar</em>
                            </button>
                          ))}
                          {newTaskAssigneeSuggestions.length === 0 && (
                            <p>
                              {projectMembers.length === 0
                                ? "Agrega personas al proyecto para poder asignarlas."
                                : "No hay más personas que coincidan con la búsqueda."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="task-creator-options">
                    <label>
                      Estado
                      <select name="status" defaultValue={newTaskStatus}>
                        <option value="backlog">Backlog</option>
                        {isTicketProject(
                          projects.find((item) => item.id === newTaskProjectId),
                        ) && <option value="unassigned">Sin asignar</option>}
                        <option value="todo">Por hacer</option>
                        <option value="in_progress">En curso</option>
                        <option value="review">En revisión</option>
                        <option value="done">Hecho</option>
                      </select>
                    </label>
                    <label>
                      Vencimiento
                      <input name="due" type="date" />
                    </label>
                    <label>
                      Prioridad
                      <select name="priority" defaultValue="medium">
                        <option value="low">Baja</option>
                        <option value="medium">Media</option>
                        <option value="high">Alta</option>
                        <option value="urgent">Urgente</option>
                      </select>
                    </label>
                    <label>
                      Etiqueta
                      <input name="label" placeholder="Ej. Diseño" />
                    </label>
                  </div>
                </div>

                <div className="task-creator-work-grid">
                  <section className="task-creator-notes">
                    <div>
                      <MessageSquareText size={20} />
                      <h3>Notas y contexto</h3>
                    </div>
                    <RichTextEditor
                      name="description"
                      defaultValue={templateSeed?.description || ""}
                      placeholder="Agrega contexto, instrucciones, resultados esperados o enlaces…"
                    />
                  </section>

                  <section className="task-creator-checklist">
                    <div className="task-creator-section-title">
                      <div>
                        <ListChecks size={21} />
                        <h3>Pasos</h3>
                      </div>
                      <span>
                        {newTaskSteps.filter((step) => step.trim()).length}{" "}
                        pasos
                      </span>
                    </div>
                    <p>
                      Divide el trabajo en pasos claros. Puedes ver y corregir
                      cada uno antes de crear el to-do.
                    </p>
                    <div className="task-step-editor-list">
                      {newTaskSteps.map((step, index) => (
                        <div className="task-step-editor-row" key={index}>
                          <Circle size={21} aria-hidden="true" />
                          <input
                            aria-label={`Paso ${index + 1}`}
                            value={step}
                            placeholder={`Escribe el paso ${index + 1}`}
                            onChange={(event) =>
                              updateNewTaskStep(index, event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              addNewTaskStep(index);
                            }}
                          />
                          <button
                            type="button"
                            aria-label={`Quitar paso ${index + 1}`}
                            onClick={() => removeNewTaskStep(index)}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="add-step-button"
                      onClick={() => addNewTaskStep()}
                    >
                      <Plus size={17} />
                      Agregar otro paso
                    </button>
                  </section>
                </div>
              </section>

              <section className="task-creator-discussion">
                <div className="task-creator-section-title">
                  <div>
                    <MessageCircle size={22} />
                    <h2>Conversación</h2>
                  </div>
                </div>
                <div>
                  <Avatar id={currentAssigneeId} person={currentPerson} />
                  <p>
                    Al crear el to-do se abrirá en esta misma vista para que
                    puedas editarlo, comentar y mencionar personas de inmediato.
                  </p>
                </div>
              </section>

              <div className="task-creator-bottom-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={taskCreating}
                  onClick={closeTaskCreator}
                >
                  Descartar
                </button>
                <button className="primary-button" disabled={taskCreating}>
                  {taskCreating ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <Check size={17} />
                  )}
                  {taskCreating ? "Creando…" : "Crear y abrir to-do"}
                </button>
              </div>
            </main>
          </form>
        </div>
      )}

      {projectModal && (
        <div className="modal-layer">
          <button
            className="modal-backdrop"
            aria-label="Cerrar"
            onClick={() => setProjectModal(false)}
          />
          <form className="modal-card" onSubmit={createProject}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">NUEVO PROYECTO</span>
                <h2>Abre un nuevo espacio</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setProjectModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <label>
              Nombre
              <input
                name="name"
                placeholder="Ej. Expansión Alemania"
                required
              />
            </label>
            <label>
              Descripción
              <textarea
                name="description"
                placeholder="¿Qué resultado busca este proyecto?"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setProjectModal(false)}
              >
                Cancelar
              </button>
              <button className="primary-button" disabled={projectBusy}>
                {projectBusy ? (
                  <>
                    <Loader2 className="spin" size={16} /> Creando…
                  </>
                ) : (
                  "Crear proyecto"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {projectMemberModal && activeProject && (
        <div className="modal-layer">
          <button
            className="modal-backdrop"
            aria-label="Cerrar personas del proyecto"
            onClick={() => {
              setProjectMemberModal(false);
              setProjectMemberSearch("");
            }}
          />
          <div className="modal-card project-members-modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">EQUIPO DEL PROYECTO</span>
                <h2>Agregar personas</h2>
                <p>
                  Busca por nombre, correo o área y elige a la persona correcta.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar"
                onClick={() => {
                  setProjectMemberModal(false);
                  setProjectMemberSearch("");
                }}
              >
                <X size={20} />
              </button>
            </div>

            <label htmlFor="project-member-search">Buscar persona</label>
            <div className="project-member-search-box">
              <Search size={18} aria-hidden="true" />
              <input
                id="project-member-search"
                value={projectMemberSearch}
                onChange={(event) => setProjectMemberSearch(event.target.value)}
                placeholder="Escribe un nombre, correo o área…"
                autoComplete="off"
              />
            </div>

            <section className="project-member-section">
              <div className="project-member-section-title">
                <span>EN ESTE PROYECTO</span>
                <strong>{projectMembers.length}</strong>
              </div>
              <div className="project-member-chips">
                {projectMembers.map((person) => (
                  <span key={person.id}>
                    <Avatar id={person.id} person={person} small />
                    {person.full_name}
                    <Check size={14} aria-label="Miembro" />
                  </span>
                ))}
                {projectMembers.length === 0 && (
                  <p>Todavía no hay personas visibles en este proyecto.</p>
                )}
              </div>
            </section>

            <section className="project-member-section">
              <div className="project-member-section-title">
                <span>PERSONAS REGISTRADAS</span>
                <small>Selecciona para agregar</small>
              </div>
              <div className="project-member-results" role="listbox">
                {projectMemberSuggestions.map((person) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    key={person.id}
                    disabled={Boolean(projectMemberBusy)}
                    onClick={() => void addPersonToProject(person)}
                  >
                    <Avatar id={person.id} person={person} />
                    <span>
                      <strong>{person.full_name}</strong>
                      <small>
                        {person.areas?.name || "Sin área"} · {person.email}
                      </small>
                    </span>
                    {projectMemberBusy === person.id ? (
                      <Loader2 className="spin" size={17} />
                    ) : (
                      <em>Agregar</em>
                    )}
                  </button>
                ))}
                {projectMemberSuggestions.length === 0 && (
                  <p>
                    {normalizedProjectMemberSearch
                      ? "No encontramos personas que coincidan con la búsqueda."
                      : "Todas las personas registradas ya están en este proyecto."}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {projectEditModal && activeProject && (
        <div className="modal-layer">
          <button
            className="modal-backdrop"
            aria-label="Cerrar edición del proyecto"
            onClick={() => setProjectEditModal(false)}
          />
          <form className="modal-card project-editor" onSubmit={saveProject}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">PERSONALIZAR PROYECTO</span>
                <h2>Hazlo reconocible para tu equipo</h2>
                <p>Cambia su nombre, descripción, color y portada.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setProjectEditModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <label>
              Nombre
              <input
                name="name"
                defaultValue={activeProject.name}
                disabled={isTicketProject(activeProject)}
                required
              />
            </label>
            {isTicketProject(activeProject) && (
              <p className="protected-project-note">
                <ShieldCheck size={17} />
                El nombre, archivo y eliminación de Mesa de Tickets están
                bloqueados para proteger la integración. Sí puedes cambiar su
                descripción, color y portada.
              </p>
            )}
            <label>
              Descripción
              <textarea
                name="description"
                defaultValue={activeProject.description || ""}
                placeholder="¿Qué resultado busca este proyecto?"
              />
            </label>
            <fieldset className="project-color-field">
              <legend>Color del proyecto</legend>
              <div className="project-color-options">
                {projectColors.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={projectDraftColor === color ? "selected" : ""}
                    aria-label={`Usar color ${color}`}
                    aria-pressed={projectDraftColor === color}
                    style={{ background: color }}
                    onClick={() => setProjectDraftColor(color)}
                  >
                    {projectDraftColor === color && <Check size={16} />}
                  </button>
                ))}
                <label className="custom-color" title="Elegir otro color">
                  <input
                    type="color"
                    value={projectDraftColor}
                    onChange={(event) =>
                      setProjectDraftColor(event.target.value)
                    }
                  />
                  <SlidersHorizontal size={17} />
                </label>
              </div>
            </fieldset>
            <div className="project-photo-field">
              <div>
                <strong>Foto de portada</strong>
                <small>JPG, PNG o WebP · máximo 50 MB</small>
              </div>
              {!removeProjectImage &&
                activeProject.image_url &&
                !projectImageFile && (
                  <div className="project-photo-preview">
                    <Image
                      src={activeProject.image_url}
                      alt="Portada actual"
                      fill
                      sizes="100px"
                    />
                  </div>
                )}
              <label className="secondary-button project-photo-picker">
                <Camera size={16} />
                {projectImageFile ? projectImageFile.name : "Elegir foto"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (
                      file &&
                      (!PHOTO_MIME_TYPES.includes(file.type) ||
                        file.size > MAX_PHOTO_BYTES)
                    ) {
                      event.target.value = "";
                      setProjectImageFile(null);
                      flash(
                        "La foto debe ser JPG, PNG o WebP y pesar máximo 50 MB.",
                      );
                      return;
                    }
                    setProjectImageFile(file);
                    setRemoveProjectImage(false);
                  }}
                />
              </label>
              {activeProject.image_url && !removeProjectImage && (
                <button
                  type="button"
                  className="remove-project-photo"
                  onClick={() => {
                    setProjectImageFile(null);
                    setRemoveProjectImage(true);
                  }}
                >
                  Quitar foto
                </button>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={projectBusy}
                onClick={() => setProjectEditModal(false)}
              >
                Cancelar
              </button>
              <button className="primary-button" disabled={projectBusy}>
                {projectBusy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {templateModal && (
        <div className="modal-layer">
          <button
            className="modal-backdrop"
            aria-label="Cerrar"
            onClick={() => setTemplateModal(false)}
          />
          <form className="modal-card" onSubmit={createTemplate}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">NUEVA PLANTILLA</span>
                <h2>Guarda una forma de trabajar</h2>
                <p>
                  Después podrás convertirla en un to-do con todos sus pasos.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setTemplateModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <label>
              Nombre
              <input name="name" placeholder="Ej. Alta de proveedor" required />
            </label>
            <label>
              Descripción
              <textarea
                name="description"
                placeholder="¿Cuándo conviene usar este proceso?"
              />
            </label>
            <label>
              Pasos <small>uno por línea</small>
              <textarea
                name="steps"
                placeholder={
                  "Solicitar documentos\nValidar información\nDar de alta"
                }
                required
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTemplateModal(false)}
              >
                Cancelar
              </button>
              <button className="primary-button">
                <Plus size={16} />
                Guardar plantilla
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedPerson && (
        <div className="modal-layer">
          <button
            className="modal-backdrop"
            aria-label="Cerrar perfil"
            onClick={() => setSelectedPerson(null)}
          />
          <div className="person-detail">
            <div className="modal-head">
              <div className="person-identity">
                <Avatar id={selectedPerson.id} person={selectedPerson} />
                <div>
                  <span className="eyebrow">
                    {selectedPerson.areas?.name || "SIN ÁREA"}
                  </span>
                  <h2>{selectedPerson.full_name}</h2>
                  <p>{selectedPerson.email}</p>
                </div>
              </div>
              <div className="person-head-actions">
                <button
                  className="secondary-button person-report-button"
                  disabled={weeklyReportBusy !== null}
                  onClick={() => void generateWeeklyReport(selectedPerson)}
                >
                  {weeklyReportBusy === selectedPerson.id ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <FileDown size={18} />
                  )}
                  {weeklyReportBusy === selectedPerson.id
                    ? "Generando…"
                    : "Generar reporte semanal"}
                </button>
                <button
                  className="icon-button"
                  aria-label="Cerrar perfil"
                  onClick={() => {
                    setSelectedPerson(null);
                    setWeeklyReportMessage("");
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            {weeklyReportMessage && (
              <p
                className="person-report-message"
                role="status"
                aria-live="polite"
              >
                {weeklyReportMessage}
              </p>
            )}
            <div className="person-stats">
              <span>
                <strong>
                  {
                    selectedPersonTasks.filter(
                      (task) =>
                        task.status !== "done" && task.status !== "backlog",
                    ).length
                  }
                </strong>
                <small>tareas activas</small>
              </span>
              <span>
                <strong>
                  {
                    selectedPersonTasks.filter((task) => task.status === "done")
                      .length
                  }
                </strong>
                <small>terminadas</small>
              </span>
              <span>
                <strong>{selectedPersonActivity.length}</strong>
                <small>movimientos</small>
              </span>
            </div>
            <div className="person-detail-grid">
              <section>
                <div className="detail-title">
                  <h3>Tareas asignadas</h3>
                  <span>
                    {
                      selectedPersonTasks.filter(
                        (task) => task.status !== "backlog",
                      ).length
                    }
                  </span>
                </div>
                <div className="person-task-list">
                  {selectedPersonTasks
                    .filter((task) => task.status !== "backlog")
                    .map((task) => (
                      <button
                        key={task.id}
                        onClick={() => {
                          setSelectedPerson(null);
                          void openWorkspaceTask(task);
                        }}
                      >
                        <span
                          className={`priority priority-${task.priority}`}
                        />
                        <span>
                          <strong>{task.title}</strong>
                          <small>
                            {task.projectName} ·{" "}
                            {
                              columns.find(
                                (column) => column.key === task.status,
                              )?.label
                            }{" "}
                            · {dueLabel(task.due)}
                          </small>
                        </span>
                      </button>
                    ))}
                  {selectedPersonTasks.every(
                    (task) => task.status === "backlog",
                  ) && (
                    <p className="empty-detail">
                      No tiene tareas visibles asignadas.
                    </p>
                  )}
                </div>
              </section>
              <section>
                <div className="detail-title">
                  <h3>Última actividad</h3>
                  <span>{selectedPersonActivity.length}</span>
                </div>
                <div className="activity-timeline">
                  {selectedPersonActivity.map((event) => (
                    <article key={event.id}>
                      <i />
                      <div>
                        <strong>{event.detail}</strong>
                        <small>{relativeTime(event.created_at)}</small>
                      </div>
                    </article>
                  ))}
                  {selectedPersonActivity.length === 0 && (
                    <p className="empty-detail">
                      Todavía no hay actividad registrada.
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {selectedTask && (
        <div
          className={`modal-layer ${taskDetailFullscreen ? "task-fullscreen-layer" : ""}`}
        >
          <button
            className="modal-backdrop"
            aria-label="Cerrar to-do"
            onClick={() => closeTaskDetail()}
          />
          <div
            className={`task-detail ${taskDetailFullscreen ? "fullscreen" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-detail-title"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">{project.toUpperCase()}</span>
                <h2 id="task-detail-title">{selectedTask.title}</h2>
                <p>Todo el contexto del to-do, en un solo lugar.</p>
              </div>
              <div className="task-detail-head-actions">
                {!taskEditing && (
                  <button
                    type="button"
                    className="edit-task-trigger"
                    onClick={beginTaskEditing}
                  >
                    <Pencil size={16} />
                    Editar
                  </button>
                )}
                <TaskActionMenu
                  task={selectedTask}
                  projects={projects}
                  activeProjectId={activeProjectId}
                  busy={taskActionBusy === selectedTask.id}
                  onOpen={() => undefined}
                  onMoveStatus={(status) =>
                    void moveTask(selectedTask.id, status)
                  }
                  onMoveProject={(projectId) =>
                    void moveTaskToProject(selectedTask, projectId)
                  }
                  onCopy={(projectId) =>
                    void duplicateTask(
                      selectedTask,
                      selectedTask.status,
                      projectId,
                    )
                  }
                  onShare={() => void shareTask(selectedTask)}
                  onDelete={() => setTaskToDelete(selectedTask)}
                />
                <a
                  className="icon-button task-new-tab"
                  href={taskHref(activeProjectId, selectedTask.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Abrir este to-do en otra pestaña"
                  title="Abrir en otra pestaña"
                >
                  <ExternalLink size={18} />
                </a>
                <button
                  type="button"
                  className="icon-button task-fullscreen-toggle"
                  aria-label={
                    taskDetailFullscreen
                      ? "Salir de pantalla completa"
                      : "Abrir en pantalla completa"
                  }
                  title={
                    taskDetailFullscreen
                      ? "Salir de pantalla completa"
                      : "Abrir en pantalla completa"
                  }
                  onClick={() => setTaskDetailFullscreen((current) => !current)}
                >
                  {taskDetailFullscreen ? (
                    <Minimize2 size={19} />
                  ) : (
                    <Maximize2 size={19} />
                  )}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Cerrar to-do"
                  title="Cerrar"
                  onClick={() => closeTaskDetail()}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="detail-section task-assignee-primary">
              <div className="detail-title">
                <h3>Responsable</h3>
                <span>{selectedTask.assignees.length}</span>
              </div>
              <div className="responsible-row">
                {selectedTask.assignees.map((id) => {
                  const responsible = directory.find(
                    (person) => person.id === id,
                  );
                  const responsibleName =
                    responsible?.full_name ||
                    (id === currentAssigneeId
                      ? displayName
                      : "Equipo Spartanblue");
                  return (
                    <span className="responsible-person" key={id}>
                      <Avatar id={id} person={responsible} />
                      <span>{responsibleName}</span>
                      <button
                        type="button"
                        className="unassign-person"
                        aria-label={`Desasignar a ${responsibleName}`}
                        title={`Desasignar a ${responsibleName}`}
                        disabled={assigneeBusy}
                        onClick={() => void unassignPerson(id)}
                      >
                        <X size={13} />
                        Quitar
                      </button>
                    </span>
                  );
                })}
                {selectedTask.assignees.length === 0 && (
                  <span className="responsible-empty">
                    <UserRound size={17} /> Sin asignar
                  </span>
                )}
                <div className="assignee-picker-wrap" ref={assigneePickerRef}>
                  <button
                    className="assign-trigger"
                    type="button"
                    aria-expanded={assigneePickerOpen}
                    onClick={() => {
                      setAssigneePickerOpen((current) => !current);
                      setAssigneeSearch("");
                    }}
                  >
                    <Plus size={16} />
                    Asignar persona
                  </button>
                  {assigneePickerOpen && (
                    <div className="assignee-picker">
                      <label htmlFor="assignee-search">
                        Buscar responsable
                      </label>
                      <div className="assignee-search-box">
                        <Search size={17} aria-hidden="true" />
                        <input
                          id="assignee-search"
                          value={assigneeSearch}
                          onChange={(event) =>
                            setAssigneeSearch(event.target.value)
                          }
                          placeholder="Escribe un nombre o área…"
                          autoComplete="off"
                        />
                      </div>
                      <small>
                        PERSONAS REGISTRADAS · TAMBIÉN PUEDES BUSCAR POR ÁREA
                      </small>
                      <div className="assignee-results" role="listbox">
                        {assigneeSuggestions.map((person) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected="false"
                            key={person.id}
                            disabled={assigneeBusy}
                            onClick={() => void assignPerson(person)}
                          >
                            <Avatar id={person.id} person={person} />
                            <span>
                              <strong>{person.full_name}</strong>
                              <small>
                                {person.areas?.name || "Sin área"} ·{" "}
                                {person.email}
                              </small>
                            </span>
                            <em>Asignar</em>
                          </button>
                        ))}
                        {assigneeSuggestions.length === 0 && (
                          <p>
                            No hay más personas que coincidan con la búsqueda.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {taskEditing ? (
              <form className="task-detail-editor" onSubmit={saveTaskDetails}>
                <div className="task-edit-heading">
                  <Circle size={29} aria-hidden="true" />
                  <label>
                    Título
                    <input
                      className="task-edit-title"
                      name="title"
                      defaultValue={selectedTask.title}
                      required
                    />
                  </label>
                </div>
                <div className="task-edit-body-grid">
                  <div className="task-edit-main">
                    <div className="task-edit-notes">
                      <span>Notas y contexto</span>
                      <RichTextEditor
                        name="description"
                        defaultValue={selectedTask.description}
                        placeholder="Agrega instrucciones, contexto o enlaces…"
                      />
                    </div>
                    <div className="task-edit-options">
                      <label>
                        Vencimiento
                        <input
                          type="date"
                          name="due"
                          defaultValue={
                            /^\d{4}-\d{2}-\d{2}$/.test(selectedTask.due)
                              ? selectedTask.due
                              : ""
                          }
                        />
                      </label>
                      <label>
                        Etiqueta
                        <input
                          name="label"
                          defaultValue={selectedTask.labels[0] || "General"}
                          placeholder="Ej. Diseño"
                        />
                      </label>
                    </div>
                  </div>
                  <section className="task-edit-checklist">
                    <div className="task-creator-section-title">
                      <div>
                        <ListChecks size={21} />
                        <h3>Steps / checklist</h3>
                      </div>
                      <span>
                        {
                          taskEditSteps.filter((step) => step.title.trim())
                            .length
                        }{" "}
                        pasos
                      </span>
                    </div>
                    <div className="task-step-editor-list">
                      {taskEditSteps.map((step, index) => (
                        <div
                          className="task-step-editor-row"
                          key={step.id || `new-step-${index}`}
                        >
                          {step.completed ? (
                            <CheckCircle2 className="step-done" size={21} />
                          ) : (
                            <Circle size={21} />
                          )}
                          <input
                            aria-label={`Editar paso ${index + 1}`}
                            value={step.title}
                            placeholder={`Escribe el paso ${index + 1}`}
                            onChange={(event) =>
                              updateTaskEditStep(index, event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              addTaskEditStep(index);
                            }}
                          />
                          <button
                            type="button"
                            aria-label={`Quitar paso ${index + 1}`}
                            onClick={() => removeTaskEditStep(index)}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="add-step-button"
                      onClick={() => addTaskEditStep()}
                    >
                      <Plus size={17} />
                      Agregar otro paso
                    </button>
                  </section>
                </div>
                <div className="task-edit-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={taskEditBusy}
                    onClick={cancelTaskEditing}
                  >
                    Descartar cambios
                  </button>
                  <button className="primary-button" disabled={taskEditBusy}>
                    {taskEditBusy ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                    {taskEditBusy ? "Guardando…" : "Guardar cambios"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="task-description">
                  <RichTextContent value={selectedTask.description} />
                </div>
                <div className="detail-chips">
                  <span>
                    <CalendarDays size={15} />
                    {dueLabel(selectedTask.due)}
                  </span>
                  <span>
                    <Tag size={15} />
                    {selectedTask.labels[0]}
                  </span>
                  <label
                    className={`status-select ${statusToneClass(selectedTask.status)}`}
                  >
                    <select
                      value={selectedTask.status}
                      onChange={(event) =>
                        void moveTask(
                          selectedTask.id,
                          event.target.value as Status,
                        )
                      }
                    >
                      {activeTaskStatusColumns.map((column) => (
                        <option value={column.key} key={column.key}>
                          {column.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedTask.externalUrl && (
                    <a
                      className="ticket-source-link"
                      href={selectedTask.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={15} />
                      Abrir en panel de tickets
                    </a>
                  )}
                </div>
              </>
            )}
            <div className="task-social-bar">
              <div className="task-reactions" aria-label="Reacciones del to-do">
                <div
                  className="reaction-picker-wrap"
                  ref={taskReactionPickerRef}
                >
                  <button
                    type="button"
                    className={`reaction-trigger ${currentTaskReaction ? "active" : ""}`}
                    aria-expanded={taskReactionPickerOpen}
                    aria-haspopup="menu"
                    disabled={taskSocialBusy}
                    onClick={() =>
                      setTaskReactionPickerOpen((current) => !current)
                    }
                  >
                    {taskSocialBusy ? (
                      <Loader2 className="spin" size={15} />
                    ) : currentTaskReaction ? (
                      <span className="selected-reaction" aria-hidden="true">
                        {currentTaskReaction.emoji}
                      </span>
                    ) : (
                      <SmilePlus size={16} />
                    )}
                    <span>{currentTaskReactionLabel || "Reaccionar"}</span>
                    {taskReactions.length > 0 && (
                      <span className="reaction-count">
                        {taskReactions.length}
                      </span>
                    )}
                    <ChevronDown className="reaction-chevron" size={14} />
                  </button>
                  {taskReactionPickerOpen && (
                    <div
                      className="reaction-picker"
                      role="menu"
                      aria-label="Elegir reacción"
                    >
                      {taskReactionOptions.map((option) => (
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={
                            currentTaskReaction?.emoji === option.emoji
                          }
                          className={
                            currentTaskReaction?.emoji === option.emoji
                              ? "selected"
                              : ""
                          }
                          key={option.emoji}
                          aria-label={option.label}
                          title={option.label}
                          onClick={() => void toggleTaskReaction(option.emoji)}
                        >
                          {option.emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className={taskFollowing ? "task-follow active" : "task-follow"}
                disabled={taskSocialBusy}
                onClick={() => void toggleTaskFollowing()}
              >
                <BellRing size={16} />
                {taskFollowing ? "Siguiendo" : "Seguir actualizaciones"}
              </button>
            </div>
            {!taskEditing && (
              <div className="detail-section">
                <div className="detail-title">
                  <h3>Checklist</h3>
                  <span>
                    {selectedTask.steps.filter((step) => step.completed).length}
                    /{selectedTask.steps.length}
                  </span>
                </div>
                {selectedTask.steps.map((step, index) => (
                  <button
                    className="step-row"
                    key={step.id || step.title}
                    onClick={() => void toggleChecklistStep(step, index)}
                  >
                    {step.completed ? (
                      <CheckCircle2 className="step-done" size={20} />
                    ) : (
                      <Circle size={20} />
                    )}
                    <span className={step.completed ? "completed" : ""}>
                      {step.title}
                    </span>
                  </button>
                ))}
                {selectedTask.steps.length === 0 && (
                  <p className="empty-detail">
                    Este to-do todavía no tiene pasos.
                  </p>
                )}
              </div>
            )}
            <div className="detail-section comment-section">
              <div className="detail-title">
                <h3>Conversación</h3>
                <span>{selectedTask.comments}</span>
              </div>
              <div className="comments-list">
                {commentsLoading && (
                  <div className="comments-loading" role="status">
                    <Loader2 className="spin" size={18} />
                    Cargando conversación…
                  </div>
                )}
                {commentsLoadError && !commentsLoading && (
                  <div className="comments-load-error" role="alert">
                    <p>{commentsLoadError}</p>
                    <button
                      type="button"
                      onClick={() => void loadTaskComments(selectedTask.id)}
                    >
                      Volver a intentar
                    </button>
                  </div>
                )}
                {!commentsLoading &&
                  !commentsLoadError &&
                  (commentsByTask[selectedTask.id] || []).map((comment) => {
                    const ownReaction = comment.reactions.find(
                      (reaction) => reaction.user_id === currentAssigneeId,
                    );
                    const ownReactionLabel = taskReactionOptions.find(
                      (option) => option.emoji === ownReaction?.emoji,
                    )?.label;
                    const groupedReactions = Object.entries(
                      comment.reactions.reduce<Record<string, number>>(
                        (grouped, reaction) => ({
                          ...grouped,
                          [reaction.emoji]: (grouped[reaction.emoji] || 0) + 1,
                        }),
                        {},
                      ),
                    );
                    const canDeleteComment =
                      demo ||
                      comment.author_id === currentAssigneeId ||
                      activeProject?.owner_id === session?.user.id;
                    return (
                      <article key={comment.id}>
                        <Avatar
                          id={comment.author_id || "jp"}
                          person={directory.find(
                            (person) => person.id === comment.author_id,
                          )}
                        />
                        <div>
                          <div>
                            <strong>{comment.author}</strong>
                            <small>{comment.time}</small>
                          </div>
                          <p>
                            <LinkifiedText
                              text={comment.body}
                              directory={directory}
                            />
                          </p>
                          {comment.attachments.length > 0 && (
                            <div
                              className="comment-image-gallery"
                              aria-label="Imágenes adjuntas al comentario"
                            >
                              {comment.attachments.map((attachment) => (
                                <CommentImagePreview
                                  attachment={attachment}
                                  key={attachment.id}
                                />
                              ))}
                            </div>
                          )}
                          <div className="comment-reaction-row">
                            <div className="comment-reaction-summary">
                              {groupedReactions.map(([emoji, count]) => (
                                <span key={emoji} title={`${count} reacciones`}>
                                  {emoji} {count}
                                </span>
                              ))}
                            </div>
                            <div className="comment-actions">
                              <div
                                className="comment-reaction-wrap"
                                ref={
                                  commentReactionPickerId === comment.id
                                    ? commentReactionPickerRef
                                    : undefined
                                }
                              >
                                <button
                                  type="button"
                                  className={`comment-reaction-trigger ${ownReaction ? "active" : ""}`}
                                  aria-expanded={
                                    commentReactionPickerId === comment.id
                                  }
                                  aria-haspopup="menu"
                                  disabled={
                                    commentReactionBusyId === comment.id
                                  }
                                  onClick={() =>
                                    setCommentReactionPickerId((current) =>
                                      current === comment.id
                                        ? null
                                        : comment.id,
                                    )
                                  }
                                >
                                  {commentReactionBusyId === comment.id ? (
                                    <Loader2 className="spin" size={14} />
                                  ) : ownReaction ? (
                                    <span aria-hidden="true">
                                      {ownReaction.emoji}
                                    </span>
                                  ) : (
                                    <SmilePlus size={14} />
                                  )}
                                  {ownReactionLabel || "Reaccionar"}
                                </button>
                                {commentReactionPickerId === comment.id && (
                                  <div
                                    className="reaction-picker comment-reaction-picker"
                                    role="menu"
                                    aria-label="Reaccionar al comentario"
                                  >
                                    {taskReactionOptions.map((option) => (
                                      <button
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={
                                          ownReaction?.emoji === option.emoji
                                        }
                                        className={
                                          ownReaction?.emoji === option.emoji
                                            ? "selected"
                                            : ""
                                        }
                                        key={option.emoji}
                                        aria-label={option.label}
                                        title={option.label}
                                        onClick={() =>
                                          void toggleCommentReaction(
                                            comment,
                                            option.emoji,
                                          )
                                        }
                                      >
                                        {option.emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {canDeleteComment && (
                                <button
                                  type="button"
                                  className="comment-delete-trigger"
                                  aria-label={`Borrar comentario de ${comment.author}`}
                                  disabled={commentDeleteBusyId === comment.id}
                                  onClick={() => {
                                    setCommentReactionPickerId(null);
                                    setCommentToDelete(comment);
                                  }}
                                >
                                  <Trash2 size={14} />
                                  Borrar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                {!commentsLoading &&
                  !commentsLoadError &&
                  !(commentsByTask[selectedTask.id] || []).length && (
                    <p className="empty-detail">
                      Sé la primera persona en dejar contexto.
                    </p>
                  )}
              </div>
              <div className="comment-compose" ref={commentComposeRef}>
                {mentionQuery !== null && (
                  <div className="mention-menu" role="listbox">
                    <small>PERSONAS · TAMBIÉN PUEDES BUSCAR POR ÁREA</small>
                    {mentionSuggestions.map((person) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected="false"
                        key={person.id}
                        onClick={() => selectMention(person)}
                      >
                        <Avatar id={person.id} person={person} small />
                        <span>
                          <strong>{person.full_name}</strong>
                          <small>{person.areas?.name || "Sin área"}</small>
                        </span>
                        <em>@{person.full_name}</em>
                      </button>
                    ))}
                    {mentionSuggestions.length === 0 && (
                      <p>No encontramos una persona o área con ese nombre.</p>
                    )}
                  </div>
                )}
                {mentionedPeople.some((person) =>
                  commentDraft.includes(`@${person.full_name}`),
                ) && (
                  <div
                    className="comment-mention-chips"
                    aria-label="Personas mencionadas"
                  >
                    {mentionedPeople
                      .filter((person) =>
                        commentDraft.includes(`@${person.full_name}`),
                      )
                      .map((person) => (
                        <span key={person.id}>
                          <Avatar id={person.id} person={person} small />
                          <strong>@{person.full_name}</strong>
                        </span>
                      ))}
                  </div>
                )}
                <form
                  className="comment-box"
                  aria-busy={commentBusy}
                  onSubmit={addComment}
                >
                  <Avatar id={currentAssigneeId} person={currentPerson} />
                  <input
                    ref={commentImageInputRef}
                    className="comment-image-input"
                    type="file"
                    accept=".jpg,.jpeg,.jfif,.png,.webp,image/jpeg,image/png,image/webp"
                    multiple
                    tabIndex={-1}
                    onChange={selectCommentImages}
                  />
                  <button
                    type="button"
                    className="comment-image-trigger"
                    disabled={
                      commentBusy ||
                      pendingCommentImages.length >= MAX_COMMENT_IMAGES
                    }
                    onClick={() => commentImageInputRef.current?.click()}
                    aria-label="Adjuntar imágenes al comentario"
                    title="Adjuntar imágenes"
                  >
                    <ImagePlus size={18} />
                  </button>
                  <textarea
                    value={commentDraft}
                    onChange={(event) => updateCommentDraft(event.target.value)}
                    onPaste={(event) => {
                      const pastedImages = Array.from(
                        event.clipboardData.files || [],
                      ).filter((file) => file.type.startsWith("image/"));
                      if (!pastedImages.length) return;
                      event.preventDefault();
                      addPendingCommentImages(pastedImages);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey) return;
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }}
                    placeholder="Comenta y usa @ para mencionar · Shift + Enter agrega una línea…"
                    autoComplete="off"
                    disabled={commentBusy}
                    rows={2}
                  />
                  <button
                    className="comment-submit"
                    disabled={
                      commentBusy ||
                      (!commentDraft.trim() &&
                        pendingCommentImages.length === 0)
                    }
                  >
                    {commentBusy ? (
                      <>
                        <Loader2 className="spin" size={15} /> Enviando…
                      </>
                    ) : commentAttachmentTargetId ? (
                      "Reintentar imágenes"
                    ) : (
                      "Enviar"
                    )}
                  </button>
                  {commentImageError && (
                    <p className="comment-image-error" role="alert">
                      {commentImageError}
                    </p>
                  )}
                  {pendingCommentImages.length > 0 && (
                    <div
                      className="pending-comment-images"
                      aria-label="Imágenes listas para adjuntar"
                    >
                      <div className="pending-comment-images-head">
                        <strong>
                          {pendingCommentImages.length}{" "}
                          {pendingCommentImages.length === 1
                            ? commentAttachmentTargetId
                              ? "imagen pendiente"
                              : "imagen lista"
                            : commentAttachmentTargetId
                              ? "imágenes pendientes"
                              : "imágenes listas"}
                        </strong>
                        <small>
                          {commentAttachmentTargetId
                            ? "Vuelve a intentarlo sin duplicar el comentario"
                            : "Se publicarán con tu comentario"}
                        </small>
                      </div>
                      <div className="pending-comment-images-grid">
                        {pendingCommentImages.map((item) => (
                          <span key={item.id}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.previewUrl}
                              alt={`Vista previa de ${item.file.name}`}
                              loading="eager"
                              decoding="async"
                            />
                            <button
                              type="button"
                              aria-label={`Quitar ${item.file.name}`}
                              onClick={() => removePendingCommentImage(item.id)}
                            >
                              <X size={13} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {commentDraft.length > 0 && (
                    <small className="comment-draft-saved">
                      Borrador guardado automáticamente en esta pestaña
                    </small>
                  )}
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
      {commentToDelete && selectedTask && (
        <div className="modal-layer destructive-modal">
          <button
            className="modal-backdrop"
            aria-label="Cancelar borrado del comentario"
            onClick={() => setCommentToDelete(null)}
          />
          <div
            className="confirm-card comment-delete-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-comment-title"
          >
            <span className="confirm-icon">
              <Trash2 size={22} />
            </span>
            <span className="eyebrow">BORRAR COMENTARIO</span>
            <h2 id="delete-comment-title">¿Borrar este comentario?</h2>
            <p className="comment-delete-preview">“{commentToDelete.body}”</p>
            <p>
              También se eliminarán sus reacciones. Esta acción no se puede
              deshacer.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={commentDeleteBusyId === commentToDelete.id}
                onClick={() => setCommentToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={commentDeleteBusyId === commentToDelete.id}
                onClick={() => void deleteComment(commentToDelete)}
              >
                {commentDeleteBusyId === commentToDelete.id ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                Borrar comentario
              </button>
            </div>
          </div>
        </div>
      )}
      {ticketResolutionTask && (
        <div className="modal-layer ticket-resolution-layer">
          <button
            className="modal-backdrop"
            aria-label="Cancelar resolución del ticket"
            disabled={taskActionBusy === ticketResolutionTask.id}
            onClick={() => {
              setTicketResolutionTask(null);
              setTicketResolutionDraft("");
              setTicketResolutionError("");
            }}
          />
          <form
            className="confirm-card ticket-resolution-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolve-ticket-title"
            onSubmit={submitTicketResolution}
          >
            <span className="confirm-icon ticket-resolution-icon">
              <TicketCheck size={23} />
            </span>
            <span className="eyebrow">RESOLVER TICKET</span>
            <h2 id="resolve-ticket-title">¿Cuál fue la resolución?</h2>
            <p className="ticket-resolution-task">
              {ticketResolutionTask.title}
            </p>
            <label htmlFor="ticket-resolution">
              Resolución para el solicitante
              <textarea
                id="ticket-resolution"
                required
                minLength={3}
                maxLength={10000}
                rows={6}
                value={ticketResolutionDraft}
                disabled={taskActionBusy === ticketResolutionTask.id}
                placeholder="Explica claramente qué se hizo y cualquier indicación final…"
                onChange={(event) => {
                  setTicketResolutionDraft(event.target.value);
                  if (ticketResolutionError) setTicketResolutionError("");
                }}
              />
            </label>
            <p className="ticket-resolution-note">
              <Mail size={16} aria-hidden="true" />
              Se enviará por correo al solicitante antes de marcar el ticket
              como hecho.
            </p>
            {ticketResolutionError && (
              <p className="ticket-resolution-error" role="alert">
                {ticketResolutionError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={taskActionBusy === ticketResolutionTask.id}
                onClick={() => {
                  setTicketResolutionTask(null);
                  setTicketResolutionDraft("");
                  setTicketResolutionError("");
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={
                  taskActionBusy === ticketResolutionTask.id ||
                  ticketResolutionDraft.trim().length < 3
                }
              >
                {taskActionBusy === ticketResolutionTask.id ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Mail size={16} />
                )}
                Enviar y marcar como hecho
              </button>
            </div>
          </form>
        </div>
      )}
      {taskToDelete && (
        <div className="modal-layer destructive-modal">
          <button
            className="modal-backdrop"
            aria-label="Cancelar eliminación"
            onClick={() => setTaskToDelete(null)}
          />
          <div
            className="confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-task-title"
          >
            <span className="confirm-icon">
              <Trash2 size={22} />
            </span>
            <span className="eyebrow">ACCIÓN PERMANENTE</span>
            <h2 id="delete-task-title">¿Eliminar esta tarea?</h2>
            <p>
              Se eliminarán “{taskToDelete.title}”, su checklist, comentarios y
              asignaciones. Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={taskActionBusy === taskToDelete.id}
                onClick={() => setTaskToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={taskActionBusy === taskToDelete.id}
                onClick={() => void deleteTask(taskToDelete)}
              >
                {taskActionBusy === taskToDelete.id ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
      {projectToDelete && (
        <div className="modal-layer destructive-modal">
          <button
            className="modal-backdrop"
            aria-label="Cancelar eliminación del proyecto"
            onClick={() => {
              setProjectToDelete(null);
              setProjectDeleteConfirmation("");
            }}
          />
          <div
            className="confirm-card project-delete-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <span className="confirm-icon">
              <Trash2 size={22} />
            </span>
            <span className="eyebrow">ACCIÓN PERMANENTE</span>
            <h2 id="delete-project-title">¿Eliminar todo el proyecto?</h2>
            <p>
              Se eliminarán “{projectToDelete.name}” y todas sus tareas,
              checklists, comentarios y asignaciones. Esta acción no se puede
              deshacer.
            </p>
            <label>
              Escribe <strong>{projectToDelete.name}</strong> para confirmar
              <input
                value={projectDeleteConfirmation}
                onChange={(event) =>
                  setProjectDeleteConfirmation(event.target.value)
                }
                autoComplete="off"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={projectBusy}
                onClick={() => {
                  setProjectToDelete(null);
                  setProjectDeleteConfirmation("");
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={
                  projectBusy ||
                  projectDeleteConfirmation !== projectToDelete.name
                }
                onClick={() => void deleteProject(projectToDelete)}
              >
                {projectBusy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                Eliminar proyecto
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </main>
  );
}
