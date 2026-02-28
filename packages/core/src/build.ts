import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ResolvedRoute } from "./router";
import { transformForClient } from "./transform-client";

export interface BuildClientOptions {
  dev?: boolean;
  outDir?: string;
  rootPath?: string | null;
}

const TS_FILE_FILTER = /\.(tsx|ts)$/;

// ── Hydrate entry (shared between dev and prod) ────────────────────────────

/**
 * Generates the client hydration entry.
 * - Imports page components via static imports (Bun bundles them natively).
 * - In dev Bun's HTML bundler handles HMR and React Refresh automatically.
 * - In prod Bun.build() produces the optimised static bundle.
 */
function generateHydrateEntry(routes: ResolvedRoute[], rootPath: string | null): string {
  const imports: string[] = [];
  const routeEntries: string[] = [];

  const hasRoot = rootPath !== null;
  if (hasRoot) {
    imports.push(`import { route as root } from "${rootPath.replace(/\\/g, "/")}";`);
  }

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i] as ResolvedRoute;
    const pageName = `Page${i}`;

    imports.push(`import ${pageName} from "${route.path.replace(/\\/g, "/")}";`);

    const regexPattern = route.pattern.replace(/:[^/]+/g, "([^/]+)").replace(/\*/g, "(.*)");
    routeEntries.push(
      `  { pattern: "${route.pattern}", regex: new RegExp("^${regexPattern}$"), component: ${pageName}.component, pageRoute: ${pageName}._route }`
    );
  }

  return `import React from "react";
import { hydrateRoot } from "react-dom/client";
import { createElement } from "react";

${imports.join("\n")}

function collectLayouts(route) {
  const layouts = [];
  let current = route;
  while (current) {
    if (current.layout) layouts.unshift(current.layout);
    current = current.parent;
  }
  return layouts;
}

function injectSuppressHydration(element) {
  if (!element || typeof element !== "object") return element;
  const type = element.type;
  const props = element.props || {};
  if (type === "html" || type === "head" || type === "body") {
    const newProps = { ...props, suppressHydrationWarning: true };
    if (props.children) {
      newProps.children = Array.isArray(props.children)
        ? props.children.map(injectSuppressHydration)
        : injectSuppressHydration(props.children);
    }
    return Object.assign({}, element, { props: newProps });
  }
  if (props.children) {
    const newProps = { ...props };
    newProps.children = Array.isArray(props.children)
      ? props.children.map(injectSuppressHydration)
      : injectSuppressHydration(props.children);
    return Object.assign({}, element, { props: newProps });
  }
  return element;
}

const routes = [
${routeEntries.join(",\n")}
];

const pathname = window.location.pathname;
const match = routes.find((r) => r.regex.test(pathname));

if (match) {
  const dataEl = document.getElementById("__ELYSION_DATA__");
  const loaderData = dataEl ? JSON.parse(dataEl.textContent || "{}") : {};
  const rootEl = ${hasRoot ? "document" : "document.documentElement"};

  let element = createElement(match.component, loaderData);

  const allLayouts = collectLayouts(match.pageRoute);
  const layouts = ${hasRoot ? "allLayouts.slice(1)" : "allLayouts"};

  for (let i = layouts.length - 1; i >= 0; i--) {
    const Layout = layouts[i];
    if (Layout) element = createElement(Layout, { ...loaderData, children: element });
  }

  ${
    hasRoot
      ? `if (root?.layout) {
    element = createElement(root.layout, { ...loaderData, children: element });
  }`
      : ""
  }

  element = injectSuppressHydration(element);

  hydrateRoot(rootEl, element);
} else {
  console.warn("[elysion] No matching route for", pathname);
}
`;
}

// ── Dev: write files for Bun's native HTML bundler ────────────────────────

/**
 * Generates the minimal HTML entry that Bun's HTML bundler uses to:
 *  - Bundle `_hydrate.tsx` and all its dependencies.
 *  - Set up the HMR WebSocket and React Refresh automatically.
 *
 * The resulting /_bun_entry route is never shown to users; it's self-fetched
 * server-side to extract the content-hashed <script> URLs for SSR injection.
 */
function generateIndexHtml(): string {
  return `<!DOCTYPE html>
<html>
  <head></head>
  <body>
    <script type="module" src="./_hydrate.tsx"></script>
  </body>
</html>
`;
}

/**
 * Writes _hydrate.tsx + index.html to outDir/.elysion for dev (Bun HMR) mode.
 * No Bun.build() call — the native HTML bundler handles everything.
 */
export function writeDevFiles(
  routes: ResolvedRoute[],
  options: BuildClientOptions = {}
): void {
  const { outDir = "./.elysion", rootPath = null } = options;

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const hydrateCode = generateHydrateEntry(routes, rootPath);
  writeFileSync(join(outDir, "_hydrate.tsx"), hydrateCode);
  writeFileSync(join(outDir, "index.html"), generateIndexHtml());

  console.log("[elysion] Dev files written (.elysion/_hydrate.tsx + .elysion/index.html)");
}

// ── Prod: full Bun.build() ─────────────────────────────────────────────────

/**
 * Builds the production client bundle via Bun.build().
 * transformForClient strips server-only code (loader, head) from page files.
 */
export async function buildClient(
  routes: ResolvedRoute[],
  options: BuildClientOptions = {}
): Promise<void> {
  const { outDir = "./.elysion", rootPath = null } = options;
  const clientDir = join(outDir, "client");

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });

  const hydrateCode = generateHydrateEntry(routes, rootPath);
  const hydratePath = join(outDir, "_hydrate.tsx");
  writeFileSync(hydratePath, hydrateCode);

  console.log("[elysion] Building production client bundle…");

  const transformPlugin: Bun.BunPlugin = {
    name: "elysion-transform-client",
    setup(build) {
      build.onLoad({ filter: TS_FILE_FILTER }, async (args) => {
        const { path } = args;
        if (path.includes("node_modules")) return undefined;

        const code = await Bun.file(path).text();
        try {
          const result = transformForClient(code, path);
          let transformed = result.code;

          if (
            transformed.includes("React.createElement") &&
            !/import\s+React\b/.test(transformed)
          ) {
            transformed = 'import React from "react";\n' + transformed;
          }

          return {
            contents: transformed,
            loader: path.endsWith(".tsx") ? "tsx" : "ts",
          };
        } catch (error) {
          console.error(`[elysion] Transform error for ${path}:`, error);
          return undefined;
        }
      });
    },
  };

  const result = await Bun.build({
    entrypoints: [hydratePath],
    outdir: clientDir,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    naming: "[name].[ext]",
    plugins: [transformPlugin],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  });

  if (!result.success) {
    console.error("[elysion] Client build failed:");
    for (const log of result.logs) console.error(log);
    throw new Error("Client build failed");
  }

  for (const output of result.outputs) {
    console.log(`[elysion]   ${output.path} (${(output.size / 1024).toFixed(1)} KB)`);
  }

  console.log("[elysion] Production client build complete");
}

// Keep for backward compat (used in some tests)
function findPagesDir(pagePath: string, _pattern: string): string {
  const pagesIdx = pagePath.lastIndexOf("/pages/");
  if (pagesIdx !== -1) return pagePath.substring(0, pagesIdx + "/pages".length);
  return pagePath.substring(0, pagePath.lastIndexOf("/"));
}
