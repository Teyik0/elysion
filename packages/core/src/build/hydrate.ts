import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateIndexHtml } from "../render/shell";
import type { ResolvedRoute } from "../router";
import { writeRouteTypes } from "./route-types";
import type { BuildClientOptions } from "./types";

/**
 * Generates the client hydration entry.
 *
 * Renders into <div id="root"> (the SSR outlet element) and retains the React
 * root across hot reloads via import.meta.hot.data.root so React Fast Refresh
 * applies in-place instead of remounting.
 *
 * @param routes - Resolved routes to include in the hydration manifest.
 * @param rootPath - Absolute path to the root layout module.
 */
export function generateHydrateEntry(routes: ResolvedRoute[], rootPath: string): string {
  const linkPath = resolve(import.meta.dir, "../link.tsx").replace(/\\/g, "/");
  const routeEntries: string[] = [];

  for (const route of routes) {
    const resolvedRoute = route as ResolvedRoute;
    const resolvedPage = resolvedRoute.path.replace(/\\/g, "/");

    const regexPattern = resolvedRoute.pattern.replace(/:[^/]+/g, "([^/]+)").replace(/\*/g, "(.*)");

    routeEntries.push(
      ` { pattern: "${resolvedRoute.pattern}", regex: new RegExp("^${regexPattern}$"), load: () => import("${resolvedPage}") }`
    );
  }

  return `import { hydrateRoot, createRoot } from "react-dom/client";
import { createElement } from "react";
import { RouterProvider } from "${linkPath}";
import { route as root } from "${rootPath.replace(/\\/g, "/")}";

const routes = [
${routeEntries.join(",\n")}
];

const pathname = window.location.pathname;
const _match = routes.find((r) => r.regex.test(pathname));

// Eagerly load only the current page module for initial hydration.
// All other pages are loaded on demand when the user navigates to them.
if (_match) {
  const _mod = await _match.load();
  const match = { ..._match, component: _mod.default.component, pageRoute: _mod.default._route };

  const dataEl = document.getElementById("__ELYSION_DATA__");
  const loaderData = dataEl ? JSON.parse(dataEl.textContent || "{}") : {};
  const rootEl = document.getElementById("root") as HTMLElement;

  const app = createElement(RouterProvider, {
    routes,
    root,
    initialMatch: match,
    initialData: loaderData,
  } as any);

  if (import.meta.hot) {
    // Retain React root across hot reloads so Fast Refresh applies in-place.
    const hotRoot = (import.meta.hot.data.root ??= rootEl.innerHTML.trim()
      ? hydrateRoot(rootEl, app)
      : createRoot(rootEl));
    hotRoot.render(app);
  } else if (rootEl.innerHTML.trim()) {
    hydrateRoot(rootEl, app);
  } else {
    createRoot(rootEl).render(app);
  }
} else {
  console.warn("[elyra] No matching route for", pathname);
}
`;
}

/**
 * Writes _hydrate.tsx + index.html to outDir for dev (Bun HMR) mode.
 *
 * Only rewrites a file when its content has actually changed so Bun's --hot
 * watcher does not trigger a spurious reload on every server restart.
 */
export function writeDevFiles(routes: ResolvedRoute[], options: BuildClientOptions): void {
  const { outDir = "./.elyra", rootPath } = options;

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const hydrateCode = generateHydrateEntry(routes, rootPath);
  const hydratePath = join(outDir, "_hydrate.tsx");
  const existingHydrate = existsSync(hydratePath) ? readFileSync(hydratePath, "utf8") : "";
  if (hydrateCode !== existingHydrate) {
    writeFileSync(hydratePath, hydrateCode);
  }

  const indexHtml = generateIndexHtml();
  const indexPath = join(outDir, "index.html");
  const existingIndex = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
  if (indexHtml !== existingIndex) {
    writeFileSync(indexPath, indexHtml);
  }

  writeRouteTypes(routes, outDir);

  console.log(
    "[elyra] Dev files written (.elyra/_hydrate.tsx + .elyra/index.html + .elyra/routes.d.ts)"
  );
}
