"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  BellRing,
  Check,
  ChevronDown,
  Loader2,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Pin,
  Plus,
  Send,
  SmilePlus,
  Trash2,
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

type PostComment = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type Post = {
  id: string;
  project_id: string | null;
  author_id: string;
  kind: "message" | "announcement";
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  post_comments: PostComment[];
  post_reactions: { user_id: string; emoji: string }[];
  post_subscriptions: { user_id: string }[];
};

type Props = {
  userId: string;
  directory: Person[];
  demo: boolean;
  onToast: (message: string) => void;
};

const reactionOptions = [
  { emoji: "👍", label: "Me gusta" },
  { emoji: "❤️", label: "Me encanta" },
  { emoji: "🎉", label: "Celebrar" },
  { emoji: "👀", label: "Lo vi" },
] as const;

const demoPosts: Post[] = [
  {
    id: "post-demo-1",
    project_id: null,
    author_id: "am",
    kind: "announcement",
    title: "Arrancamos la revisión final",
    body: "Esta semana vamos a concentrarnos en cerrar diseño, mensajes y materiales comerciales. Dejen aquí decisiones y bloqueos importantes.",
    pinned: true,
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    post_comments: [
      {
        id: "post-comment-demo-1",
        author_id: "dr",
        body: "La versión móvil queda lista hoy antes de las 16:00.",
        created_at: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
      },
    ],
    post_reactions: [
      { user_id: "jp", emoji: "👍" },
      { user_id: "lc", emoji: "🎉" },
    ],
    post_subscriptions: [{ user_id: "am" }, { user_id: "jp" }],
  },
  {
    id: "post-demo-2",
    project_id: null,
    author_id: "jp",
    kind: "message",
    title: "",
    body: "¿Alguien necesita apoyo para llegar a las entregas del viernes?",
    pinned: false,
    created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    post_comments: [],
    post_reactions: [{ user_id: "am", emoji: "👀" }],
    post_subscriptions: [{ user_id: "jp" }],
  },
];

function personFor(directory: Person[], id: string) {
  return directory.find((person) => person.id === id);
}

function personName(directory: Person[], id: string) {
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

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MessageAvatar({
  person,
  name,
  small = false,
}: {
  person?: Person;
  name: string;
  small?: boolean;
}) {
  return (
    <span className={`extension-avatar ${small ? "small" : ""}`}>
      {person?.avatar_url ? (
        <Image
          src={person.avatar_url}
          alt=""
          fill
          sizes={small ? "30px" : "42px"}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export default function WorkspaceExtensions({
  userId,
  directory,
  demo,
  onToast,
}: Props) {
  const [posts, setPosts] = useState<Post[]>(demo ? demoPosts : []);
  const [loading, setLoading] = useState(!demo);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeKind, setComposeKind] =
    useState<Post["kind"]>("message");
  const [composeBusy, setComposeBusy] = useState(false);
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);
  const [reactionBusyId, setReactionBusyId] = useState<string | null>(null);
  const [subscriptionBusyId, setSubscriptionBusyId] = useState<string | null>(
    null,
  );
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);
  const [postDeleteBusyId, setPostDeleteBusyId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [reactionPickerPostId, setReactionPickerPostId] = useState<
    string | null
  >(null);
  const composeLockRef = useRef(false);
  const commentLocksRef = useRef(new Set<string>());
  const reactionPickerRef = useRef<HTMLDivElement>(null);

  async function loadPosts() {
    if (demo || !supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("project_posts")
      .select(
        "*,post_comments(id,author_id,body,created_at),post_reactions(user_id,emoji),post_subscriptions(user_id)",
      )
      .is("project_id", null)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      setLoading(false);
      onToast("No pudimos cargar los mensajes");
      return;
    }
    setPosts((data || []) as Post[]);
    setLoading(false);
  }

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (demo) {
        setPosts(demoPosts);
        setLoading(false);
      } else void loadPosts();
    }, 0);
    return () => window.clearTimeout(loadTimer);
    // La sección es general y no depende del proyecto activo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  useEffect(() => {
    if (!reactionPickerPostId) return;
    const closePicker = (event: PointerEvent) => {
      if (!reactionPickerRef.current?.contains(event.target as Node))
        setReactionPickerPostId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReactionPickerPostId(null);
    };
    document.addEventListener("pointerdown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [reactionPickerPostId]);

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (composeLockRef.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
    const body = String(form.get("body") || "").trim();
    if (!body || (composeKind === "announcement" && !title)) return;

    composeLockRef.current = true;
    setComposeBusy(true);
    try {
      let createdPost: Post;
      if (demo || !supabase) {
        createdPost = {
          id: `post-local-${Date.now()}`,
          project_id: null,
          author_id: userId,
          kind: composeKind,
          title,
          body,
          pinned: composeKind === "announcement",
          created_at: new Date().toISOString(),
          post_comments: [],
          post_reactions: [],
          post_subscriptions: [{ user_id: userId }],
        };
      } else {
        const inserted = await supabase
          .from("project_posts")
          .insert({
            project_id: null,
            author_id: userId,
            kind: composeKind,
            title,
            body,
            pinned: composeKind === "announcement",
          })
          .select("id,project_id,author_id,kind,title,body,pinned,created_at")
          .single();
        if (inserted.error || !inserted.data) {
          onToast("No pudimos publicar el mensaje");
          return;
        }
        await supabase.from("post_subscriptions").insert({
          post_id: inserted.data.id,
          user_id: userId,
        });
        createdPost = {
          ...(inserted.data as Omit<
            Post,
            "post_comments" | "post_reactions" | "post_subscriptions"
          >),
          post_comments: [],
          post_reactions: [],
          post_subscriptions: [{ user_id: userId }],
        };

        if (composeKind === "announcement") {
          const recipients = directory.filter((person) => person.id !== userId);
          if (recipients.length) {
            await supabase.from("notifications").insert(
              recipients.map((person) => ({
                user_id: person.id,
                actor_id: userId,
                project_id: null,
                task_id: null,
                type: "announcement",
                title: "Nuevo anuncio del Workspace",
                body: title,
              })),
            );
          }
        }
      }

      setPosts((current) => [createdPost, ...current]);
      formElement.reset();
      setComposeKind("message");
      setComposeOpen(false);
      onToast(
        composeKind === "announcement"
          ? "Anuncio publicado"
          : "Mensaje publicado",
      );
    } finally {
      composeLockRef.current = false;
      setComposeBusy(false);
    }
  }

  async function togglePostReaction(post: Post, emoji: string) {
    if (reactionBusyId) return;
    setReactionPickerPostId(null);
    setReactionBusyId(post.id);
    const own = post.post_reactions.find(
      (reaction) => reaction.user_id === userId,
    );
    const remove = own?.emoji === emoji;
    const nextReactions = remove
      ? post.post_reactions.filter((reaction) => reaction.user_id !== userId)
      : [
          ...post.post_reactions.filter(
            (reaction) => reaction.user_id !== userId,
          ),
          { user_id: userId, emoji },
        ];

    if (!demo && supabase) {
      const result = remove
        ? await supabase
            .from("post_reactions")
            .delete()
            .eq("post_id", post.id)
            .eq("user_id", userId)
        : await supabase.from("post_reactions").upsert(
            { post_id: post.id, user_id: userId, emoji },
            { onConflict: "post_id,user_id" },
          );
      if (result.error) {
        setReactionBusyId(null);
        onToast("No pudimos guardar la reacción");
        return;
      }
      if (!remove && post.author_id !== userId) {
        await supabase.from("notifications").insert({
          user_id: post.author_id,
          actor_id: userId,
          project_id: null,
          task_id: null,
          type: "reaction",
          title: `${personName(directory, userId)} reaccionó ${emoji}`,
          body: post.title || post.body.slice(0, 90),
        });
      }
    }
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? { ...item, post_reactions: nextReactions }
          : item,
      ),
    );
    setReactionBusyId(null);
  }

  async function togglePostSubscription(post: Post) {
    if (subscriptionBusyId) return;
    setSubscriptionBusyId(post.id);
    const following = post.post_subscriptions.some(
      (item) => item.user_id === userId,
    );
    if (!demo && supabase) {
      const result = following
        ? await supabase
            .from("post_subscriptions")
            .delete()
            .eq("post_id", post.id)
            .eq("user_id", userId)
        : await supabase
            .from("post_subscriptions")
            .insert({ post_id: post.id, user_id: userId });
      if (result.error) {
        setSubscriptionBusyId(null);
        onToast("No pudimos actualizar el seguimiento");
        return;
      }
    }
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
              ...item,
              post_subscriptions: following
                ? item.post_subscriptions.filter(
                    (subscription) => subscription.user_id !== userId,
                  )
                : [...item.post_subscriptions, { user_id: userId }],
            }
          : item,
      ),
    );
    setSubscriptionBusyId(null);
    onToast(
      following
        ? "Dejaste de seguir la conversación"
        : "Ahora sigues la conversación",
    );
  }

  async function addPostComment(
    event: FormEvent<HTMLFormElement>,
    post: Post,
  ) {
    event.preventDefault();
    if (commentLocksRef.current.has(post.id)) return;
    const body = (commentDrafts[post.id] || "").trim();
    if (!body) return;

    commentLocksRef.current.add(post.id);
    setCommentBusyId(post.id);
    try {
      let comment: PostComment = {
        id: `post-comment-local-${Date.now()}`,
        author_id: userId,
        body,
        created_at: new Date().toISOString(),
      };
      if (!demo && supabase) {
        const inserted = await supabase
          .from("post_comments")
          .insert({ post_id: post.id, author_id: userId, body })
          .select("id,author_id,body,created_at")
          .single();
        if (inserted.error || !inserted.data) {
          onToast("No pudimos publicar la respuesta");
          return;
        }
        comment = inserted.data as PostComment;
        await supabase.from("post_subscriptions").upsert(
          { post_id: post.id, user_id: userId },
          { onConflict: "post_id,user_id" },
        );
        const recipients = Array.from(
          new Set([
            post.author_id,
            ...post.post_subscriptions.map(
              (subscription) => subscription.user_id,
            ),
          ]),
        ).filter((id) => id !== userId);
        if (recipients.length) {
          await supabase.from("notifications").insert(
            recipients.map((id) => ({
              user_id: id,
              actor_id: userId,
              project_id: null,
              task_id: null,
              type: "subscription",
              title: `${personName(directory, userId)} respondió en una conversación`,
              body: post.title || body.slice(0, 100),
            })),
          );
        }
      }
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? {
                ...item,
                post_comments: [...item.post_comments, comment],
                post_subscriptions: item.post_subscriptions.some(
                  (subscription) => subscription.user_id === userId,
                )
                  ? item.post_subscriptions
                  : [...item.post_subscriptions, { user_id: userId }],
              }
            : item,
        ),
      );
      setCommentDrafts((current) => ({ ...current, [post.id]: "" }));
    } finally {
      commentLocksRef.current.delete(post.id);
      setCommentBusyId(null);
    }
  }

  async function deletePost(post: Post) {
    if (postDeleteBusyId || post.author_id !== userId) return;
    setPostDeleteBusyId(post.id);
    try {
      if (!demo && supabase) {
        const { error } = await supabase
          .from("project_posts")
          .delete()
          .eq("id", post.id)
          .eq("author_id", userId);
        if (error) {
          onToast("No pudimos borrar el mensaje");
          return;
        }
      }
      setPosts((current) => current.filter((item) => item.id !== post.id));
      setCommentDrafts((current) => {
        const next = { ...current };
        delete next[post.id];
        return next;
      });
      setReactionPickerPostId((current) =>
        current === post.id ? null : current,
      );
      setPostToDelete(null);
      onToast(post.kind === "announcement" ? "Anuncio borrado" : "Mensaje borrado");
    } finally {
      setPostDeleteBusyId(null);
    }
  }

  const currentPerson = personFor(directory, userId);

  return (
    <div className="content extension-view messages-view">
      <div className="extension-head messages-head">
        <div>
          <span className="eyebrow">CONVERSACIONES DEL WORKSPACE</span>
          <h1>Mensajes</h1>
          <p>Acuerdos, novedades y decisiones para todo el equipo.</p>
        </div>
        <div className="messages-head-actions">
          <span>
            <MessageSquareText size={16} /> {posts.length}{" "}
            {posts.length === 1 ? "conversación" : "conversaciones"}
          </span>
          <button
            className="primary-button"
            onClick={() => setComposeOpen((current) => !current)}
          >
            {composeOpen ? <X size={17} /> : <Plus size={17} />}
            {composeOpen ? "Cerrar" : "Nuevo mensaje"}
          </button>
        </div>
      </div>

      {composeOpen && (
        <form className="extension-compose message-compose" onSubmit={createPost}>
          <div className="compose-heading">
            <div>
              <strong>Publicar para todo el Workspace</strong>
              <small>Todas las personas registradas podrán verlo.</small>
            </div>
            <div className="message-kind-switch" aria-label="Tipo de publicación">
              <button
                type="button"
                className={composeKind === "message" ? "active" : ""}
                onClick={() => setComposeKind("message")}
              >
                <MessageSquareText size={15} /> Mensaje
              </button>
              <button
                type="button"
                className={composeKind === "announcement" ? "active" : ""}
                onClick={() => setComposeKind("announcement")}
              >
                <Megaphone size={15} /> Anuncio
              </button>
            </div>
          </div>
          <label>
            Asunto {composeKind === "message" && <small>opcional</small>}
            <input
              name="title"
              placeholder={
                composeKind === "announcement"
                  ? "Ej. Cambio importante para el equipo"
                  : "Ej. Decisión sobre la entrega"
              }
              maxLength={160}
              required={composeKind === "announcement"}
            />
          </label>
          <label>
            Mensaje
            <textarea
              name="body"
              placeholder="Escribe el contexto necesario para que el equipo pueda responder…"
              maxLength={5000}
              required
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={composeBusy}
              onClick={() => setComposeOpen(false)}
            >
              Cancelar
            </button>
            <button className="primary-button" disabled={composeBusy}>
              {composeBusy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Send size={16} />
              )}
              Publicar
            </button>
          </div>
        </form>
      )}

      <div className="message-board">
        {loading && (
          <div className="messages-loading" role="status">
            <Loader2 className="spin" size={22} />
            <span>Cargando conversaciones…</span>
          </div>
        )}
        {posts.map((post) => {
          const author = personFor(directory, post.author_id);
          const authorName = personName(directory, post.author_id);
          const following = post.post_subscriptions.some(
            (item) => item.user_id === userId,
          );
          const ownReaction = post.post_reactions.find(
            (reaction) => reaction.user_id === userId,
          );
          const ownReactionLabel = reactionOptions.find(
            (option) => option.emoji === ownReaction?.emoji,
          )?.label;
          return (
            <article
              className={`message-card ${post.kind === "announcement" ? "announcement" : ""}`}
              key={post.id}
            >
              <div className="message-card-head">
                <MessageAvatar person={author} name={authorName} />
                <div>
                  <strong>{authorName}</strong>
                  <small>{formatDate(post.created_at)}</small>
                </div>
                {post.kind === "announcement" && (
                  <span className="announcement-pill">
                    <Pin size={13} /> Anuncio fijado
                  </span>
                )}
                <button
                  className={following ? "follow-button active" : "follow-button"}
                  disabled={subscriptionBusyId === post.id}
                  onClick={() => void togglePostSubscription(post)}
                >
                  {subscriptionBusyId === post.id ? (
                    <Loader2 className="spin" size={15} />
                  ) : following ? (
                    <Check size={15} />
                  ) : (
                    <BellRing size={15} />
                  )}
                  {following ? "Siguiendo" : "Seguir"}
                </button>
                {post.author_id === userId && (
                  <button
                    type="button"
                    className="message-delete-button"
                    aria-label={
                      post.kind === "announcement"
                        ? "Borrar anuncio"
                        : "Borrar mensaje"
                    }
                    title={
                      post.kind === "announcement"
                        ? "Borrar anuncio"
                        : "Borrar mensaje"
                    }
                    onClick={() => setPostToDelete(post)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {post.title && <h2>{post.title}</h2>}
              <p className="message-body">{post.body}</p>

              <div className="message-engagement">
                <div className="reaction-row">
                  <div
                    className="reaction-picker-wrap"
                    ref={reactionPickerPostId === post.id ? reactionPickerRef : undefined}
                  >
                    <button
                      type="button"
                      className={`reaction-trigger ${ownReaction ? "active" : ""}`}
                      aria-expanded={reactionPickerPostId === post.id}
                      aria-haspopup="menu"
                      disabled={reactionBusyId === post.id}
                      onClick={() =>
                        setReactionPickerPostId((current) =>
                          current === post.id ? null : post.id,
                        )
                      }
                    >
                      {reactionBusyId === post.id ? (
                        <Loader2 className="spin" size={15} />
                      ) : ownReaction ? (
                        <span className="selected-reaction" aria-hidden="true">
                          {ownReaction.emoji}
                        </span>
                      ) : (
                        <SmilePlus size={16} />
                      )}
                      <span>{ownReactionLabel || "Reaccionar"}</span>
                      {post.post_reactions.length > 0 && (
                        <span className="reaction-count">
                          {post.post_reactions.length}
                        </span>
                      )}
                      <ChevronDown className="reaction-chevron" size={14} />
                    </button>
                    {reactionPickerPostId === post.id && (
                      <div
                        className="reaction-picker"
                        role="menu"
                        aria-label="Elegir reacción"
                      >
                        {reactionOptions.map((option) => (
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={ownReaction?.emoji === option.emoji}
                            className={
                              ownReaction?.emoji === option.emoji
                                ? "selected"
                                : ""
                            }
                            key={option.emoji}
                            aria-label={option.label}
                            title={option.label}
                            onClick={() =>
                              void togglePostReaction(post, option.emoji)
                            }
                          >
                            {option.emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="engagement-summary">
                  <span>
                    <MessageCircle size={15} /> {post.post_comments.length}
                  </span>
                  <span>
                    <Users size={15} /> {post.post_subscriptions.length}
                  </span>
                </div>
              </div>

              <div className="post-thread">
                {post.post_comments.length > 0 && (
                  <strong className="thread-title">
                    Respuestas ({post.post_comments.length})
                  </strong>
                )}
                {post.post_comments.map((comment) => {
                  const commentAuthor = personFor(directory, comment.author_id);
                  const commentAuthorName = personName(
                    directory,
                    comment.author_id,
                  );
                  return (
                    <div className="post-comment" key={comment.id}>
                      <MessageAvatar
                        person={commentAuthor}
                        name={commentAuthorName}
                        small
                      />
                      <div>
                        <strong>{commentAuthorName}</strong>
                        <p>{comment.body}</p>
                        <small>{formatDate(comment.created_at)}</small>
                      </div>
                    </div>
                  );
                })}
                <form onSubmit={(event) => void addPostComment(event, post)}>
                  <MessageAvatar
                    person={currentPerson}
                    name={personName(directory, userId)}
                    small
                  />
                  <input
                    value={commentDrafts[post.id] || ""}
                    onChange={(event) =>
                      setCommentDrafts((current) => ({
                        ...current,
                        [post.id]: event.target.value,
                      }))
                    }
                    placeholder="Escribe una respuesta…"
                    maxLength={3000}
                    disabled={commentBusyId === post.id}
                  />
                  <button
                    aria-label="Enviar respuesta"
                    disabled={
                      commentBusyId === post.id ||
                      !(commentDrafts[post.id] || "").trim()
                    }
                  >
                    {commentBusyId === post.id ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </form>
              </div>
            </article>
          );
        })}
        {!loading && posts.length === 0 && (
          <div className="extension-empty messages-empty">
            <span>
              <MessageSquareText size={30} />
            </span>
            <h2>La conversación empieza aquí</h2>
            <p>
              Publica una decisión, una actualización o un anuncio para el
              equipo.
            </p>
            <button
              className="primary-button"
              onClick={() => setComposeOpen(true)}
            >
              <Plus size={16} /> Crear primer mensaje
            </button>
          </div>
        )}
      </div>
      {postToDelete && (
        <div className="modal-layer destructive-modal">
          <button
            className="modal-backdrop"
            aria-label="Cancelar eliminación del mensaje"
            onClick={() => setPostToDelete(null)}
          />
          <div
            className="confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-post-title"
          >
            <span className="confirm-icon">
              <Trash2 size={22} />
            </span>
            <span className="eyebrow">ACCIÓN PERMANENTE</span>
            <h2 id="delete-post-title">
              ¿Borrar este {postToDelete.kind === "announcement" ? "anuncio" : "mensaje"}?
            </h2>
            <p>
              Se eliminarán también sus respuestas, reacciones y seguidores.
              Esta acción no se puede deshacer.
            </p>
            <div className="message-delete-preview">
              <strong>{postToDelete.title || "Mensaje sin asunto"}</strong>
              <span>{postToDelete.body}</span>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={postDeleteBusyId === postToDelete.id}
                onClick={() => setPostToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={postDeleteBusyId === postToDelete.id}
                onClick={() => void deletePost(postToDelete)}
              >
                {postDeleteBusyId === postToDelete.id ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                Borrar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
