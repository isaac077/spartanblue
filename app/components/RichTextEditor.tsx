"use client";

import {
  Bold,
  Italic,
  Link2,
  List,
  RemoveFormatting,
  Underline,
} from "lucide-react";
import {
  type ClipboardEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

const RICH_TEXT_PREFIX = "tw-rich-v1:";
const ALLOWED_MARKS = ["bold", "italic", "underline"] as const;

type RichTextMark = (typeof ALLOWED_MARKS)[number];
type RichTextInline = {
  text: string;
  marks?: RichTextMark[];
  href?: string;
};
type RichTextBlock = {
  type: "paragraph" | "bullet";
  inlines: RichTextInline[];
};
type RichTextDocument = {
  version: 1;
  blocks: RichTextBlock[];
};

function safeHref(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function parseRichText(value: string): RichTextDocument | null {
  if (!value.startsWith(RICH_TEXT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(RICH_TEXT_PREFIX.length)) as {
      version?: unknown;
      blocks?: unknown;
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.blocks)) return null;
    const blocks: RichTextBlock[] = [];
    let totalLength = 0;
    for (const candidate of parsed.blocks.slice(0, 250)) {
      if (!candidate || typeof candidate !== "object") continue;
      const raw = candidate as { type?: unknown; inlines?: unknown };
      if (
        (raw.type !== "paragraph" && raw.type !== "bullet") ||
        !Array.isArray(raw.inlines)
      )
        continue;
      const inlines: RichTextInline[] = [];
      for (const inlineCandidate of raw.inlines.slice(0, 500)) {
        if (!inlineCandidate || typeof inlineCandidate !== "object") continue;
        const inline = inlineCandidate as {
          text?: unknown;
          marks?: unknown;
          href?: unknown;
        };
        if (typeof inline.text !== "string") continue;
        const text = inline.text.slice(0, 20_000);
        totalLength += text.length;
        if (totalLength > 100_000) break;
        const rawMarks: unknown[] = Array.isArray(inline.marks)
          ? inline.marks
          : [];
        const marks = ALLOWED_MARKS.filter((mark) => rawMarks.includes(mark));
        const href =
          typeof inline.href === "string" ? safeHref(inline.href) : undefined;
        inlines.push({
          text,
          ...(marks.length ? { marks } : {}),
          ...(href ? { href } : {}),
        });
      }
      blocks.push({ type: raw.type, inlines });
      if (totalLength > 100_000) break;
    }
    return { version: 1, blocks };
  } catch {
    return null;
  }
}

function sameMarks(first?: RichTextMark[], second?: RichTextMark[]) {
  return (first || []).join("|") === (second || []).join("|");
}

function appendInline(target: RichTextInline[], inline: RichTextInline) {
  if (!inline.text) return;
  const previous = target.at(-1);
  if (
    previous &&
    previous.href === inline.href &&
    sameMarks(previous.marks, inline.marks)
  ) {
    previous.text += inline.text;
    return;
  }
  target.push(inline);
}

function extractInlines(
  node: Node,
  marks: RichTextMark[] = [],
  inheritedHref?: string,
): RichTextInline[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return [
      {
        text: node.textContent || "",
        ...(marks.length ? { marks } : {}),
        ...(inheritedHref ? { href: inheritedHref } : {}),
      },
    ];
  }
  if (!(node instanceof HTMLElement)) return [];
  if (node.tagName === "BR") {
    return [
      {
        text: "\n",
        ...(marks.length ? { marks } : {}),
        ...(inheritedHref ? { href: inheritedHref } : {}),
      },
    ];
  }

  const nextMarks = [...marks];
  if (["B", "STRONG"].includes(node.tagName) && !nextMarks.includes("bold"))
    nextMarks.push("bold");
  if (["I", "EM"].includes(node.tagName) && !nextMarks.includes("italic"))
    nextMarks.push("italic");
  if (node.tagName === "U" && !nextMarks.includes("underline"))
    nextMarks.push("underline");
  const nextHref =
    node.tagName === "A"
      ? safeHref(node.getAttribute("href")) || inheritedHref
      : inheritedHref;
  const result: RichTextInline[] = [];
  node.childNodes.forEach((child) => {
    extractInlines(child, nextMarks, nextHref).forEach((inline) =>
      appendInline(result, inline),
    );
  });
  return result;
}

function serializeEditor(root: HTMLElement) {
  const blocks: RichTextBlock[] = [];
  root.childNodes.forEach((node) => {
    if (node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)) {
      Array.from(node.children).forEach((item) => {
        if (item instanceof HTMLElement && item.tagName === "LI")
          blocks.push({ type: "bullet", inlines: extractInlines(item) });
      });
      return;
    }
    const inlines = extractInlines(node);
    if (inlines.length || node.textContent === "")
      blocks.push({ type: "paragraph", inlines });
  });
  const plain = blocks
    .flatMap((block) => block.inlines)
    .map((inline) => inline.text)
    .join("")
    .trim();
  if (!plain) return "";
  return `${RICH_TEXT_PREFIX}${JSON.stringify({ version: 1, blocks })}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineHtml(inline: RichTextInline) {
  let html = escapeHtml(inline.text).replaceAll("\n", "<br>");
  if (inline.href)
    html = `<a href="${escapeHtml(inline.href)}">${html}</a>`;
  if (inline.marks?.includes("underline")) html = `<u>${html}</u>`;
  if (inline.marks?.includes("italic")) html = `<em>${html}</em>`;
  if (inline.marks?.includes("bold")) html = `<strong>${html}</strong>`;
  return html;
}

function editorHtml(value: string) {
  if (!value) return "";
  const document = parseRichText(value);
  if (!document)
    return `<p>${escapeHtml(value).replaceAll("\n", "<br>")}</p>`;
  let html = "";
  let listOpen = false;
  document.blocks.forEach((block) => {
    const content = block.inlines.map(inlineHtml).join("") || "<br>";
    if (block.type === "bullet") {
      if (!listOpen) {
        html += "<ul>";
        listOpen = true;
      }
      html += `<li>${content}</li>`;
      return;
    }
    if (listOpen) {
      html += "</ul>";
      listOpen = false;
    }
    html += `<p>${content}</p>`;
  });
  if (listOpen) html += "</ul>";
  return html || "<p><br></p>";
}

export function plainTextFromDescription(value: string) {
  const document = parseRichText(value);
  if (!document) return value;
  return document.blocks
    .map((block) => block.inlines.map((inline) => inline.text).join(""))
    .join("\n")
    .trim();
}

function linkifiedPlainText(text: string) {
  const linkPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  return text.split(linkPattern).map((part, index) => {
    if (!/^(?:https?:\/\/|www\.)/i.test(part)) return part;
    let linkText = part;
    let trailing = "";
    while (/[),.;!?]$/.test(linkText)) {
      trailing = linkText.slice(-1) + trailing;
      linkText = linkText.slice(0, -1);
    }
    const href = safeHref(
      /^www\./i.test(linkText) ? `https://${linkText}` : linkText,
    );
    if (!href) return part;
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
        {trailing}
      </span>
    );
  });
}

function renderInline(inline: RichTextInline, key: string) {
  let content: ReactNode = inline.text;
  if (inline.href)
    content = (
      <a
        className="inline-link"
        href={inline.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {content}
      </a>
    );
  if (inline.marks?.includes("underline")) content = <u>{content}</u>;
  if (inline.marks?.includes("italic")) content = <em>{content}</em>;
  if (inline.marks?.includes("bold")) content = <strong>{content}</strong>;
  return <span key={key}>{content}</span>;
}

export function RichTextContent({
  value,
  emptyText = "Sin descripción todavía.",
}: {
  value: string;
  emptyText?: string;
}) {
  const document = parseRichText(value);
  if (!document)
    return (
      <div className="rich-text-content plain">
        {linkifiedPlainText(value || emptyText)}
      </div>
    );
  if (!document.blocks.length)
    return <div className="rich-text-content plain">{emptyText}</div>;
  return (
    <div className="rich-text-content">
      {document.blocks.map((block, blockIndex) => {
        const content = block.inlines.map((inline, inlineIndex) =>
          renderInline(inline, `${blockIndex}-${inlineIndex}`),
        );
        return block.type === "bullet" ? (
          <div className="rich-text-bullet" key={`block-${blockIndex}`}>
            <span aria-hidden="true">•</span>
            <span>{content}</span>
          </div>
        ) : (
          <p key={`block-${blockIndex}`}>{content}</p>
        );
      })}
    </div>
  );
}

export default function RichTextEditor({
  name,
  defaultValue = "",
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  placeholder: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Range | null>(null);

  useEffect(() => {
    if (editorRef.current)
      editorRef.current.innerHTML = editorHtml(defaultValue);
    if (hiddenRef.current) hiddenRef.current.value = defaultValue;
  }, [defaultValue]);

  function syncValue() {
    if (editorRef.current && hiddenRef.current)
      hiddenRef.current.value = serializeEditor(editorRef.current);
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (
      !selection?.rangeCount ||
      !editorRef.current?.contains(selection.anchorNode)
    )
      return;
    selectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    if (!selectionRef.current) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selectionRef.current);
  }

  function applyCommand(command: string, value?: string) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    rememberSelection();
    syncValue();
  }

  function addLink() {
    rememberSelection();
    const requested = window.prompt("Pega el enlace (https://…)");
    if (!requested) return;
    const href = safeHref(requested.trim());
    if (!href) {
      window.alert("Usa un enlace válido que comience con http:// o https://");
      return;
    }
    applyCommand("createLink", href);
  }

  function pastePlainText(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    document.execCommand(
      "insertText",
      false,
      event.clipboardData.getData("text/plain").slice(0, 100_000),
    );
    syncValue();
  }

  const toolbarButtons = [
    { command: "bold", label: "Negritas", icon: <Bold size={17} /> },
    { command: "italic", label: "Cursiva", icon: <Italic size={17} /> },
    {
      command: "underline",
      label: "Subrayar",
      icon: <Underline size={17} />,
    },
    {
      command: "insertUnorderedList",
      label: "Lista con viñetas",
      icon: <List size={18} />,
    },
  ];

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" aria-label="Formato del texto">
        {toolbarButtons.map((button) => (
          <button
            type="button"
            aria-label={button.label}
            title={button.label}
            key={button.command}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyCommand(button.command)}
          >
            {button.icon}
          </button>
        ))}
        <span aria-hidden="true" />
        <button
          type="button"
          aria-label="Agregar enlace"
          title="Agregar enlace"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addLink}
        >
          <Link2 size={17} />
        </button>
        <button
          type="button"
          aria-label="Quitar formato"
          title="Quitar formato"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyCommand("removeFormat")}
        >
          <RemoveFormatting size={17} />
        </button>
      </div>
      <div
        className="rich-text-input"
        contentEditable
        role="textbox"
        tabIndex={0}
        aria-multiline="true"
        aria-label="Notas y contexto"
        data-placeholder={placeholder}
        ref={editorRef}
        suppressContentEditableWarning
        onBlur={syncValue}
        onInput={() => {
          rememberSelection();
          syncValue();
        }}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onPaste={pastePlainText}
      />
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={defaultValue} />
    </div>
  );
}
