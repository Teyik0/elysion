import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Elysia } from "elysia";
import { ssgCache } from "../../src/render/cache";
import { setProductionTemplateContent } from "../../src/render/template";
import { createRoutePlugin, scanPages } from "../../src/router";
import { __setDevMode, IS_DEV } from "../../src/runtime-env";

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures/pages");

async function getRoute(pattern: string) {
  const result = await scanPages(FIXTURES_DIR);
  const route = result.routes.find((r) => r.pattern === pattern);
  if (!route) {
    throw new Error(`Route ${pattern} not found`);
  }
  return { route, root: result.root };
}

describe("createRoutePlugin", () => {
  test("creates Elysia instance for SSG route", async () => {
    const { route, root } = await getRoute("/ssg-page");

    const plugin = createRoutePlugin(route, root);

    expect(plugin).toBeDefined();
    expect(typeof plugin.use).toBe("function");
    expect(typeof plugin.get).toBe("function");
  });

  test("creates Elysia instance for SSR route", async () => {
    const { route, root } = await getRoute("/ssr-page");

    const plugin = createRoutePlugin(route, root);

    expect(plugin).toBeDefined();
    expect(typeof plugin.use).toBe("function");
  });

  test("creates Elysia instance for ISR route", async () => {
    const { route, root } = await getRoute("/isr-page");

    const plugin = createRoutePlugin(route, root);

    expect(plugin).toBeDefined();
    expect(typeof plugin.use).toBe("function");
  });

  test("creates Elysia instance for route with loader", async () => {
    const { route, root } = await getRoute("/with-loader");

    const plugin = createRoutePlugin(route, root);

    expect(plugin).toBeDefined();
  });

  test("creates Elysia instance for nested route", async () => {
    const { route, root } = await getRoute("/nested/deep");

    const plugin = createRoutePlugin(route, root);

    expect(plugin).toBeDefined();
  });

  test("works with root layout", async () => {
    const { route, root } = await getRoute("/ssg-page");

    const plugin = createRoutePlugin(route, root);

    expect(plugin).toBeDefined();
  });

  test("handles dev mode", async () => {
    const originalDevMode = IS_DEV;
    __setDevMode(true);
    try {
      const { route, root } = await getRoute("/ssg-page");

      const plugin = createRoutePlugin(route, root);

      expect(plugin).toBeDefined();
      expect(typeof plugin.use).toBe("function");
    } finally {
      __setDevMode(originalDevMode);
    }
  });

  test("SSG handler serves cached HTML and returns 200", async () => {
    const { route, root } = await getRoute("/ssg-page");
    // Pre-seed cache and disable dev mode so the cached entry is served without a live server.
    __setDevMode(false);
    setProductionTemplateContent(
      "<html><head><!--ssr-head--></head><body><!--ssr-outlet--></body></html>"
    );
    ssgCache.set("/ssg-page", { html: "<html>cached-ssg</html>", cachedAt: 111 });
    try {
      const app = new Elysia().use(createRoutePlugin(route, root));
      const res = await app.handle(new Request("http://localhost/ssg-page"));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("<html>cached-ssg</html>");
    } finally {
      __setDevMode(true);
      ssgCache.clear();
    }
  });

  test("SSG handler returns ETag when buildId is provided", async () => {
    const { route, root } = await getRoute("/ssg-page");
    __setDevMode(false);
    setProductionTemplateContent("<html><!--ssr-head--><body><!--ssr-outlet--></body></html>");
    ssgCache.set("/ssg-page", { html: "<html>cached</html>", cachedAt: 999 });
    try {
      const app = new Elysia().use(createRoutePlugin(route, root, "build-xyz"));
      const res = await app.handle(new Request("http://localhost/ssg-page"));
      expect(res.status).toBe(200);
      expect(res.headers.get("etag")).toBe('"build-xyz:999"');
    } finally {
      __setDevMode(true);
      ssgCache.clear();
    }
  });

  test("SSG handler returns 304 when If-None-Match matches ETag", async () => {
    const { route, root } = await getRoute("/ssg-page");
    __setDevMode(false);
    setProductionTemplateContent("<html><!--ssr-head--><body><!--ssr-outlet--></body></html>");
    ssgCache.set("/ssg-page", { html: "<html>cached</html>", cachedAt: 555 });
    try {
      const app = new Elysia().use(createRoutePlugin(route, root, "build-abc"));
      const res = await app.handle(
        new Request("http://localhost/ssg-page", {
          headers: { "if-none-match": '"build-abc:555"' },
        })
      );
      expect(res.status).toBe(304);
    } finally {
      __setDevMode(true);
      ssgCache.clear();
    }
  });
});
