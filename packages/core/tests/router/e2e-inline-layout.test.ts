import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { scanPages } from "../../src/router";
import { collectRouteChain } from "../../src/utils";

const EXAMPLE_PAGES_DIR = join(import.meta.dirname, "../../../../examples/simple/src/pages");

describe("E2E: route chain works without routeFilePaths", () => {
  test("scanPages correctly builds route chain for dashboard", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    expect(result.root).not.toBeNull();
    expect(result.routes.length).toBeGreaterThan(0);

    const dashboardRoute = result.routes.find((r) => r.pattern === "/dashboard");
    expect(dashboardRoute).toBeDefined();
    expect(dashboardRoute?.page).toBeDefined();

    const chain = collectRouteChain(dashboardRoute?.page);

    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[0]?.layout).toBeDefined();
    expect(chain[1]?.layout).toBeDefined();
  });

  test("scanPages handles nested layouts correctly", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    const blogRoute = result.routes.find((r) => r.pattern === "/blog");
    expect(blogRoute).toBeDefined();
    expect(blogRoute?.page).toBeDefined();

    const chain = collectRouteChain(blogRoute?.page);

    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[0]?.layout).toBeDefined();
    expect(chain[1]?.layout).toBeDefined();
  });

  test("scanPages handles deeply nested layouts (3 levels)", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    const postsNewRoute = result.routes.find((r) => r.pattern === "/dashboard/posts/new");
    expect(postsNewRoute).toBeDefined();
    expect(postsNewRoute?.page).toBeDefined();

    const chain = collectRouteChain(postsNewRoute?.page);

    expect(chain).toHaveLength(3);
    expect(chain[0]?.layout).toBeDefined();
    expect(chain[1]?.layout).toBeDefined();
    expect(chain[2]?.layout).toBeDefined();
  });

  test("all routes have root in their chain", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    for (const route of result.routes) {
      if (route.page) {
        const chain = collectRouteChain(route.page);
        const hasRoot = chain.some((r) => r === result.root?.route);
        expect(hasRoot, `Route ${route.pattern} should have root in chain`).toBe(true);
      }
    }
  });
});
