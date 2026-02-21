import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { scanPages } from "../../src/router";
import { collectRouteChain } from "../../src/utils";

const EXAMPLE_PAGES_DIR = join(import.meta.dirname, "../../../../examples/simple/src/pages");

describe("route chain contains layouts (no routeFilePaths needed)", () => {
  test("page._route contains the page's layout", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    const dashboardRoute = result.routes.find((r) => r.pattern === "/dashboard");
    expect(dashboardRoute).toBeDefined();

    const page = dashboardRoute?.page;
    expect(page).toBeDefined();
    expect(page?._route).toBeDefined();
    expect(page?._route?.layout).toBeDefined();
  });

  test("page._route.parent contains the parent layout (root)", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    const dashboardRoute = result.routes.find((r) => r.pattern === "/dashboard");
    const page = dashboardRoute?.page;

    expect(page?._route?.parent).toBeDefined();
    expect(page?._route?.parent?.layout).toBeDefined();
  });

  test("collectRouteChain returns all layouts in order", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    const dashboardRoute = result.routes.find((r) => r.pattern === "/dashboard");
    const page = dashboardRoute?.page;

    const chain = collectRouteChain(page);

    expect(chain).toHaveLength(2);
    expect(chain[0]?.layout).toBeDefined();
    expect(chain[1]?.layout).toBeDefined();
  });

  test("deeply nested route chain (3 levels)", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    const postsNewRoute = result.routes.find((r) => r.pattern === "/dashboard/posts/new");
    const page = postsNewRoute?.page;

    const chain = collectRouteChain(page);

    expect(chain).toHaveLength(3);
    expect(chain[0]?.layout).toBeDefined();
    expect(chain[1]?.layout).toBeDefined();
    expect(chain[2]?.layout).toBeDefined();
  });

  test("root route is in every page's chain", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    for (const route of result.routes) {
      const chain = collectRouteChain(route.page);
      const hasRoot = chain.some((r) => r === result.root?.route);
      expect(hasRoot, `Route ${route.pattern} should have root in chain`).toBe(true);
    }
  });
});
