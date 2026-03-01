import { resolve } from "node:path";
import { staticPlugin } from "@elysiajs/static";
import type { StaticOptions } from "@elysiajs/static/types";
import { Elysia } from "elysia";
import { buildClient, writeDevFiles } from "./build";
import { createRoutePlugin, scanPages } from "./router";

export interface ElysionProps {
  dev?: boolean;
  pagesDir?: string;
  staticOptions: StaticOptions<string>;
}

/**
 * Main Elyra plugin.
 *
 * Returns a callback plugin `(app: Elysia) => Elysia` instead of an Elysia
 * instance, so it integrates cleanly with the parent app.
 *
 * ## Dev mode (Bun native HMR)
 *
 * The user's server.ts must statically import `.elyra/index.html` and
 * register it in serve.routes — this is what triggers Bun's HTML bundler,
 * module graph, HMR WebSocket, and React Fast Refresh.
 *
 * ```ts
 * // server.ts
 * import elysionHtml from "../.elyra/index.html";
 *
 * new Elysia({ serve: { routes: { "/_bun_hmr_entry": elysionHtml } } })
 *   .use(await elyra({ ... }))
 *   .listen(3000);
 * ```
 *
 * Run `bun run scripts/generate.ts` before starting the server to generate
 * `.elyra/_hydrate.tsx`.  The `dev` package.json script handles this:
 * `"dev": "bun run scripts/generate.ts && bun --hot src/server.ts"`
 *
 * ## Production mode
 *
 * `elyra()` runs `Bun.build()` to produce `.elyra/client/index.html`
 * (the SSR template) plus hashed JS/CSS chunks.  No static import needed.
 */
export async function elyra({
  pagesDir,
  staticOptions,
  dev = process.env.NODE_ENV !== "production",
}: ElysionProps) {
  const cwd = process.cwd();
  const resolvedPagesDir = resolve(cwd, pagesDir ?? "/src/pages");

  const { root, routes } = await scanPages(resolvedPagesDir, dev);

  if (!root) {
    console.warn(
      "[elyra] No root.tsx found. Create a root.tsx in your pages directory " +
        "with a layout component."
    );
  }

  console.log(
    `[elyra] Configuration: ${routes.length} page(s) — ${dev ? "dev (Bun HMR)" : "production"}`
  );
  for (const route of routes) {
    const hasLayout = route.routeChain.some((r) => r.layout);
    console.log(
      `  ${route.mode.toUpperCase().padEnd(4)} ${route.pattern}${hasLayout ? " + layout" : ""}`
    );
  }

  // ── Dev: Bun native HMR ──────────────────────────────────────────────────
  if (dev) {
    const elysionDir = resolve(cwd, ".elyra");

    // Regenerate .elyra/_hydrate.tsx with the current page list.
    // Only writes when content changed so Bun --hot doesn't reload needlessly.
    // pagesDir is intentionally omitted: the bunfig.toml strip plugin handles
    // server-code stripping in the HTML bundler context, so _hydrate.tsx can
    // import source files directly without pre-transforming them here.
    writeDevFiles(routes, { outDir: elysionDir, rootPath: root?.path ?? null });

    return routes
      .map((route) => createRoutePlugin(route, root, dev))
      .reduce(
        (app, plugin) => app.use(plugin),
        new Elysia()
          .use(
            await staticPlugin({
              assets: resolve(cwd, ".elyra"),
              prefix: "/_bun_hmr_entry",
            })
          )
          .use(await staticPlugin(staticOptions))
      );
  }

  // ── Production ───────────────────────────────────────────────────────────
  const elysionDir = resolve(cwd, ".elyra");
  await buildClient(routes, { dev: false, outDir: elysionDir, rootPath: root?.path ?? null });

  return routes
    .map((route) => createRoutePlugin(route, root, dev))
    .reduce(
      (app, plugin) => app.use(plugin),
      new Elysia()
        .use(
          await staticPlugin({
            assets: resolve(cwd, ".elyra", "client"),
            prefix: "/_client",
          })
        )
        .use(await staticPlugin(staticOptions))
    );
}

import.meta.hot?.accept();
