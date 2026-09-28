import { createClient } from "@supabase/supabase-js";
import {
  allowRequest,
  cleanUntrustedText,
  isUuid,
  noStoreJson,
  readLimitedJson,
} from "../../../../lib/security";

export const maxDuration = 120;

type WeeklyReportRequest = { personId?: string };
type ProjectRelation = { id?: string; name?: string } | { id?: string; name?: string }[] | null;
type PendingTaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  projects: ProjectRelation;
};
type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  areas: { name?: string } | { name?: string }[] | null;
};
type ReportAccount = {
  accountId: string;
  accountName: string;
  activities: Array<{
    id: string;
    topic: string;
    status: "Pendiente" | "En proceso" | "En revisión";
    update: string;
  }>;
};

const REPORT_SERVICE_URL =
  process.env.WEEKLY_REPORT_SERVICE_URL || "";

function singleRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] || null : relation;
}

function isoWeekLabel(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const target = new Date(date.valueOf());
  const day = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((target.valueOf() - firstThursday.valueOf()) / 604_800_000);
  return `Semana ${week}`;
}

function taskDueLabel(date: string | null) {
  if (!date) return "Sin fecha";
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha";
  return `Entrega: ${new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed)}`;
}

function reportTaskStatus(
  status: string,
): ReportAccount["activities"][number]["status"] {
  if (status === "review") return "En revisión";
  if (status === "in_progress") return "En proceso";
  return "Pendiente";
}

function safeFilename(header: string | null, fallback: string) {
  const utf8 = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const basic = header?.match(/filename="?([^";]+)"?/i)?.[1];
  let value = fallback;
  try {
    value = decodeURIComponent(utf8 || basic || fallback);
  } catch {
    value = fallback;
  }
  return value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._ -]/g, "_").slice(0, 180);
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const reportSecret = process.env.WORKSPACE_REPORT_SECRET;

  if (!token || token.length > 4096)
    return noStoreJson({ error: "No autorizado" }, 401);
  if (!supabaseUrl || !supabaseKey || !reportSecret || !REPORT_SERVICE_URL)
    return noStoreJson({ error: "El generador de reportes no está configurado" }, 503);

  const parsed = await readLimitedJson<WeeklyReportRequest>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  if (!isUuid(parsed.value.personId))
    return noStoreJson({ error: "Selecciona una persona válida" }, 400);

  const client = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user)
    return noStoreJson({ error: "Tu sesión terminó. Vuelve a iniciar sesión." }, 401);
  // PDF rendering is already serialized by the disabled UI button. Keep a
  // generous abuse ceiling so a user can correct data and regenerate without
  // being locked out by their previous attempts.
  if (!allowRequest(`weekly-report:${authData.user.id}`, 30, 10 * 60_000))
    return noStoreJson({ error: "Hay demasiados reportes en proceso. Espera un momento." }, 429);

  const personId = parsed.value.personId;
  const [{ data: profile, error: profileError }, { data: assignments, error: assignmentError }] =
    await Promise.all([
      client
        .from("profiles")
        .select("id,full_name,email,phone,areas(name)")
        .eq("id", personId)
        .single(),
      client
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", personId)
        .limit(1000),
    ]);

  if (profileError || !profile)
    return noStoreJson({ error: "No se encontró a esa persona" }, 404);
  if (assignmentError)
    return noStoreJson({ error: "No pudimos consultar sus tareas" }, 500);

  const taskIds = Array.from(
    new Set((assignments || []).map((assignment) => assignment.task_id).filter(isUuid)),
  );
  let pendingTasks: PendingTaskRow[] = [];
  if (taskIds.length > 0) {
    const { data, error } = await client
      .from("tasks")
      .select("id,title,status,due_date,projects(id,name)")
      .in("id", taskIds)
      .neq("status", "done")
      .neq("status", "backlog")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1000);
    if (error)
      return noStoreJson({ error: "No pudimos consultar las tareas pendientes" }, 500);
    pendingTasks = (data || []) as unknown as PendingTaskRow[];
  }

  const accountByProject = new Map<string, ReportAccount>();

  for (const task of pendingTasks) {
    const project = singleRelation(task.projects);
    if (!project?.id) continue;
    let account = accountByProject.get(project.id);
    if (!account) {
      account = {
        accountId: project.id,
        accountName: cleanUntrustedText(project.name, 160) || "Proyecto sin nombre",
        activities: [],
      };
      accountByProject.set(project.id, account);
    }
    const title = cleanUntrustedText(task.title, 500) || "Tarea sin título";
    account.activities.push({
      id: `workspace-${task.id}`,
      topic: title,
      status: reportTaskStatus(task.status),
      update: taskDueLabel(task.due_date),
    });
  }
  const accounts = Array.from(accountByProject.values());

  const today = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date());
  const person = profile as unknown as ProfileRow;
  const area = singleRelation(person.areas)?.name || "";
  const report = {
    metadata: {
      week: isoWeekLabel(today),
      cutoffDate: today,
      responsible: cleanUntrustedText(person.full_name, 160),
      department: cleanUntrustedText(area, 160),
      phone: cleanUntrustedText(person.phone, 80),
      email: cleanUntrustedText(person.email, 320),
    },
    accounts,
  };

  try {
    const upstream = await fetch(`${REPORT_SERVICE_URL.replace(/\/+$/, "")}/api/report/pdf/from-workspace`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${reportSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(report),
      cache: "no-store",
      signal: AbortSignal.timeout(110_000),
    });
    if (!upstream.ok) {
      return noStoreJson({ error: "El generador no pudo crear el PDF. Intenta de nuevo." }, 502);
    }
    const pdf = await upstream.arrayBuffer();
    if (pdf.byteLength < 5 || new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-")
      return noStoreJson({ error: "El generador devolvió un archivo inválido" }, 502);
    const fallback = `Reporte_Semanal_Spartanblue_${today}_${person.full_name || "Responsable"}.pdf`;
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(upstream.headers.get("content-disposition"), fallback)}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Report-Task-Count": String(pendingTasks.length),
      },
    });
  } catch {
    return noStoreJson({ error: "El generador tardó demasiado. Intenta de nuevo." }, 504);
  }
}
