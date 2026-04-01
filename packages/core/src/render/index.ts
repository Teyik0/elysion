import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import type { RootLayout } from "../router.ts";
import { assembleHTML, resolvePath, splitTemplate, streamToString } from "./assemble.ts";
import { isrCache, setISRCache, setSSGCache, ssgCache } from "./cache.ts";
import { buildElement } from "./element.tsx";
import { runLoaders } from "./loaders.ts";
import { buildHeadInjection, safeJson } from "./shell.ts";
import { getDevTemplate, getProductionTemplate } from "./template.ts";

// ── Re-exports (public API) ──────────────────────────────────────────────────
// biome-ignore lint/performance/noBarrelFile: acnowledged
export { type LoaderContext, streamToString } from "./assemble.ts";
export { buildElement } from "./element.tsx";
export { type LoaderResult, runLoaders } from "./loaders.ts";

// ── Types ────────────────────────────────────────────────────────────────────

import type { Context } from "elysia";
import { useLogger } from "evlog/elysia";
import type { ResolvedRoute } from "../router.ts";
import { IS_DEV } from "../runtime-env.ts";
import type { LoaderContext } from "./assemble.ts";
import { generateIndexHtml } from "./shell.ts";

interface RenderResult {
  headers: Record<string, string>;
  html: string;
}

// ── Shared render preparation ────────────────────────────────────────────────

interface PreparedRender {
  componentProps: Record<string, unknown>;
  element: ReactNode;
  headData: string;
  headers: Record<string, string>;
  template: string;
}

/**
 * Shared pipeline steps used by both `renderToHTML` (buffered) and `renderSSR`
 * (streaming). Runs loaders, builds props, head injection, resolves template,
 * and creates the React element.
 *
 * Returns the redirect Response directly when a loader redirects, so callers
 * never need try/catch for redirect handling.
 */
async function prepareRender(
  route: ResolvedRoute,
  ctx: Context,
  root: RootLayout
): Promise<PreparedRender | Response> {
  const loaderResult = await runLoaders(route, ctx, root.route);

  if (loaderResult.type === "redirect") {
    return loaderResult.response;
  }

  const { data, headers } = loaderResult;
  const componentProps = {
    ...data,
    params: ctx.params,
    query: ctx.query,
    path: ctx.path,
  };

  const headData = buildHeadInjection(route.page?.head?.(componentProps));

  const template = IS_DEV
    ? await getDevTemplate(new URL(ctx.request.url).origin)
    : (getProductionTemplate() ?? generateIndexHtml());

  const element = buildElement(route, componentProps, root.route);

  return { componentProps, element, headData, headers, template };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function renderForPath(
  route: ResolvedRoute,
  params: Record<string, string>,
  root: RootLayout,
  origin: string
): Promise<RenderResult> {
  const resolvedPath = resolvePath(route.pattern, params);
  return await renderToHTML(
    route,
    {
      params,
      query: {},
      request: new Request(`${origin}${resolvedPath}`),
      headers: {},
      cookie: {},
      redirect: (url, status = 302) => new Response(null, { status, headers: { Location: url } }),
      set: { headers: {} },
      path: resolvedPath,
    } as Context,
    root
  );
}

// ── Core pipeline ────────────────────────────────────────────────────────────

export async function renderToHTML(
  route: ResolvedRoute,
  ctx: Context,
  root: RootLayout
): Promise<RenderResult> {
  const prepared = await prepareRender(route, ctx, root);

  // Redirect — re-throw so callers like prerenderSSG / handleISR can catch it
  if (prepared instanceof Response) {
    throw prepared;
  }

  const { componentProps, element, headData, headers, template } = prepared;

  const stream = await renderToReadableStream(element);
  await stream.allReady;
  const reactHtml = await streamToString(stream);

  return {
    html: assembleHTML(template, headData, reactHtml, componentProps),
    headers,
  };
}

// ── Public render functions ──────────────────────────────────────────────────

export async function renderToStream(
  route: ResolvedRoute,
  ctx: Context,
  root: RootLayout
): Promise<ReadableStream | Response> {
  const response = await renderSSR(route, ctx, root);
  if (!response.ok) {
    return response;
  }
  return response.body ?? new ReadableStream();
}

export async function prerenderSSG(
  route: ResolvedRoute,
  params: Record<string, string>,
  root: RootLayout,
  origin = "http://localhost:3000"
): Promise<string> {
  const resolvedPath = resolvePath(route.pattern, params);

  const cached = ssgCache.get(resolvedPath);
  if (cached && !IS_DEV) {
    return cached;
  }

  const result = await renderForPath(route, params, root, origin);

  if (!IS_DEV) {
    setSSGCache(resolvedPath, result.html);
  }

  return result.html;
}

export async function renderSSR(
  route: ResolvedRoute,
  ctx: Context,
  root: RootLayout
): Promise<Response> {
  const loaderStart = Date.now();
  const prepared = await prepareRender(route, ctx, root);

  // Redirect — return directly as a Response
  if (prepared instanceof Response) {
    return prepared;
  }

  useLogger().set({
    furin: { render: "ssr", route: route.pattern, loader_ms: Date.now() - loaderStart },
  });

  const { componentProps, element, headData, headers, template } = prepared;

  // Split template around placeholders
  const { headPre, bodyPre, bodyPost } = splitTemplate(template);
  const dataScript = `<script id="__FURIN_DATA__" type="application/json">${safeJson(componentProps)}</script>`;

  // Start React render without awaiting allReady (streaming)
  const reactStream = await renderToReadableStream(element);

  // Pipe head + React stream + tail into a single ReadableStream
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  (async () => {
    await writer.write(enc.encode(headPre + headData + bodyPre));
    const reader = reactStream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      await writer.write(value);
    }
    await writer.write(enc.encode(dataScript + bodyPost));
    await writer.close();
  })().catch((err) => writer.abort(err));

  return new Response(readable, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      ...headers,
    },
  });
}

export async function handleISR(route: ResolvedRoute, ctx: Context, root: RootLayout) {
  const revalidate = route.page._route.revalidate ?? 60;
  const params = ctx.params ?? {};
  const cacheKey = resolvePath(route.pattern, params);

  const cached = isrCache.get(cacheKey);

  if (cached && !IS_DEV) {
    const age = Date.now() - cached.generatedAt;
    const isFresh = age < revalidate * 1000;

    if (!isFresh) {
      revalidateInBackground(route, params, cacheKey, revalidate, root, ctx);
    }

    ctx.set.headers["content-type"] = "text/html; charset=utf-8";
    ctx.set.headers["cache-control"] = isFresh
      ? `public, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`
      : "public, s-maxage=0, must-revalidate";

    useLogger().set({
      furin: { render: "isr", route: route.pattern, cache: "hit" },
    });

    return cached.html;
  }

  const renderStart = Date.now();
  const prepared = await prepareRender(route, ctx, root);

  // Redirect — return directly
  if (prepared instanceof Response) {
    return prepared;
  }

  const { componentProps, element, headData, template } = prepared;

  const stream = await renderToReadableStream(element);
  await stream.allReady;
  const reactHtml = await streamToString(stream);
  const html = assembleHTML(template, headData, reactHtml, componentProps);

  useLogger().set({
    furin: {
      render: "isr",
      route: route.pattern,
      cache: "miss",
      render_ms: Date.now() - renderStart,
    },
  });

  if (!IS_DEV) {
    setISRCache(cacheKey, { html, generatedAt: Date.now(), revalidate });
  }

  ctx.set.headers["content-type"] = "text/html; charset=utf-8";
  ctx.set.headers["cache-control"] =
    `public, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`;
  return html;
}

// ── SSG warm-up ──────────────────────────────────────────────────────────────

/** Maximum number of concurrent `prerenderSSG` calls during SSG warm-up. */
const SSG_WARM_CONCURRENCY = 4;

/**
 * Pre-renders all SSG routes that declare `staticParams` and populates the
 * in-memory cache before the first real request arrives.
 * Should be called from the Elysia `onStart` hook (production only).
 *
 * Uses a bounded worker pool (SSG_WARM_CONCURRENCY slots) so large sites
 * with many routes × param sets cannot exhaust memory or CPU during startup.
 * Failures are isolated per (route, params) pair and logged without aborting
 * the rest of the warm-up.
 */
export async function warmSSGCache(
  routes: ResolvedRoute[],
  root: RootLayout,
  origin: string
): Promise<void> {
  const targets = routes.filter((r) => r.mode === "ssg" && r.page.staticParams);
  console.log(`[furin] Warming SSG cache for ${targets.length} route(s)…`);

  // Collect all (route, params) render tasks, handling per-route errors early.
  const tasks: Array<() => Promise<void>> = [];
  for (const route of targets) {
    let paramSets: Record<string, string>[];
    try {
      paramSets = (await route.page.staticParams?.()) ?? [];
    } catch (err) {
      console.error(`[furin] SSG warm-up failed for ${route.pattern}:`, err);
      continue;
    }
    for (const params of paramSets) {
      tasks.push(async () => {
        try {
          await prerenderSSG(route, params, root, origin);
        } catch (err) {
          console.error(`[furin] SSG prerender failed for ${route.pattern}:`, err);
        }
      });
    }
  }

  if (tasks.length === 0) {
    return;
  }

  // Drain the task queue with a fixed-size worker pool.
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(SSG_WARM_CONCURRENCY, tasks.length) }, async () => {
    while (queue.length > 0) {
      await queue.shift()?.();
    }
  });
  await Promise.all(workers);
}

/** Tracks in-flight ISR revalidations to prevent thundering herd. */
const pendingRevalidations = new Set<string>();

function revalidateInBackground(
  route: ResolvedRoute,
  params: Record<string, string>,
  cacheKey: string,
  revalidate: number,
  root: RootLayout,
  originalCtx: LoaderContext
) {
  if (pendingRevalidations.has(cacheKey)) {
    return; // Already revalidating — skip duplicate work
  }
  pendingRevalidations.add(cacheKey);

  renderForPath(route, params, root, new URL(originalCtx.request.url).origin)
    .then((result) => {
      setISRCache(cacheKey, {
        html: result.html,
        generatedAt: Date.now(),
        revalidate,
      });
    })
    .catch((err: unknown) => {
      console.error("[furin] ISR background revalidation failed:", err);
    })
    .finally(() => {
      pendingRevalidations.delete(cacheKey);
    });
}
