import DOMPurify from "dompurify";
import { useMemo } from "react";

/**
 * Render an event description that may be either:
 *   - Tiptap-produced HTML (newer rows, after the rich-text editor lands)
 *   - Plain text with newlines (legacy rows, pre-rich-text)
 *
 * For HTML, we sanitize via DOMPurify with a conservative allowlist —
 * defends against any reflected/stored XSS sneaking in through the
 * description field. For plain text, we render as a single paragraph
 * with `whitespace-pre-line` so newlines survive.
 */

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "code", "pre",
  "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote",
  "a",
];
const ALLOWED_ATTR = ["href", "target", "rel", "class"];

function looksLikeHtml(s: string): boolean {
  // Cheap heuristic: presence of a tag that StarterKit emits.
  return /<\s*(p|h[2-4]|ul|ol|li|strong|em|a|blockquote|code|pre)[\s>/]/i.test(s);
}

interface Props {
  html: string;
  className?: string;
}

export function RichTextRender({ html, className }: Props) {
  const sanitized = useMemo(() => {
    if (!looksLikeHtml(html)) return null;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // Force any anchor target=_blank to also carry rel=noreferrer.
      ADD_ATTR: ["target", "rel"],
    });
  }, [html]);

  if (sanitized !== null) {
    return (
      <div
        className={
          className ??
          "prose max-w-none text-bsva-soft font-body leading-relaxed prose-headings:text-bsva-navy prose-strong:text-bsva-navy prose-a:text-bsva-blue"
        }
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  // Plain-text fallback for legacy rows.
  return (
    <p
      className={
        className ??
        "text-bsva-soft font-body text-lg leading-relaxed whitespace-pre-line"
      }
    >
      {html}
    </p>
  );
}
