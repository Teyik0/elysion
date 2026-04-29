import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { join } from "node:path";
import { startProcess } from "./helpers/run-cli.ts";
import { createTmpApp, writeAppFile } from "./helpers/tmp-app.ts";

/** Matches `data-stamp="<digits>"` in ISR-rendered HTML. */
const STAMP_ATTR_RE = /data-stamp="(\d+)"/;

/**
 * Integration tests for HMR parent-child dependency edge cases.
 *
 * Each case targets a distinct scenario where a file change in one part of the
 * route hierarchy must (or must not) propagate to another part:
 *
 * #3 (P0): Edit child page `/blog/[slug].tsx` while the parent `/blog` has been
 *   served — the next request to the child must reflect the updated component.
 *
 * #4 (P0): Edit the parent `blog/_route.tsx` while a child request `/blog/hello`
 *   is in flight (or has just been served) — the next SSR response must embed the
 *   new layout and produce no "Invalid hook call" or dispatcher errors.
 *
 * #5 (P1): Editing the parent `_route.tsx` must propagate the updated layout to
 *   BOTH the parent route (`/blog`) AND the child route (`/blog/hello`) on their
 *   respective next SSR cycles — without a server restart.
 *
 * #7 (P2 — Known Limitation): Editing the loader code inside a child ISR page
 *   file does NOT immediately invalidate the dev ISR loader cache for that page.
 *   Page files are imported via the `?furin-server&t=<ts>` virtual namespace;
 *   Bun's workspace `onLoad` hook does NOT fire for this namespace, so
 *   `invalidateDevLoaderCacheBySource` is never called when a page file changes.
 *   The ISR loader cache entry survives until the `revalidate` window expires.
 *   The component markup DOES update (fresh module evaluation via `?t=<ts>`),
 *   but the loader-derived data remains stale.
 *   Fix: wire `fs.watch` on the pages directory to call
 *   `invalidateDevLoaderCacheBySource` when a page file changes.
 *
 * Out of scope:
 *   #6 (P1): Client-side SPA prefetch cache invalidation — requires browser
 *     automation (Playwright / Puppeteer) because `prefetchCache` lives in the
 *     browser process.
 *   #8 (P2): Hot-adding a brand-new page file at runtime — `scanPages` runs
 *     once at startup; the server must be restarted to discover new routes.
 */

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      srv.close(() => resolve((addr as { port: number }).port));
    });
    srv.on("error", reject);
  });
}

async function pollUntil(
  fn: () => Promise<boolean>,
  maxAttempts: number,
  delayMs: number
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await fn()) {
      return true;
    }
    await Bun.sleep(delayMs);
  }
  return false;
}

// ── Shared app fixture ─────────────────────────────────────────────────────
// All tests share one running server so startup cost is paid once.
// Tests are serial and build on each other's state (layout version bumps).

describe.serial("dev HMR — parent/child dependency edge cases", () => {
  const app = createTmpApp("cli-app");
  let port: number;
  let server: ReturnType<typeof startProcess>;

  // Root layout (minimal — only wraps content with a root marker).
  writeAppFile(
    app.path,
    "src/pages/root.tsx",
    [
      'import { createRoute } from "@teyik0/furin/client";',
      "",
      "export const route = createRoute({",
      '  layout: ({ children }) => <div data-root="true">{children}</div>,',
      "});",
    ].join("\n")
  );

  // Blog section: parent layout with a versioned marker.
  writeAppFile(
    app.path,
    "src/pages/blog/_route.tsx",
    [
      'import { createRoute } from "@teyik0/furin/client";',
      'import { route as rootRoute } from "../root";',
      "",
      "export const route = createRoute({",
      "  parent: rootRoute,",
      '  layout: ({ children }) => <nav data-blog-layout="blog-v1">{children}</nav>,',
      "});",
    ].join("\n")
  );

  // Blog listing page (parent route: /blog).
  writeAppFile(
    app.path,
    "src/pages/blog/index.tsx",
    [
      'import { route } from "./_route";',
      "",
      "export default route.page({",
      '  component: () => <main data-blog-listing="true">Blog listing</main>,',
      "});",
    ].join("\n")
  );

  // Blog post page (child route: /blog/[slug]).
  writeAppFile(
    app.path,
    "src/pages/blog/[slug].tsx",
    [
      'import { route } from "./_route";',
      "",
      "export default route.page({",
      "  component: () => (",
      '    <article data-post-version="post-v1">Blog post content</article>',
      "  ),",
      "});",
    ].join("\n")
  );

  // ISR page with timestamp loader — used only by test #7.
  writeAppFile(
    app.path,
    "src/pages/blog/isr-stamp.tsx",
    [
      'import { createRoute } from "@teyik0/furin/client";',
      'import { route as blogRoute } from "./_route";',
      "",
      "const isrStampRoute = createRoute({",
      "  parent: blogRoute,",
      '  mode: "isr",',
      "  revalidate: 60,",
      "  loader: async () => ({ stamp: Date.now() }),",
      "});",
      "",
      "export default isrStampRoute.page({",
      "  component: ({ stamp }) => (",
      "    <div data-stamp={String(stamp)}>ISR stamp: {stamp}</div>",
      "  ),",
      "});",
    ].join("\n")
  );

  // Home page — needed so the app boots without errors on /.
  writeAppFile(
    app.path,
    "src/pages/index.tsx",
    [
      'import { route as rootRoute } from "./root";',
      "",
      "export default rootRoute.page({",
      "  component: () => <main>Home</main>,",
      "});",
    ].join("\n")
  );

  beforeAll(async () => {
    port = await getFreePort();
    server = startProcess(["bun", "--hot", join(app.path, "src/server.ts")], {
      cwd: app.path,
      env: { PORT: String(port) },
    });

    const ready = await pollUntil(
      async () => {
        try {
          const r = await fetch(`http://localhost:${port}/blog`);
          return r.ok;
        } catch {
          return false;
        }
      },
      80,
      250
    );
    if (!ready) {
      throw new Error(`Server failed to start on port ${port}. stderr:\n${server.getStderr()}`);
    }
  }, 30_000);

  afterAll(() => {
    server?.kill();
    app.cleanup();
  });

  // ── #3 (P0) ───────────────────────────────────────────────────────────────

  /**
   * Editing `/blog/[slug].tsx` while the parent `/blog` has been served must
   * produce fresh child content on the next child request.
   *
   * Mechanism: SSR imports page modules via `?furin-server&t=<ts>`.  A new
   * timestamp is generated on each request, so Bun always evaluates the latest
   * on-disk file — no stale child component is possible after an edit.
   */
  test("#3 — editing /blog/[slug].tsx serves fresh child content on next child request", async () => {
    // Warm the parent route first (simulates user browsing /blog).
    const parentRes = await fetch(`http://localhost:${port}/blog`);
    expect(parentRes.status).toBe(200);
    const parentHtml = await parentRes.text();
    expect(parentHtml).toContain('data-blog-listing="true"');

    // Confirm child is on post-v1.
    const child1Res = await fetch(`http://localhost:${port}/blog/hello`);
    expect(child1Res.status).toBe(200);
    const child1Html = await child1Res.text();
    expect(child1Html).toContain('data-post-version="post-v1"');

    // Edit the child page — bump version to post-v2.
    writeAppFile(
      app.path,
      "src/pages/blog/[slug].tsx",
      [
        'import { route } from "./_route";',
        "",
        "export default route.page({",
        "  component: () => (",
        '    <article data-post-version="post-v2">Updated blog post</article>',
        "  ),",
        "});",
      ].join("\n")
    );

    // Poll until the child route reflects the edit.
    let childHtmlAfter = "";
    const updated = await pollUntil(
      async () => {
        const r = await fetch(`http://localhost:${port}/blog/hello`);
        childHtmlAfter = await r.text();
        return childHtmlAfter.includes('data-post-version="post-v2"');
      },
      40,
      250
    );

    expect(updated).toBe(true);
    expect(childHtmlAfter).toContain('data-post-version="post-v2"');
    expect(childHtmlAfter).not.toContain('data-post-version="post-v1"');

    const logs = server.getStdout() + server.getStderr();
    expect(logs).not.toContain("Invalid hook call");
  }, 20_000);

  // ── #4 (P0) ───────────────────────────────────────────────────────────────

  /**
   * Editing `/blog/_route.tsx` while a child page has just been served must
   * refresh the layout on the next child request without any React hook
   * violations or dispatcher errors.
   *
   * The dangerous scenario: the parent layout component changes identity (new
   * module evaluation), but child pages hold a stale import of `_route.tsx`.
   * Bun's `?t=<ts>` mechanism re-imports `_route.tsx` from disk on the next
   * child request, so both parent and child use the same, current React module
   * graph — hooks stay valid.
   */
  test("#4 — editing /blog/_route.tsx refreshes the layout on child requests, no Invalid hook call", async () => {
    // Confirm baseline: child is rendered inside blog-v1 layout.
    let html1 = "";
    const baselineOk = await pollUntil(
      async () => {
        const r = await fetch(`http://localhost:${port}/blog/hello`);
        html1 = await r.text();
        return r.ok && html1.includes('data-blog-layout="blog-v1"');
      },
      20,
      250
    );
    expect(baselineOk).toBe(true);
    expect(html1).toContain('data-blog-layout="blog-v1"');

    // Edit the parent layout — bump to blog-v2.
    writeAppFile(
      app.path,
      "src/pages/blog/_route.tsx",
      [
        'import { createRoute } from "@teyik0/furin/client";',
        'import { route as rootRoute } from "../root";',
        "",
        "export const route = createRoute({",
        "  parent: rootRoute,",
        '  layout: ({ children }) => <nav data-blog-layout="blog-v2">{children}</nav>,',
        "});",
      ].join("\n")
    );

    // Poll until the child route reflects blog-v2.
    let childHtmlAfter = "";
    const childUpdated = await pollUntil(
      async () => {
        const r = await fetch(`http://localhost:${port}/blog/hello`);
        childHtmlAfter = await r.text();
        return childHtmlAfter.includes('data-blog-layout="blog-v2"');
      },
      40,
      250
    );

    expect(childUpdated).toBe(true);
    expect(childHtmlAfter).toContain('data-blog-layout="blog-v2"');
    expect(childHtmlAfter).not.toContain('data-blog-layout="blog-v1"');

    // No React hook violation must appear in server logs.
    const logs = server.getStdout() + server.getStderr();
    expect(logs).not.toContain("Invalid hook call");
    expect(logs).not.toContain("dispatcher is null");
    expect(logs).not.toContain("resolveDispatcher().useState");
  }, 20_000);

  // ── #5 (P1) ───────────────────────────────────────────────────────────────

  /**
   * After editing the parent `_route.tsx`, BOTH the parent route (`/blog`) AND
   * the child route (`/blog/hello`) must embed the updated layout in their next
   * SSR response — without a server restart.
   *
   * This validates that layout inheritance propagates through the route chain
   * on every request, not just on the directly-requested route.
   */
  test("#5 — parent layout update propagates to both /blog and /blog/[slug] on next SSR", async () => {
    // Edit parent layout to blog-v3 (v2 was set in #4 above).
    writeAppFile(
      app.path,
      "src/pages/blog/_route.tsx",
      [
        'import { createRoute } from "@teyik0/furin/client";',
        'import { route as rootRoute } from "../root";',
        "",
        "export const route = createRoute({",
        "  parent: rootRoute,",
        '  layout: ({ children }) => <nav data-blog-layout="blog-v3">{children}</nav>,',
        "});",
      ].join("\n")
    );

    const logsBefore = server.getStdout() + server.getStderr();
    const listenCountBefore = (logsBefore.match(/listening on/g) ?? []).length;

    // Poll until BOTH the parent listing and a child post reflect blog-v3.
    let parentHtml = "";
    let childHtml = "";
    const bothUpdated = await pollUntil(
      async () => {
        const [pr, cr] = await Promise.all([
          fetch(`http://localhost:${port}/blog`),
          fetch(`http://localhost:${port}/blog/hello`),
        ]);
        parentHtml = await pr.text();
        childHtml = await cr.text();
        return (
          parentHtml.includes('data-blog-layout="blog-v3"') &&
          childHtml.includes('data-blog-layout="blog-v3"')
        );
      },
      40,
      250
    );

    expect(bothUpdated).toBe(true);
    expect(parentHtml).toContain('data-blog-layout="blog-v3"');
    expect(childHtml).toContain('data-blog-layout="blog-v3"');

    // Layout must NOT still show v2 or v1 in either response.
    expect(parentHtml).not.toContain('data-blog-layout="blog-v2"');
    expect(childHtml).not.toContain('data-blog-layout="blog-v2"');

    // No server restart must have occurred.
    const logsAfter = server.getStdout() + server.getStderr();
    const listenCountAfter = (logsAfter.match(/listening on/g) ?? []).length;
    expect(listenCountAfter).toBe(listenCountBefore);
  }, 20_000);

  // ── #7 (P2 — Known Limitation) ────────────────────────────────────────────

  /**
   * KNOWN LIMITATION: editing the loader inside an ISR page file does NOT
   * immediately invalidate the dev ISR loader cache for that page.
   *
   * Page files travel through the `?furin-server&t=<ts>` virtual namespace.
   * Bun's workspace `onLoad` hook is scoped to the `furin-server` namespace
   * and does NOT fire when a page file is modified on disk.  Therefore
   * `invalidateDevLoaderCacheBySource` is never called, and the cache entry
   * survives until the `revalidate` window (60 s in this fixture) expires.
   *
   * Observable symptoms:
   * — The component markup DOES update immediately (fresh `?t=<ts>` evaluation).
   * — The loader-derived `data-stamp` value stays identical to the first request.
   *
   * Expected fix: add `fs.watch` on the pages directory and call
   * `invalidateDevLoaderCacheBySource(filePath)` when a page file changes.
   * At that point the expectation here should change to `Number(stamp2) > Number(stamp1)`.
   */
  test("#7 (known limitation) — ISR loader cache is NOT immediately invalidated when an ISR page file is edited", async () => {
    // Step 1: warm the ISR loader cache for /blog/isr-stamp.
    let html1 = "";
    const ready = await pollUntil(
      async () => {
        try {
          const r = await fetch(`http://localhost:${port}/blog/isr-stamp`);
          if (!r.ok) {
            return false;
          }
          html1 = await r.text();
          return html1.includes("data-stamp");
        } catch {
          return false;
        }
      },
      40,
      250
    );
    expect(ready).toBe(true);

    const stamp1 = html1.match(STAMP_ATTR_RE)?.[1];
    expect(stamp1).toBeDefined();

    // Step 2: wait long enough for Date.now() to advance so that a fresh
    // loader call would produce a strictly greater stamp.
    await Bun.sleep(30);

    // Step 3: edit the page file — the new loader returns Date.now() + 99999,
    // which is unambiguously different from the original stamp.
    writeAppFile(
      app.path,
      "src/pages/blog/isr-stamp.tsx",
      [
        'import { createRoute } from "@teyik0/furin/client";',
        'import { route as blogRoute } from "./_route";',
        "",
        "const isrStampRoute = createRoute({",
        "  parent: blogRoute,",
        '  mode: "isr",',
        "  revalidate: 60,",
        "  // Loader intentionally returns a bumped stamp so a cache miss is detectable.",
        "  loader: async () => ({ stamp: Date.now() + 99999 }),",
        "});",
        "",
        "export default isrStampRoute.page({",
        "  component: ({ stamp }) => (",
        "    <div data-stamp={String(stamp)}>ISR stamp v2: {stamp}</div>",
        "  ),",
        "});",
      ].join("\n")
    );

    // Step 4: request #2 — within the revalidate window, so the cache should
    // still be live. Because workspace.onLoad never fired for this page file,
    // invalidateDevLoaderCacheBySource was not called, and the entry survives.
    const res2 = await fetch(`http://localhost:${port}/blog/isr-stamp`);
    expect(res2.status).toBe(200);
    const html2 = await res2.text();
    const stamp2 = html2.match(STAMP_ATTR_RE)?.[1];
    expect(stamp2).toBeDefined();

    // Known limitation: stamp2 equals stamp1 — the cache hit serves the stale
    // loader data. A cache miss would produce stamp2 ≥ stamp1 + 99999.
    expect(stamp2).toBe(stamp1);
  }, 25_000);
});
