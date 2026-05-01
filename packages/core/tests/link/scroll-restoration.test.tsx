/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Link, RouterProvider } from "../../src/link";
import type { ClientRoute } from "../../src/router-provider";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCROLL_STORAGE_KEY = "__furin_scroll__";

function makePage(content: string, linkTo?: string): React.ComponentType<Record<string, unknown>> {
  return () =>
    createElement(
      "div",
      { style: { height: "2000px" } },
      content,
      linkTo ? createElement(Link, { to: linkTo }, `Go to ${linkTo}`) : null
    );
}

function makeRoute(path: string, content: string, linkTo?: string): ClientRoute {
  const Page = makePage(content, linkTo);
  return {
    pattern: path,
    regex: new RegExp(`^${path.replace(/\*/g, ".*")}$`),
    load: async () => ({
      default: {
        component: Page,
        _route: { layout: null } as never,
      },
    }),
  };
}

function makeHtmlResponse(data: Record<string, unknown>, title: string): Response {
  const html = `<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body>
  <script id="__FURIN_DATA__" type="application/json">${JSON.stringify(data)}</script>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
}

interface RenderRouterResult {
  cleanup: () => void;
  container: HTMLDivElement;
  root: Root;
}

async function renderRouter(routes: ClientRoute[], initialPath = "/"): Promise<RenderRouterResult> {
  const doc = (globalThis as unknown as { document: Document }).document;
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container);

  const win = globalThis as unknown as Window & typeof globalThis;
  win.location.href = `http://localhost:3000${initialPath}`;
  win.history.replaceState(null, "", initialPath);

  let initialMatch:
    | (ClientRoute & {
        component: React.ComponentType<Record<string, unknown>>;
        pageRoute: unknown;
      })
    | null = null;
  const rawMatch = routes.find((r) => r.regex.test(initialPath));
  if (rawMatch) {
    const mod = await rawMatch.load();
    initialMatch = {
      ...rawMatch,
      component: mod.default.component,
      pageRoute: mod.default._route,
    };
  }

  flushSync(() => {
    root.render(
      createElement(RouterProvider, {
        routes,
        root: null,
        initialMatch,
        initialData: {},
        initialDigest: undefined,
        initialNotFound: undefined,
        autoRefresh: true,
        basePath: "",
        defaultPreload: "intent",
        defaultPreloadDelay: 50,
        defaultPreloadStaleTime: 30_000,
        prefetchCacheSize: 50,
      } as any)
    );
  });

  return {
    container,
    root,
    cleanup: () => {
      flushSync(() => {
        root.unmount();
      });
      container.remove();
      sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("scroll restoration on browser back", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalScrollY: PropertyDescriptor | undefined;
  let originalScrollTo: typeof window.scrollTo;
  let scrollPositions: Array<{ top: number; behavior?: ScrollBehavior }> = [];
  let currentScrollY = 0;

  beforeEach(() => {
    const win = globalThis as unknown as Window & typeof globalThis;
    originalFetch = globalThis.fetch;
    originalScrollY = Object.getOwnPropertyDescriptor(win, "scrollY");
    originalScrollTo = win.scrollTo;
    scrollPositions = [];
    currentScrollY = 0;

    // Mock sessionStorage to avoid happy-dom quirks
    const storage: Record<string, string> = {};
    Object.defineProperty(win, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
      },
    });

    // Mock window.scrollY as a mutable getter
    Object.defineProperty(win, "scrollY", {
      configurable: true,
      get: () => currentScrollY,
    });

    // Mock window.scrollTo to capture calls
    win.scrollTo = mock((options: ScrollToOptions | number, _y?: number) => {
      if (typeof options === "object") {
        scrollPositions.push({ top: options.top ?? 0, behavior: options.behavior });
        currentScrollY = options.top ?? 0;
      } else if (typeof options === "number" && typeof _y === "number") {
        scrollPositions.push({ top: _y });
        currentScrollY = _y;
      }
    }) as typeof win.scrollTo;

    // Mock fetch to return valid HTML with loader data
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = new URL(
        input.toString(),
        (globalThis as unknown as Window & typeof globalThis).location.origin
      );
      const path = url.pathname;

      if (path === "/page-a") {
        return makeHtmlResponse({ message: "page-a" }, "Page A");
      }
      if (path === "/page-b") {
        return makeHtmlResponse({ message: "page-b" }, "Page B");
      }
      if (path === "/page-c") {
        return makeHtmlResponse({ message: "page-c" }, "Page C");
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    const win = globalThis as unknown as Window & typeof globalThis;
    globalThis.fetch = originalFetch;

    if (originalScrollY) {
      Object.defineProperty(win, "scrollY", originalScrollY);
    } else {
      // biome-ignore lint/performance/noDelete: restoring original descriptor
      delete (win as { scrollY?: number }).scrollY;
    }

    win.scrollTo = originalScrollTo;
  });

  test("restores scroll position on browser back button", async () => {
    const routes = [makeRoute("/page-a", "Page A", "/page-b"), makeRoute("/page-b", "Page B")];
    const { cleanup, container } = await renderRouter(routes, "/page-a");

    // 1. Scroll down on Page A
    currentScrollY = 500;

    const win = globalThis as unknown as Window & typeof globalThis;

    // 2. Click Link to Page B (this should save scroll position before pushState)
    const linkB = container.querySelector('a[href="/page-b"]') as HTMLAnchorElement;
    expect(linkB).not.toBeNull();

    linkB.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Wait for async navigation
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3. Verify we navigated to Page B (scroll should be reset to top)
    expect(win.location.pathname).toBe("/page-b");
    expect(currentScrollY).toBe(0);

    // 4. Simulate browser back button
    win.history.back();

    // Wait for async popstate handler
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 5. Verify we're back on Page A and scroll is restored
    expect(win.location.pathname).toBe("/page-a");
    expect(currentScrollY).toBe(500);

    cleanup();
  });

  test("scrolls to top on forward navigation by default", async () => {
    const win = globalThis as unknown as Window & typeof globalThis;
    const routes = [makeRoute("/page-a", "Page A", "/page-b"), makeRoute("/page-b", "Page B")];
    const { cleanup, container } = await renderRouter(routes, "/page-a");

    currentScrollY = 300;

    const linkB = container.querySelector('a[href="/page-b"]') as HTMLAnchorElement;
    linkB.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(win.location.pathname).toBe("/page-b");
    expect(currentScrollY).toBe(0);

    cleanup();
  });

  test("preserves scroll position across history entry lifecycle", async () => {
    const win = globalThis as unknown as Window & typeof globalThis;
    const routes = [
      makeRoute("/page-a", "Page A", "/page-b"),
      makeRoute("/page-b", "Page B", "/page-c"),
      makeRoute("/page-c", "Page C"),
    ];
    const { cleanup, container } = await renderRouter(routes, "/page-a");

    // Navigate A -> B (scroll 100)
    currentScrollY = 100;
    const linkB = container.querySelector('a[href="/page-b"]') as HTMLAnchorElement;
    linkB.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Scroll down on Page B to 200
    currentScrollY = 200;

    // Navigate B -> C
    const linkC = container.querySelector('a[href="/page-c"]') as HTMLAnchorElement;
    linkC.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(win.location.pathname).toBe("/page-c");

    // Back to B
    win.history.back();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(win.location.pathname).toBe("/page-b");
    expect(currentScrollY).toBe(200);

    // Back to A
    win.history.back();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(win.location.pathname).toBe("/page-a");
    expect(currentScrollY).toBe(100); // Position when we left A

    cleanup();
  });
});
