import type { HeadOptions, MetaDescriptor } from "./client";

function extractTitle(meta?: MetaDescriptor[]): string | undefined {
  if (!meta) {
    return undefined;
  }
  for (const entry of meta) {
    if ("title" in entry) {
      return (entry as { title: string }).title;
    }
  }
  return undefined;
}

function isMetaTag(entry: MetaDescriptor): boolean {
  return !(
    "title" in entry ||
    "charSet" in entry ||
    "script:ld+json" in entry ||
    "tagName" in entry
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAttrs(obj: Record<string, string | undefined>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
    .join(" ");
}

export interface CssContext {
  code?: string;
  mode: "inline" | "external";
}

export function buildHeadInjection(
  headData: HeadOptions | undefined,
  cssContext: CssContext | null
): string {
  const parts: string[] = [];

  if (headData?.meta) {
    const title = extractTitle(headData.meta);
    if (title) {
      parts.push(`<title>${escapeHtml(title)}</title>`);
    }

    for (const m of headData.meta) {
      if (isMetaTag(m)) {
        parts.push(`<meta ${renderAttrs(m as Record<string, string>)} />`);
      }
      if ("script:ld+json" in m) {
        parts.push(
          `<script type="application/ld+json">${JSON.stringify(m["script:ld+json"])}</script>`
        );
      }
    }
  }

  if (cssContext?.mode === "inline" && cssContext.code) {
    parts.push(`<style id="__elysion_css__">${cssContext.code}</style>`);
  } else if (cssContext?.mode === "external") {
    parts.push(`<link id="__elysion_css_link__" href="/_client/styles.css" rel="stylesheet" />`);
  }

  if (headData?.links) {
    for (const link of headData.links) {
      parts.push(`<link ${renderAttrs(link)} />`);
    }
  }

  if (headData?.scripts) {
    for (const script of headData.scripts) {
      const { children, ...rest } = script;
      const attrs = renderAttrs(rest as Record<string, string | undefined>);
      if (children) {
        parts.push(`<script ${attrs}>${children}</script>`);
      } else {
        parts.push(`<script ${attrs}></script>`);
      }
    }
  }

  if (headData?.styles) {
    for (const style of headData.styles) {
      const typeAttr = style.type ? ` type="${escapeHtml(style.type)}"` : "";
      parts.push(`<style${typeAttr}>${style.children}</style>`);
    }
  }

  return parts.length > 0 ? `\n  ${parts.join("\n  ")}\n` : "";
}

export function buildBodyInjection(
  data: Record<string, unknown> | undefined,
  clientJsPath: string,
  dev: boolean
): string {
  const parts: string[] = [];

  if (data) {
    parts.push(
      `<script id="__ELYSION_DATA__" type="application/json">${JSON.stringify(data)}</script>`
    );
  }

  if (dev) {
    parts.push('<script src="/__refresh-setup.js"></script>');
  }

  parts.push(`<script src="${clientJsPath}" type="module" defer></script>`);

  return `\n${parts.join("\n")}\n`;
}

export function postProcessHTML(
  html: string,
  headInjection: string,
  bodyInjection: string
): string {
  let result = html;

  // Inject into </head>
  if (headInjection && result.includes("</head>")) {
    result = result.replace("</head>", `${headInjection}</head>`);
  }

  // Inject before </body>
  if (bodyInjection && result.includes("</body>")) {
    result = result.replace("</body>", `${bodyInjection}</body>`);
  }

  return result;
}
