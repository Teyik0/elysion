import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { staticPlugin } from "@elysiajs/static";
import type { StaticOptions } from "@elysiajs/static/types";
import { type AnyElysia, Elysia } from "elysia";
import { buildClient, writeDevFiles } from "./build";
import { registerBunStripPlugin } from "./bun-strip-plugin";
import { type CssOptions, getCachedCss, setCssConfig } from "./css";
import { createRoutePlugin, scanPages } from "./router";

export interface ElysionProps {
  css?: CssOptions;
  dev?: boolean;
  pagesDir?: string;
  staticOptions: StaticOptions<string>;
}

async function buildExternalCss(cwd: string): Promise<void> {
  const result = await getCachedCss(cwd);
  if (!result || result.mode !== "external") return;

  const clientDir = resolve(cwd, ".elysion", "client");
  if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });
  await Bun.write(resolve(clientDir, "styles.css"), result.code);
  console.log("[elysion] CSS built: /_client/styles.css");
}

/**
 * Main Elysion plugin.
 *
 * Returns a callback plugin `(app: Elysia) => Elysia` instead of an Elysia
 * instance, so it can inject `/_bun_entry` into Bun's native `serve.routes`
 * before `listen()` is called.  The call-site is unchanged:
 *
 *   app.use(await elysion({ … }))
 *
 * In dev mode Bun's HTML bundler owns JS bundling, file watching, HMR
 * WebSocket, and React Refresh.  The server self-fetches /_bun_entry on the
 * first request to obtain the content-hashed <script> URLs for SSR injection.
 *
 * In production mode the standard Bun.build() pipeline is used.
 */
export async function elysion({
  pagesDir,
  staticOptions,
  dev = process.env.NODE_ENV !== "production",
  css,
}: ElysionProps): Promise<(app: AnyElysia) => AnyElysia> {
  const cwd = process.cwd();
  const resolvedPagesDir = resolve(cwd, pagesDir ?? "./src/pages");

  setCssConfig(css, dev);

  if (css?.input) {
    const result = await getCachedCss(cwd);
    if (result) {
      if (result.mode === "external") {
        await buildExternalCss(cwd);
      } else {
        console.log("[elysion] CSS inline mode enabled");
      }
    }
  }

  const { root, routes } = await scanPages(resolvedPagesDir, dev);

  if (!root) {
    console.warn(
      "[elysion] No root.tsx found. Create a root.tsx in your pages directory " +
        "with <html>, <head>, and <body> tags."
    );
  }

  console.log(`[elysion] Configuration: ${routes.length} page(s) — ${dev ? "dev (Bun HMR)" : "production"}`);
  for (const route of routes) {
    const hasLayout = route.routeChain.some((r) => r.layout);
    console.log(`  ${route.mode.toUpperCase().padEnd(4)} ${route.pattern}${hasLayout ? " + layout" : ""}`);
  }

  // ── Dev: Bun native HMR ──────────────────────────────────────────────────
  if (dev) {
    const elysionDir = resolve(cwd, ".elysion");

    // 1. Register the Bun build plugin that strips server-only code from pages
    //    and stubs elysia.  Must happen BEFORE the HTML import below so Bun
    //    uses the plugin when it first processes the HTML bundle.
    registerBunStripPlugin(resolvedPagesDir);

    // 2. Generate .elysion/_hydrate.tsx + .elysion/index.html
    writeDevFiles(routes, { outDir: elysionDir, rootPath: root?.path ?? null });

    // 3. Dynamically import the generated index.html so Bun:
    //    - Bundles _hydrate.tsx and all its page dependencies.
    //    - Sets up the HMR WebSocket and React Refresh.
    //    - Registers content-hashed chunk routes under /_bun/*.
    const htmlEntry = resolve(elysionDir, "index.html");
    const { default: htmlBundle } = await import(htmlEntry);

    const userStaticPlugin = await staticPlugin(staticOptions);

    const routePlugins = routes.map((route) =>
      createRoutePlugin(route, staticOptions, root, dev)
    );

    // 4. Return a callback plugin so we can inject htmlBundle into the parent
    //    Elysia instance's serve.routes before listen() calls Bun.serve().
    return function elysionDevPlugin(app: AnyElysia): AnyElysia {
      // Inject the HTML bundle into Bun's native routes.
      // Bun routes take priority over the fetch handler, so /_bun/* chunk
      // requests and the HMR WebSocket are handled by Bun, not Elysia.
      (app.config as Record<string, unknown>).serve ??= {};
      const serve = (app.config as { serve: Record<string, unknown> }).serve;
      serve.routes ??= {};
      (serve.routes as Record<string, unknown>)["/_bun_entry"] = htmlBundle;

      let result = app.use(userStaticPlugin);
      for (const plugin of routePlugins) {
        result = result.use(plugin);
      }
      return result;
    };
  }

  // ── Production ───────────────────────────────────────────────────────────
  const elysionDir = resolve(cwd, ".elysion");
  await buildClient(routes, { dev: false, outDir: elysionDir, rootPath: root?.path ?? null });

  const clientStaticPlugin = await staticPlugin({
    assets: resolve(cwd, ".elysion", "client"),
    prefix: "/_client",
  });
  const userStaticPlugin = await staticPlugin(staticOptions);
  const routePlugins = routes.map((route) =>
    createRoutePlugin(route, staticOptions, root, dev)
  );

  return function elysionProdPlugin(app: AnyElysia): AnyElysia {
    let result = app.use(clientStaticPlugin).use(userStaticPlugin);
    for (const plugin of routePlugins) {
      result = result.use(plugin);
    }
    return result;
  };
}

import.meta.hot.accept();
