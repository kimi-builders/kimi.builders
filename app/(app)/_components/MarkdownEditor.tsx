"use client";

/* Markdown 编辑器:textarea + 轻量工具条(粗体/行内代码/标题/列表/链接/图片)。
   不上编辑器库:工具条只在选区两侧包/插语法;图片走 /api/upload(与作品媒体同通道),
   支持点击上传与直接粘贴图片。受控(value/onChange)与非受控(defaultValue + FormData)
   两种父级都支持——写值走原生 setter + input 事件,两侧都同步。 */
import { useRef, useState } from "react";
import {
  Bold,
  Code,
  Heading2,
  ImagePlus,
  Link2,
  List,
  LoaderCircle,
} from "lucide-react";
import { t, type I18nKey, type Locale } from "@/src/lib/i18n";
import { toast } from "@/src/lib/toast";
import { uploadMedia } from "@/src/lib/upload";

/* 纯拼接(单测直接测):在 [start,end) 两侧包 before/after;无选区时填占位词。
   返回新值与选区(选中插入的内容,方便用户接着改)。 */
export function spliceMarkdown(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): { next: string; selectionStart: number; selectionEnd: number } {
  const selected = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  const selectionStart = start + before.length;
  return { next, selectionStart, selectionEnd: selectionStart + selected.length };
}

const SYNTAX_ACTIONS: Array<{
  key: "bold" | "code" | "heading" | "list" | "link";
  icon: typeof Bold;
  labelKey: I18nKey;
  before: string;
  after: string;
  phKey: I18nKey;
  /* 行首语法(标题/列表):光标不在行首时自动补换行 */
  linePrefix?: boolean;
}> = [
  { key: "bold", icon: Bold, labelKey: "editor.bold", before: "**", after: "**", phKey: "editor.boldPh" },
  { key: "code", icon: Code, labelKey: "editor.code", before: "`", after: "`", phKey: "editor.codePh" },
  { key: "heading", icon: Heading2, labelKey: "editor.heading", before: "## ", after: "", phKey: "editor.headingPh", linePrefix: true },
  { key: "list", icon: List, labelKey: "editor.list", before: "- ", after: "", phKey: "editor.listPh", linePrefix: true },
  { key: "link", icon: Link2, labelKey: "editor.link", before: "[", after: "](https://)", phKey: "editor.linkPh" },
];

export default function MarkdownEditor({
  locale,
  name,
  id,
  rows = 7,
  placeholder,
  defaultValue,
  value,
  onChange,
  textareaRef: externalRef,
  required,
  inputCls,
}: {
  locale: Locale;
  name: string;
  id?: string;
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  /* 需要聚焦等 DOM 操作时把内部 textarea 引用交出去(如评论表单的回复聚焦) */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  required?: boolean;
  inputCls: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const controlled = value !== undefined;

  /* 原生 setter + input 事件:受控父级收到 onChange,非受控父级走 FormData,都同步 */
  const writeValue = (next: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    setter.call(ta, next);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const apply = (action: (typeof SYNTAX_ACTIONS)[number]) => {
    const ta = textareaRef.current;
    if (!ta) return;
    let before = action.before;
    if (action.linePrefix && ta.selectionStart > 0 && ta.value[ta.selectionStart - 1] !== "\n") {
      before = `\n${before}`;
    }
    const r = spliceMarkdown(
      ta.value,
      ta.selectionStart,
      ta.selectionEnd,
      before,
      action.after,
      t(locale, action.phKey),
    );
    writeValue(r.next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(r.selectionStart, r.selectionEnd);
    });
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const media = await uploadMedia(file, "image");
      const ta = textareaRef.current;
      if (!ta) return;
      const alt = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40) || "image";
      const atLineStart = ta.selectionStart === 0 || ta.value[ta.selectionStart - 1] === "\n";
      const r = spliceMarkdown(
        ta.value,
        ta.selectionStart,
        ta.selectionEnd,
        `${atLineStart ? "" : "\n"}![`,
        `](${media.url})`,
        alt,
      );
      writeValue(r.next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(r.selectionEnd, r.selectionEnd);
      });
    } catch {
      toast(t(locale, "err.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const btnCls =
    "rounded-md p-1.5 text-grey transition-colors hover:bg-paper/[0.06] hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-40";

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-0.5" role="toolbar" aria-label="Markdown">
        {SYNTAX_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.key}
              type="button"
              title={t(locale, action.labelKey)}
              aria-label={t(locale, action.labelKey)}
              className={btnCls}
              onClick={() => apply(action)}
            >
              <Icon size={13} aria-hidden="true" />
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <button
          type="button"
          title={t(locale, "editor.image")}
          aria-label={t(locale, "editor.image")}
          className={btnCls}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus size={13} aria-hidden="true" />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadImage(file);
          }}
        />
      </div>
      <textarea
        ref={(el) => {
          textareaRef.current = el;
          if (externalRef) externalRef.current = el;
        }}
        id={id}
        name={name}
        rows={rows}
        placeholder={placeholder}
        required={required}
        {...(controlled
          ? { value, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value) }
          : { defaultValue })}
        className={`${inputCls} resize-y`}
        onPaste={(event) => {
          const file = [...(event.clipboardData?.files ?? [])].find((f) =>
            f.type.startsWith("image/"),
          );
          if (file) {
            event.preventDefault();
            void uploadImage(file);
          }
        }}
      />
    </div>
  );
}
