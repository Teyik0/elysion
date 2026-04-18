/**
 * Proves that calling useLogger() from evlog/elysia inside a loader crashes
 * during ISR background revalidation and SSG pre-renders.
 *
 * Both code paths go through renderForPath() which creates a synthetic
 * request context — no Elysia evlog plugin runs, so the AsyncLocalStorage
 * is empty and useLogger() throws.
 *
 * NOTE: intentionally does NOT mock evlog/elysia so the real throw is visible.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { useLogger } from "evlog/elysia";
import { prerenderSSG } from "../src/render";
import { __resetCacheState } from "../src/render/cache";
import type { ResolvedRoute } from "../src/router";
import { scanPages } from "../src/router";
import { __setDevMode } from "../src/runtime-env";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures/pages");

async function getRoute(pattern: string): Promise<ResolvedRoute> {
  const result = await scanPages(FIXTURES_DIR);
  const route = result.routes.find((r) => r.pattern === pattern);
  if (!route) {
    throw new Error(`Route ${pattern} not found`);
  }
  return route;
}

async function getRoot() {
  const result = await scanPages(FIXTURES_DIR);
  return result.root;
}

beforeAll(() => __setDevMode(false));
afterAll(() => __setDevMode(true));
afterEach(() => __resetCacheState());

describe("useLogger() in loaders — synthetic render context (no evlog ALS)", () => {
  test("useLogger() throws when called outside an evlog request context", () => {
    // Root cause: evlog's AsyncLocalStorage is empty outside of a real Elysia
    // request handled by the evlog() plugin. Any call to useLogger() throws.
    expect(() => useLogger()).toThrow(
      "[evlog] useLogger() was called outside of an evlog plugin context"
    );
  });

  test("prerenderSSG propagates the throw when loader calls useLogger()", async () => {
    // prerenderSSG → renderForPath → prepareRender → runLoaders
    // renderForPath builds a synthetic Context that never goes through
    // Elysia's derive chain — evlog's ALS is empty for the whole subtree.
    //
    // ISR background revalidation (revalidateInBackground) uses the exact
    // same renderForPath() call, so it hits the identical throw — except
    // it is caught internally and logged as a console.error instead of
    // propagating, leaving the ISR cache stale permanently.
    const base = await getRoute("/isr-page");
    const root = await getRoot();

    const routeWithUseLogger: ResolvedRoute = {
      ...base,
      page: {
        ...base.page,
        loader: () => {
          useLogger().set({ action: "test" });
          return {};
        },
      },
    };

    expect(prerenderSSG(routeWithUseLogger, {}, root, "http://localhost")).rejects.toThrow(
      "[evlog] useLogger() was called outside of an evlog plugin context"
    );
  });
});
