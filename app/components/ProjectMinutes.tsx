"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FileUp,
  HardDrive,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

type Person = {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string | null;
};

type ProjectMinute = {
  id: string;
  project_id: string;
  author_id: string | null;
  title: string;
  meeting_date: string;
  attendees: string;
  notes: string;
  agreements: string;
  next_steps: string;
  created_at: string;
  updated_at: string;
  project_minute_attachments: MinuteAttachment[];
};

type MinuteAttachment = {
  id: string;
  minute_id: string;
  uploaded_by: string | null;
  drive_file_id: string;
  file_name: string;
  mime_type: "application/pdf";
  size_bytes: number;
  created_at: string;
  local_url?: string;
};

type MinuteDraft = Pick<
  ProjectMinute,
  "title" | "meeting_date" | "attendees" | "notes" | "agreements" | "next_steps"
>;

type Props = {
  projectId: string;
  projectName: string;
  userId: string;
  directory: Person[];
  demo: boolean;
  showStorageMeter: boolean;
  onToast: (message: string) => void;
};

type DriveQuota = {
  limit: number | null;
  usage: number;
  usageInDrive: number;
  remaining: number | null;
};

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PDFS_PER_MINUTE = 10;

function todayValue() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function emptyDraft(): MinuteDraft {
  return {
    title: "",
    meeting_date: todayValue(),
    attendees: "",
    notes: "",
    agreements: "",
    next_steps: "",
  };
}

function formatMeetingDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatFileSize(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatStorage(value: number) {
  const gigabytes = value / (1024 * 1024 * 1024);
  if (gigabytes >= 1)
    return `${gigabytes.toFixed(gigabytes >= 10 ? 1 : 2)} GB`;
  return `${Math.max(1, Math.round(value / (1024 * 1024)))} MB`;
}

function personFor(directory: Person[], id: string | null) {
  return directory.find((person) => person.id === id);
}

function normalizeMinute(value: ProjectMinute): ProjectMinute {
  return {
    ...value,
    project_minute_attachments: value.project_minute_attachments || [],
  };
}

function personName(directory: Person[], id: string | null) {
  return personFor(directory, id)?.full_name || "Equipo Spartanblue";
}

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function MinuteAvatar({ person, name }: { person?: Person; name: string }) {
  return (
    <span className="minute-avatar">
      {person?.avatar_url ? (
        <Image src={person.avatar_url} alt="" fill sizes="34px" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

function Lines({ value }: { value: string }) {
  const lines = value
    .split("\n")
    .map((line) => line.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);
  if (!lines.length) return <p className="minute-empty-copy">Sin información registrada.</p>;
  return (
    <ul>
      {lines.map((line, index) => (
        <li key={`${line}-${index}`}>{line}</li>
      ))}
    </ul>
  );
}

const demoMinutes: ProjectMinute[] = [
  {
    id: "minute-demo-1",
    project_id: "demo-1",
    author_id: "jp",
    title: "Seguimiento semanal del proyecto",
    meeting_date: todayValue(),
    attendees: "Jesús Pacheco, Andrea Morales, Diego Ruiz",
    notes:
      "Revisamos el avance general y los materiales que faltan para cerrar la siguiente entrega.",
    agreements:
      "Diseño entrega la versión final el jueves.\nComercial valida los mensajes antes del viernes.",
    next_steps:
      "Compartir archivos finales con el equipo.\nActualizar las tareas después de cada entrega.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project_minute_attachments: [],
  },
];

export default function ProjectMinutes({
  projectId,
  projectName,
  userId,
  directory,
  demo,
  showStorageMeter,
  onToast,
}: Props) {
  const [minutes, setMinutes] = useState<ProjectMinute[]>(
    demo ? demoMinutes.filter((minute) => minute.project_id === projectId) : [],
  );
  const [loading, setLoading] = useState(!demo);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMinute, setEditingMinute] = useState<ProjectMinute | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<ProjectMinute | null>(null);
  const [minuteToDelete, setMinuteToDelete] = useState<ProjectMinute | null>(null);
  const [draft, setDraft] = useState<MinuteDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [pendingPdfFiles, setPendingPdfFiles] = useState<File[]>([]);
  const [attachmentBusyId, setAttachmentBusyId] = useState<string | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] =
    useState<MinuteAttachment | null>(null);
  const [driveQuota, setDriveQuota] = useState<DriveQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(showStorageMeter);
  const saveLockRef = useRef(false);
  const onToastRef = useRef(onToast);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    let active = true;
    async function loadMinutes() {
      setSelectedMinute(null);
      setEditorOpen(false);
      setEditingMinute(null);
      if (demo || !supabase) {
        setMinutes(demoMinutes.filter((minute) => minute.project_id === projectId));
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("project_minutes")
        .select("*,project_minute_attachments(*)")
        .eq("project_id", projectId)
        .order("meeting_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        setLoading(false);
        onToastRef.current("No pudimos cargar las minutas");
        return;
      }
      setMinutes(((data || []) as ProjectMinute[]).map(normalizeMinute));
      setLoading(false);
    }
    void loadMinutes();
    return () => {
      active = false;
    };
  }, [demo, projectId]);

  useEffect(() => {
    let active = true;
    if (!showStorageMeter || !supabase) {
      return () => {
        active = false;
      };
    }
    async function loadQuota() {
      const { data } = await supabase!.auth.getSession();
      if (active) setQuotaLoading(true);
      const token = data.session?.access_token;
      if (!token) {
        if (active) setQuotaLoading(false);
        return;
      }
      const response = await fetch("/api/drive/quota", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const quota = (await response.json().catch(() => null)) as DriveQuota | null;
      if (active) {
        setDriveQuota(response.ok ? quota : null);
        setQuotaLoading(false);
      }
    }
    void loadQuota();
    return () => {
      active = false;
    };
  }, [showStorageMeter]);

  function openCreator() {
    setEditingMinute(null);
    setDraft(emptyDraft());
    setPendingPdfFiles([]);
    setEditorOpen(true);
  }

  function openEditor(minute: ProjectMinute) {
    setEditingMinute(minute);
    setDraft({
      title: minute.title,
      meeting_date: minute.meeting_date,
      attendees: minute.attendees,
      notes: minute.notes,
      agreements: minute.agreements,
      next_steps: minute.next_steps,
    });
    setPendingPdfFiles([]);
    setSelectedMinute(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (busy) return;
    setEditorOpen(false);
    setEditingMinute(null);
    setDraft(emptyDraft());
    setPendingPdfFiles([]);
  }

  function choosePdfFiles(files: FileList | null) {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const availableSlots = Math.max(
      0,
      MAX_PDFS_PER_MINUTE -
        (editingMinute?.project_minute_attachments.length || 0) -
        pendingPdfFiles.length,
    );
    const candidates = selectedFiles.slice(0, availableSlots);
    const validFiles = candidates.filter(
      (file) =>
        file.type === "application/pdf" &&
        file.name.toLowerCase().endsWith(".pdf") &&
        file.size > 0 &&
        file.size <= MAX_PDF_BYTES,
    );
    if (availableSlots === 0 || selectedFiles.length > availableSlots) {
      onToast("Cada minuta admite hasta 10 archivos PDF");
    } else if (validFiles.length !== candidates.length) {
      onToast("Solo se aceptan PDFs de hasta 50 MB cada uno");
    }
    setPendingPdfFiles((current) => [...current, ...validFiles]);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }

  async function accessToken() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function deleteDrivePdf(fileId: string) {
    const token = await accessToken();
    if (!token) throw new Error("Tu sesión terminó. Vuelve a iniciar sesión.");
    const response = await fetch(
      `/api/drive/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "No pudimos eliminar el PDF");
    }
  }

  async function uploadMinutePdf(file: File, minuteId: string) {
    if (demo || !supabase) {
      return {
        id: `attachment-local-${Date.now()}-${file.name}`,
        minute_id: minuteId,
        uploaded_by: userId,
        drive_file_id: `demo_${Date.now()}`,
        file_name: file.name,
        mime_type: "application/pdf" as const,
        size_bytes: file.size,
        created_at: new Date().toISOString(),
        local_url: URL.createObjectURL(file),
      } satisfies MinuteAttachment;
    }
    const token = await accessToken();
    if (!token) throw new Error("Tu sesión terminó. Vuelve a iniciar sesión.");
    const initiated = await fetch("/api/drive/uploads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: "minute-pdf",
        subjectId: minuteId,
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
      throw new Error(initiation.error || "No pudimos conectar con Google Drive");

    const uploaded = await fetch(initiation.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
      },
      body: file,
    });
    const metadata = (await uploaded.json().catch(() => ({}))) as { id?: string };
    if (!uploaded.ok || !metadata.id || !/^[A-Za-z0-9_-]{10,200}$/.test(metadata.id))
      throw new Error("La carga del PDF no pudo completarse");

    const inserted = await supabase
      .from("project_minute_attachments")
      .insert({
        minute_id: minuteId,
        uploaded_by: userId,
        drive_file_id: metadata.id,
        file_name: file.name.slice(0, 180),
        mime_type: "application/pdf",
        size_bytes: file.size,
      })
      .select("*")
      .single();
    if (inserted.error || !inserted.data) {
      await deleteDrivePdf(metadata.id).catch(() => undefined);
      throw new Error("No pudimos vincular el PDF con la minuta");
    }
    return inserted.data as MinuteAttachment;
  }

  async function openMinutePdf(attachment: MinuteAttachment) {
    if (attachment.local_url) {
      window.open(attachment.local_url, "_blank", "noopener,noreferrer");
      return;
    }
    setAttachmentBusyId(attachment.id);
    try {
      const token = await accessToken();
      if (!token) throw new Error("Tu sesión terminó. Vuelve a iniciar sesión.");
      const response = await fetch(
        `/api/drive/files/${encodeURIComponent(attachment.drive_file_id)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (!response.ok) throw new Error("No pudimos abrir el PDF");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "No pudimos abrir el PDF");
    } finally {
      setAttachmentBusyId(null);
    }
  }

  async function deleteMinuteAttachment(attachment: MinuteAttachment) {
    if (attachmentBusyId) return;
    setAttachmentBusyId(attachment.id);
    try {
      if (!demo && supabase) {
        await deleteDrivePdf(attachment.drive_file_id);
        const removed = await supabase
          .from("project_minute_attachments")
          .delete()
          .eq("id", attachment.id)
          .eq("minute_id", attachment.minute_id);
        if (removed.error) throw new Error("No pudimos actualizar la minuta");
      } else if (attachment.local_url) {
        URL.revokeObjectURL(attachment.local_url);
      }
      const removeFromMinute = (minute: ProjectMinute) => ({
        ...minute,
        project_minute_attachments: minute.project_minute_attachments.filter(
          (item) => item.id !== attachment.id,
        ),
      });
      setMinutes((current) =>
        current.map((minute) =>
          minute.id === attachment.minute_id ? removeFromMinute(minute) : minute,
        ),
      );
      setSelectedMinute((current) =>
        current?.id === attachment.minute_id ? removeFromMinute(current) : current,
      );
      setEditingMinute((current) =>
        current?.id === attachment.minute_id ? removeFromMinute(current) : current,
      );
      setAttachmentToDelete(null);
      onToast("PDF eliminado");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "No pudimos eliminar el PDF");
    } finally {
      setAttachmentBusyId(null);
    }
  }

  async function saveMinute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLockRef.current) return;
    const cleanDraft = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, value.trim()]),
    ) as MinuteDraft;
    if (!cleanDraft.title || !cleanDraft.meeting_date) return;
    if (!cleanDraft.notes && !cleanDraft.agreements && !cleanDraft.next_steps) {
      onToast("Agrega notas, acuerdos o próximos pasos");
      return;
    }

    saveLockRef.current = true;
    setBusy(true);
    try {
      let savedMinute: ProjectMinute;
      if (demo || !supabase) {
        savedMinute = editingMinute
          ? { ...editingMinute, ...cleanDraft, updated_at: new Date().toISOString() }
          : {
              id: `minute-local-${Date.now()}`,
              project_id: projectId,
              author_id: userId,
              ...cleanDraft,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              project_minute_attachments: [],
            };
      } else if (editingMinute) {
        const updated = await supabase
          .from("project_minutes")
          .update({ ...cleanDraft, updated_at: new Date().toISOString() })
          .eq("id", editingMinute.id)
          .eq("project_id", projectId)
          .select("*,project_minute_attachments(*)")
          .single();
        if (updated.error || !updated.data) {
          onToast("No pudimos guardar los cambios");
          return;
        }
        savedMinute = normalizeMinute(updated.data as ProjectMinute);
      } else {
        const inserted = await supabase
          .from("project_minutes")
          .insert({
            project_id: projectId,
            author_id: userId,
            ...cleanDraft,
          })
          .select("*,project_minute_attachments(*)")
          .single();
        if (inserted.error || !inserted.data) {
          onToast("No pudimos crear la minuta");
          return;
        }
        savedMinute = normalizeMinute(inserted.data as ProjectMinute);
      }

      const uploadedAttachments: MinuteAttachment[] = [];
      let failedUploads = 0;
      for (const file of pendingPdfFiles) {
        try {
          uploadedAttachments.push(await uploadMinutePdf(file, savedMinute.id));
        } catch {
          failedUploads += 1;
        }
      }
      if (uploadedAttachments.length) {
        savedMinute = {
          ...savedMinute,
          project_minute_attachments: [
            ...(savedMinute.project_minute_attachments || []),
            ...uploadedAttachments,
          ],
        };
      }

      setMinutes((current) => {
        const withoutSaved = current.filter((minute) => minute.id !== savedMinute.id);
        return [savedMinute, ...withoutSaved].sort((a, b) =>
          b.meeting_date.localeCompare(a.meeting_date),
        );
      });
      setEditorOpen(false);
      setEditingMinute(null);
      setDraft(emptyDraft());
      setPendingPdfFiles([]);
      setSelectedMinute(savedMinute);
      onToast(
        failedUploads
          ? `Minuta guardada; ${failedUploads} PDF${failedUploads === 1 ? "" : "s"} no pudo cargarse`
          : editingMinute
            ? "Minuta actualizada"
            : "Minuta guardada",
      );
    } finally {
      saveLockRef.current = false;
      setBusy(false);
    }
  }

  async function deleteMinute(minute: ProjectMinute) {
    if (busy) return;
    setBusy(true);
    try {
      if (!demo && supabase) {
        for (const attachment of minute.project_minute_attachments) {
          try {
            await deleteDrivePdf(attachment.drive_file_id);
          } catch {
            onToast(`No pudimos borrar ${attachment.file_name}. Intenta nuevamente.`);
            return;
          }
        }
        const { error } = await supabase
          .from("project_minutes")
          .delete()
          .eq("id", minute.id)
          .eq("project_id", projectId);
        if (error) {
          onToast("No pudimos borrar la minuta");
          return;
        }
      } else {
        minute.project_minute_attachments.forEach((attachment) => {
          if (attachment.local_url) URL.revokeObjectURL(attachment.local_url);
        });
      }
      setMinutes((current) => current.filter((item) => item.id !== minute.id));
      setMinuteToDelete(null);
      setSelectedMinute(null);
      onToast("Minuta borrada");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="project-minutes">
      <div className="minutes-header">
        <div>
          <span className="eyebrow">MEMORIA DEL PROYECTO</span>
          <h2>Minutas de juntas</h2>
          <p>Acuerdos, contexto y próximos pasos de {projectName}.</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreator}>
          <Plus size={17} /> Nueva minuta
        </button>
      </div>

      {showStorageMeter && (quotaLoading || driveQuota) && (
        <aside className="drive-storage-meter" aria-label="Espacio de Google disponible">
          <span className="drive-storage-icon"><HardDrive size={19} /></span>
          <div>
            <span><strong>Espacio para archivos</strong><small>Visible solo para Isaac</small></span>
            {quotaLoading ? (
              <span className="drive-storage-loading"><Loader2 className="spin" size={14} /> Consultando Google Drive…</span>
            ) : driveQuota?.limit && driveQuota.remaining !== null ? (
              <>
                <span className="drive-storage-copy"><strong>{formatStorage(driveQuota.remaining)} disponibles</strong><small>de {formatStorage(driveQuota.limit)}</small></span>
                <span
                  className="drive-storage-track"
                  role="progressbar"
                  aria-label="Espacio utilizado"
                  aria-valuemin={0}
                  aria-valuemax={driveQuota.limit}
                  aria-valuenow={Math.min(driveQuota.usage, driveQuota.limit)}
                >
                  <span style={{ width: `${Math.min(100, (driveQuota.usage / driveQuota.limit) * 100)}%` }} />
                </span>
              </>
            ) : (
              <span className="drive-storage-copy"><strong>Almacenamiento sin límite informado</strong><small>{formatStorage(driveQuota?.usageInDrive || 0)} usados en Drive</small></span>
            )}
          </div>
        </aside>
      )}

      {loading ? (
        <div className="minutes-loading" role="status">
          <Loader2 className="spin" size={22} /> Cargando minutas…
        </div>
      ) : minutes.length ? (
        <div className="minutes-grid">
          {minutes.map((minute) => {
            const author = personFor(directory, minute.author_id);
            const authorName = personName(directory, minute.author_id);
            return (
              <article className="minute-card" key={minute.id}>
                <button
                  type="button"
                  className="minute-card-open"
                  onClick={() => setSelectedMinute(minute)}
                >
                  <span className="minute-date-box">
                    <CalendarDays size={18} />
                    {new Date(`${minute.meeting_date}T12:00:00`).toLocaleDateString(
                      "es-MX",
                      { day: "2-digit", month: "short" },
                    )}
                  </span>
                  <span className="minute-card-copy">
                    <strong>{minute.title}</strong>
                    <small>{minute.attendees || "Asistentes no registrados"}</small>
                    <span>{minute.notes || minute.agreements || minute.next_steps}</span>
                    {minute.project_minute_attachments.length > 0 && (
                      <small className="minute-attachment-count">
                        <FileText size={13} />
                        {minute.project_minute_attachments.length} PDF
                        {minute.project_minute_attachments.length === 1 ? "" : "s"}
                      </small>
                    )}
                  </span>
                  <ChevronRight size={19} />
                </button>
                <div className="minute-card-footer">
                  <span>
                    <MinuteAvatar person={author} name={authorName} />
                    Registró {authorName}
                  </span>
                  <div>
                    <button
                      type="button"
                      aria-label="Editar minuta"
                      title="Editar minuta"
                      onClick={() => openEditor(minute)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="danger"
                      aria-label="Borrar minuta"
                      title="Borrar minuta"
                      onClick={() => setMinuteToDelete(minute)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="minutes-empty">
          <span><NotebookPen size={31} /></span>
          <h3>Todavía no hay minutas</h3>
          <p>Guarda aquí lo importante de la próxima junta para que el equipo pueda consultarlo.</p>
          <button className="primary-button" type="button" onClick={openCreator}>
            <Plus size={16} /> Crear primera minuta
          </button>
        </div>
      )}

      {selectedMinute && (
        <div className="modal-layer minutes-modal-layer">
          <button
            className="modal-backdrop"
            aria-label="Cerrar minuta"
            onClick={() => setSelectedMinute(null)}
          />
          <article
            className="minute-detail-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="minute-detail-title"
          >
            <header>
              <div>
                <span className="eyebrow">MINUTA · {projectName}</span>
                <h2 id="minute-detail-title">{selectedMinute.title}</h2>
                <p><CalendarDays size={16} /> {formatMeetingDate(selectedMinute.meeting_date)}</p>
              </div>
              <div className="minute-detail-actions">
                <button className="secondary-button" type="button" onClick={() => openEditor(selectedMinute)}>
                  <Pencil size={15} /> Editar
                </button>
                <button className="icon-button" type="button" aria-label="Cerrar minuta" onClick={() => setSelectedMinute(null)}>
                  <X size={20} />
                </button>
              </div>
            </header>
            <div className="minute-detail-scroll">
              <section className="minute-attendees">
                <Users size={20} />
                <div><strong>Asistentes</strong><p>{selectedMinute.attendees || "No se registraron asistentes."}</p></div>
              </section>
              <section>
                <span className="minute-section-icon blue"><NotebookPen size={19} /></span>
                <div><h3>Notas y contexto</h3><p className="minute-notes">{selectedMinute.notes || "Sin notas registradas."}</p></div>
              </section>
              <section>
                <span className="minute-section-icon green"><CheckCircle2 size={19} /></span>
                <div><h3>Acuerdos</h3><Lines value={selectedMinute.agreements} /></div>
              </section>
              <section>
                <span className="minute-section-icon red"><ClipboardCheck size={19} /></span>
                <div><h3>Próximos pasos</h3><Lines value={selectedMinute.next_steps} /></div>
              </section>
              <section className="minute-files-section">
                <span className="minute-section-icon blue"><FileText size={19} /></span>
                <div>
                  <h3>Archivos PDF</h3>
                  {selectedMinute.project_minute_attachments.length ? (
                    <div className="minute-file-list">
                      {selectedMinute.project_minute_attachments.map((attachment) => (
                        <div className="minute-file-row" key={attachment.id}>
                          <button
                            className="minute-file-open"
                            type="button"
                            disabled={attachmentBusyId === attachment.id}
                            onClick={() => void openMinutePdf(attachment)}
                          >
                            {attachmentBusyId === attachment.id ? (
                              <Loader2 className="spin" size={18} />
                            ) : (
                              <FileText size={18} />
                            )}
                            <span><strong>{attachment.file_name}</strong><small>{formatFileSize(attachment.size_bytes)} · Abrir PDF</small></span>
                          </button>
                          <button
                            className="minute-file-delete"
                            type="button"
                            aria-label={`Borrar ${attachment.file_name}`}
                            title="Borrar PDF"
                            disabled={Boolean(attachmentBusyId)}
                            onClick={() => setAttachmentToDelete(attachment)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="minute-empty-copy">No hay PDFs adjuntos.</p>
                  )}
                </div>
              </section>
            </div>
          </article>
        </div>
      )}

      {editorOpen && (
        <div className="modal-layer minutes-modal-layer">
          <button className="modal-backdrop" aria-label="Cerrar editor de minuta" onClick={closeEditor} />
          <form className="minute-editor-card" onSubmit={saveMinute}>
            <header>
              <div>
                <span className="eyebrow">{editingMinute ? "EDITAR MINUTA" : "NUEVA MINUTA"}</span>
                <h2>{editingMinute ? "Actualizar la junta" : "Documentar una junta"}</h2>
                <p>La minuta quedará guardada únicamente en {projectName}.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Cerrar editor" disabled={busy} onClick={closeEditor}>
                <X size={20} />
              </button>
            </header>
            <div className="minute-editor-scroll">
              <div className="minute-editor-row title-row">
                <label>Título de la junta<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ej. Seguimiento semanal" maxLength={200} required /></label>
                <label>Fecha<input type="date" value={draft.meeting_date} onChange={(event) => setDraft((current) => ({ ...current, meeting_date: event.target.value }))} required /></label>
              </div>
              <label className="minute-attendees-field"><span><UserRound size={16} /> Asistentes</span><input value={draft.attendees} onChange={(event) => setDraft((current) => ({ ...current, attendees: event.target.value }))} placeholder="Escribe los nombres separados por comas" maxLength={3000} /></label>
              <label><span><NotebookPen size={16} /> Notas y contexto</span><textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="¿Qué se revisó y qué contexto debe conservar el equipo?" maxLength={20000} rows={6} /></label>
              <div className="minute-editor-row">
                <label><span><CheckCircle2 size={16} /> Acuerdos</span><textarea value={draft.agreements} onChange={(event) => setDraft((current) => ({ ...current, agreements: event.target.value }))} placeholder="Un acuerdo por línea" maxLength={12000} rows={5} /></label>
                <label><span><ClipboardCheck size={16} /> Próximos pasos</span><textarea value={draft.next_steps} onChange={(event) => setDraft((current) => ({ ...current, next_steps: event.target.value }))} placeholder="Un próximo paso por línea" maxLength={12000} rows={5} /></label>
              </div>
              <section className="minute-pdf-picker">
                <div>
                  <span><FileUp size={18} /></span>
                  <div><strong>Archivos PDF</strong><p>Adjunta hasta 10 PDFs de 50 MB cada uno. Solo los integrantes de este proyecto podrán abrirlos.</p></div>
                </div>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  hidden
                  onChange={(event) => choosePdfFiles(event.target.files)}
                />
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || (editingMinute?.project_minute_attachments.length || 0) + pendingPdfFiles.length >= MAX_PDFS_PER_MINUTE}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  <FileUp size={16} /> Seleccionar PDFs
                </button>
                {(editingMinute?.project_minute_attachments.length || pendingPdfFiles.length > 0) && (
                  <div className="minute-editor-files">
                    {editingMinute?.project_minute_attachments.map((attachment) => (
                      <div className="minute-editor-file" key={attachment.id}>
                        <FileText size={17} />
                        <span><strong>{attachment.file_name}</strong><small>{formatFileSize(attachment.size_bytes)} · Guardado</small></span>
                        <button type="button" aria-label={`Borrar ${attachment.file_name}`} title="Borrar PDF" disabled={Boolean(attachmentBusyId)} onClick={() => setAttachmentToDelete(attachment)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    {pendingPdfFiles.map((file, index) => (
                      <div className="minute-editor-file pending" key={`${file.name}-${file.size}-${index}`}>
                        <FileText size={17} />
                        <span><strong>{file.name}</strong><small>{formatFileSize(file.size)} · Se subirá al guardar</small></span>
                        <button type="button" aria-label={`Quitar ${file.name}`} title="Quitar PDF" onClick={() => setPendingPdfFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <footer>
              <button className="secondary-button" type="button" disabled={busy} onClick={closeEditor}>Cancelar</button>
              <button className="primary-button" disabled={busy}>
                {busy ? <Loader2 className="spin" size={16} /> : <NotebookPen size={16} />}
                {editingMinute ? "Guardar cambios" : "Guardar minuta"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {minuteToDelete && (
        <div className="modal-layer destructive-modal">
          <button className="modal-backdrop" aria-label="Cancelar eliminación de la minuta" onClick={() => setMinuteToDelete(null)} />
          <div className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-minute-title">
            <span className="confirm-icon"><Trash2 size={22} /></span>
            <span className="eyebrow">ACCIÓN PERMANENTE</span>
            <h2 id="delete-minute-title">¿Borrar esta minuta?</h2>
            <p>Se eliminará “{minuteToDelete.title}”. Esta acción no se puede deshacer.</p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setMinuteToDelete(null)}>Cancelar</button>
              <button className="danger-button" type="button" disabled={busy} onClick={() => void deleteMinute(minuteToDelete)}>
                {busy ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />} Borrar minuta
              </button>
            </div>
          </div>
        </div>
      )}

      {attachmentToDelete && (
        <div className="modal-layer destructive-modal minute-attachment-confirm-layer">
          <button className="modal-backdrop" aria-label="Cancelar eliminación del PDF" onClick={() => setAttachmentToDelete(null)} />
          <div className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-minute-pdf-title">
            <span className="confirm-icon"><Trash2 size={22} /></span>
            <span className="eyebrow">ACCIÓN PERMANENTE</span>
            <h2 id="delete-minute-pdf-title">¿Borrar este PDF?</h2>
            <p>Se eliminará “{attachmentToDelete.file_name}” de la minuta. Esta acción no se puede deshacer.</p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" disabled={Boolean(attachmentBusyId)} onClick={() => setAttachmentToDelete(null)}>Cancelar</button>
              <button className="danger-button" type="button" disabled={Boolean(attachmentBusyId)} onClick={() => void deleteMinuteAttachment(attachmentToDelete)}>
                {attachmentBusyId ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />} Borrar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
