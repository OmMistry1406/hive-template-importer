import { Parser } from "htmlparser2";
import sanitizeHtml from "sanitize-html";
import type { Issue } from "./types";

const TABLE_TAGS = ["table", "thead", "tbody", "tr", "th", "td"];
const DISPLAY_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "span", "div", "hr",
  "sub", "sup", "code", "pre", "img", ...TABLE_TAGS,
];

const CSS_COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i, /^[a-z]+$/i];

// Spectora's HTML export can carry links, images, videos, bold, italics and
// colours, so these survive even though the committed sample uses few of them.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: DISPLAY_TAGS,
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    "*": ["style"],
  },
  allowedStyles: {
    "*": {
      color: CSS_COLOR,
      "background-color": CSS_COLOR,
      "text-align": [/^(left|right|center|justify)$/],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    iframe: (_tag, attribs) => ({
      tagName: "a",
      attribs: { href: attribs.src ?? "", target: "_blank", rel: "noopener noreferrer" },
      text: "Embedded video (open link)",
    }),
  },
};

// Stored comment HTML stays byte-for-byte as imported. Sanitising happens at
// display time and on saved edits, because uploaded HTML is untrusted.
export const sanitizeForDisplay = (html: string) => sanitizeHtml(html, SANITIZE_OPTIONS);
export const sanitizeEdit = sanitizeForDisplay;

export type HtmlFindings = {
  isHtml: boolean;
  linkCount: number;
  issues: Omit<Issue, "rowNumber">[];
};

export function inspectCommentHtml(html: string): HtmlFindings {
  const tagCounts = new Map<string, number>();
  const stripped = new Map<string, string>();
  const unsafeLinks: string[] = [];
  const emptyEmbeds: string[] = [];
  const videos: string[] = [];
  let hasTable = false;
  let linkCount = 0;
  let embedDepth = 0;
  let embedHasMedia = false;
  let embedClass = "";

  const parser = new Parser({
    onopentag(name, attrs) {
      tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);

      if (embedDepth > 0) {
        embedDepth++;
        if (["iframe", "video", "embed", "object"].includes(name)) embedHasMedia = true;
      } else if (/embed/i.test(attrs.class ?? "")) {
        embedDepth = 1;
        embedHasMedia = false;
        embedClass = attrs.class;
      }

      if (name === "a") {
        linkCount++;
        const href = (attrs.href ?? "").trim();
        if (!href) unsafeLinks.push("(link with no address)");
        else if (!/^(https?:|mailto:|tel:)/i.test(href)) unsafeLinks.push(href);
      }
      if (name === "iframe") videos.push(attrs.src ?? "");
      else if (TABLE_TAGS.includes(name)) hasTable = true;
      else if (!DISPLAY_TAGS.includes(name)) {
        stripped.set(name, attrs.src ?? attrs.href ?? stripped.get(name) ?? "");
      }
    },
    onclosetag() {
      if (embedDepth > 0 && --embedDepth === 0 && !embedHasMedia) {
        emptyEmbeds.push(embedClass);
      }
    },
  });
  parser.write(html);
  parser.end();

  const issues: HtmlFindings["issues"] = [];
  for (const embedClassName of emptyEmbeds) {
    issues.push({
      severity: "warning",
      origin: "export_gap",
      code: "embed_missing_from_export",
      message:
        "A video embed box is in this comment, but the export has no video inside it. The video address is not in the file, so it cannot be restored from this export. Check this comment in Spectora.",
      detail: `class="${embedClassName}"`,
    });
  }
  for (const src of videos) {
    issues.push({
      severity: "warning",
      origin: "importer_limit",
      code: "embed_shown_as_link",
      message: "An embedded video is shown as a link instead of playing in the page.",
      detail: src || undefined,
    });
  }
  if (hasTable) {
    issues.push({
      severity: "info",
      origin: "importer_limit",
      code: "table_not_editable",
      message:
        "This comment contains a table. It displays correctly, but editing the comment will lose the table layout. Restore original brings it back.",
    });
  }
  for (const [tag, url] of stripped) {
    issues.push({
      severity: "warning",
      origin: "importer_limit",
      code: "unsupported_html",
      message: `<${tag}> is kept in the stored original but is not shown or editable here.`,
      detail: url || undefined,
    });
  }
  for (const href of unsafeLinks) {
    issues.push({
      severity: "warning",
      origin: "source_data",
      code: "unsafe_link",
      message:
        "A link has a missing or unsupported address. It is kept in the stored original, but it will not be clickable.",
      detail: href,
    });
  }

  return { isHtml: tagCounts.size > 0, linkCount, issues };
}
