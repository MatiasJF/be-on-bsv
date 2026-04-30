import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";

/**
 * Rich-text description editor for the admin event form.
 *
 * Tiptap (ProseMirror under the hood) with StarterKit (paragraph, bold,
 * italic, bullet/ordered list, headings, code, blockquote, history) +
 * Link extension. Output is HTML; stored as-is in `events.description`.
 *
 * Backward-compat: existing rows have plain text. The reader-side
 * (`RichTextRender`) sniffs whether `description` looks like HTML and
 * falls back to a `<p>` block with newline preservation when it doesn't.
 */

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  /** When the externally-supplied value changes (e.g. on edit-load), sync into the editor. */
  syncOnExternalChange?: boolean;
  placeholder?: string;
}

export function RichTextEditor({
  value,
  onChange,
  syncOnExternalChange = true,
  placeholder,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-bsva-cyan underline", target: "_blank", rel: "noreferrer" },
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Tiptap returns "<p></p>" for empty editors; treat that as empty
      // so the form doesn't think the field has content.
      onChange(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[160px] w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white font-body focus:outline-none focus:border-bsva-cyan focus:bg-white/10 transition-colors prose prose-invert max-w-none prose-p:my-2 prose-headings:text-white prose-strong:text-white prose-a:text-bsva-cyan",
      },
    },
  });

  // Sync external value changes (e.g. edit mode loading the row from API).
  useEffect(() => {
    if (!editor || !syncOnExternalChange) return;
    if (value !== editor.getHTML()) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor, syncOnExternalChange]);

  if (!editor) {
    return (
      <div className="min-h-[160px] w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white/50 font-body">
        {placeholder ?? "Loading editor…"}
      </div>
    );
  }

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

interface ToolbarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any;
}

function Toolbar({ editor }: ToolbarProps) {
  const btn =
    "px-2.5 py-1 rounded-md text-xs font-display font-semibold transition-colors border border-white/10";
  const active = "bg-bsva-blue text-white border-bsva-blue";
  const inactive = "text-white/70 hover:bg-white/10";

  function setLink() {
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Link URL:", prev);
    if (url === null) return; // cancel
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`${btn} ${editor.isActive("bold") ? active : inactive}`}
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${btn} ${editor.isActive("italic") ? active : inactive} italic`}
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`${btn} ${editor.isActive("heading", { level: 2 }) ? active : inactive}`}
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`${btn} ${editor.isActive("heading", { level: 3 }) ? active : inactive}`}
      >
        H3
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`${btn} ${editor.isActive("bulletList") ? active : inactive}`}
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`${btn} ${editor.isActive("orderedList") ? active : inactive}`}
      >
        1. List
      </button>
      <button
        type="button"
        onClick={setLink}
        className={`${btn} ${editor.isActive("link") ? active : inactive}`}
      >
        Link
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setParagraph().run()}
        className={`${btn} ${inactive}`}
        title="Clear formatting"
      >
        ¶
      </button>
    </div>
  );
}
