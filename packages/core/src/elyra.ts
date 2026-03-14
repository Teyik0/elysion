import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import type { EmbeddedAppData } from "./internal.ts";
import { getCompileContext } from "./internal.ts";
import { warmSSGCache } from "./render/index.ts";
import { setProductionTemplateContent, setProductionTemplatePath } from "./render/template.ts";
import { createRoutePlugin, loadProdRoutes, scanPages } from "./router.ts";
import { IS_DEV } from "./runtime-env.ts";

export interface ElysionProps {
  pagesDir?: string;
}

function resolveClientDirFromArgv(): string {
  const envClientDir = process.env.ELYRA_CLIENT_DIR;
  if (envClientDir) {
    const resolvedEnvDir = envClientDir.startsWith("/")
      ? envClientDir
      : resolve(process.cwd(), envClientDir);
    return resolvedEnvDir;
  }

  try {
    const moduleUrl = new URL(import.meta.url);
    if (moduleUrl.protocol === "file:") {
      const modulePath = fileURLToPath(moduleUrl);
      if (!modulePath.includes("/$bunfs/")) {
        const moduleClientDir = join(dirname(modulePath), "client");
        if (existsSync(join(moduleClientDir, "index.html"))) {
          return moduleClientDir;
        }
      }
    }
  } catch {
    // ignore, fallback to argv-based resolution
  }
  const candidates = [
    process.argv[1],
    process.argv[0],
    (process as { argv0?: string }).argv0,
    process.execPath,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const candidate of candidates) {
    const name = basename(candidate);
    if (name === "bun" || name === "node") {
      continue;
    }
    if (candidate.includes("/$bunfs/") || candidate.startsWith("bunfs:")) {
      continue;
    }
    const absolute = candidate.startsWith("/") ? candidate : resolve(process.cwd(), candidate);
    if (existsSync(absolute)) {
      return join(dirname(absolute), "client");
    }

    if (!candidate.includes("/") && process.env.PATH) {
      for (const dir of process.env.PATH.split(":")) {
        const fullPath = join(dir, candidate);
        if (existsSync(fullPath)) {
          return join(dirname(fullPath), "client");
        }
      }
    }
  }

  const defaultClientDir = resolve(process.cwd(), ".elyra/build/bun/client");
  if (existsSync(join(defaultClientDir, "index.html"))) {
    return defaultClientDir;
  }

  return join(process.cwd(), "client");
}

async function setupProdTemplate(
  embedded: EmbeddedAppData | undefined,
  clientDir: string
): Promise<void> {
  if (embedded) {
    if (!embedded.template) {
      throw new Error("[elyra] Embedded app is missing its HTML template (index.html).");
    }
    const html = await Bun.file(embedded.template).text();
    setProductionTemplateContent(html);
    return;
  }

  const templatePath = join(clientDir, "index.html");
  if (!existsSync(templatePath)) {
    throw new Error("[elyra] No pre-built assets found. Run `bun run build` first.");
  }
  setProductionTemplatePath(templatePath);
}

function buildEmbedInstance(
  instanceName: string,
  resolvedPagesDir: string,
  embedded: EmbeddedAppData
): Elysia {
  const { assets } = embedded;
  // Explicit wildcard route — lifecycle hooks don't fire for unmatched routes.
  return new Elysia({ name: instanceName, seed: resolvedPagesDir }).get(
    "/_client/*",
    ({ params }) => {
      const filePath = assets[`/_client/${params["*"]}`];
      return filePath
        ? new Response(Bun.file(filePath))
        : new Response("Not Found", { status: 404 });
    }
  ) as unknown as Elysia;
}

async function buildDiskInstance(
  instanceName: string,
  resolvedPagesDir: string,
  clientDir: string
): Promise<Elysia> {
  return new Elysia({ name: instanceName, seed: resolvedPagesDir })
    .use(await staticPlugin())
    .use(await staticPlugin({ assets: clientDir, prefix: "/_client" }));
}

/**
 * Main Elyra plugin.
 *
 * Returns a standalone Elysia instance (async function) so that routes are
 * properly registered in Elysia's router for SPA navigation to work.
 *
 * ## Usage
 *
 * ```ts
 * new Elysia()
 *   .use(await elyra({ ... }))
 *   .listen(3000)
 * ```
 */
export async function elyra({ pagesDir }: ElysionProps) {
  const cwd = process.cwd();
  const ctx = getCompileContext();
  const resolvedPagesDir = ctx?.rootPath
    ? dirname(ctx.rootPath)
    : resolve(cwd, pagesDir ?? "src/pages");

  // Unique name per pagesDir to avoid Elysia's name-based plugin dedup.
  const instanceName = `elyra-${resolvedPagesDir.replaceAll("\\", "/")}`;

  // ── Dev: Bun native HMR ────────────────────────────────────────────────
  const elyraDir = resolve(cwd, ".elyra");
  if (IS_DEV) {
    const { root, routes } = await scanPages(resolvedPagesDir);
    console.info(
      `[elyra] Configuration: ${routes.length} page(s) — ${IS_DEV ? "dev (Bun HMR)" : "production"}`
    );
    for (const route of routes) {
      const hasLayout = route.routeChain.some((r) => r.layout);
      console.info(
        `  ${route.mode.toUpperCase().padEnd(4)} ${route.pattern}${hasLayout ? " + layout" : ""}`
      );
    }
    // Lazy import — build pipeline has native deps not available in compiled binaries
    const { writeDevFiles } = await import("./build/hydrate.ts");
    writeDevFiles(routes, { outDir: elyraDir, rootLayout: root.path });

    let instance = new Elysia({ name: instanceName, seed: resolvedPagesDir })
      .use(await staticPlugin({ assets: elyraDir, prefix: "/_bun_hmr_entry" }))
      .use(await staticPlugin());

    for (const route of routes) {
      instance = instance.use(createRoutePlugin(route, root));
    }

    return instance;
  }

  // ── Production ──────────────────────────────────────────────────────────
  if (!ctx) {
    throw new Error("[elyra] No pre-built assets found. Run `bun run build` first.");
  }
  const { root, routes } = loadProdRoutes(ctx);

  const embedded = ctx?.embedded;
  const clientDir = embedded ? "" : resolveClientDirFromArgv();

  await setupProdTemplate(embedded, clientDir);

  let instance = embedded
    ? buildEmbedInstance(instanceName, resolvedPagesDir, embedded)
    : await buildDiskInstance(instanceName, resolvedPagesDir, clientDir);

  for (const route of routes) {
    instance = instance.use(createRoutePlugin(route, root));
  }

  // Pre-render SSG routes with staticParams before the first request arrives.
  const ssgTargets = routes.filter((r) => r.mode === "ssg" && r.page?.staticParams);
  if (ssgTargets.length > 0) {
    instance = instance.onStart(async ({ server }) => {
      const origin = server?.url?.origin ?? "http://localhost:3000";
      console.log(`[elyra] Warming SSG cache for ${ssgTargets.length} route(s)…`);
      await warmSSGCache(ssgTargets, root, origin);
      console.log("[elyra] SSG warm-up complete.");
    });
  }

  return instance;
}
