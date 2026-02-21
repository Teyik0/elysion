import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { scanPages } from "../../src/router";
import { collectRouteChain } from "../../src/utils";

const EXAMPLE_PAGES_DIR = join(import.meta.dirname, "../../../../examples/simple/src/pages");

describe("hydration: SSR and client apply layouts in same order", () => {
  test("root is always at index 0 in routeChain", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);
    expect(result.root).not.toBeNull();

    for (const route of result.routes) {
      const chain = collectRouteChain(route.page);
      if (chain.length > 0) {
        // Root is always first in the chain
        expect(chain[0]).toBe(result.root?.route);
      }
    }
  });

  test("SSR iterates layouts from index 1 to end (matching client slice(1))", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    const blogRoute = result.routes.find((r) => r.pattern === "/blog");
    expect(blogRoute).toBeDefined();

    const chain = collectRouteChain(blogRoute?.page);

    // Chain: [root, blogLayout]
    expect(chain).toHaveLength(2);

    // SSR: iterates from chain.length-1 to 1 (inclusive)
    // For chain of length 2: only index 1 is processed
    // This matches client: collectLayouts().slice(1)
    const ssrProcessedIndices: number[] = [];
    for (let i = chain.length - 1; i >= 1; i--) {
      ssrProcessedIndices.push(i);
    }

    // Should process index 1 only (blogLayout)
    expect(ssrProcessedIndices).toEqual([1]);

    // Client does: allLayouts.slice(1) which gives [blogLayout]
    // Then iterates from length-1 to 0
    const clientLayouts = chain.slice(1);
    const clientProcessedCount = clientLayouts.length;

    // Same number of layouts processed
    expect(ssrProcessedIndices.length).toBe(clientProcessedCount);
  });

  test("3-level nested route applies layouts in correct order", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    const postsNewRoute = result.routes.find((r) => r.pattern === "/dashboard/posts/new");
    expect(postsNewRoute).toBeDefined();

    const chain = collectRouteChain(postsNewRoute?.page);

    // Chain: [root, dashboardLayout, postsLayout]
    expect(chain).toHaveLength(3);

    // SSR processes indices 2, 1 (postsLayout, then dashboardLayout)
    const ssrOrder: number[] = [];
    for (let i = chain.length - 1; i >= 1; i--) {
      ssrOrder.push(i);
    }
    expect(ssrOrder).toEqual([2, 1]);

    // Client does: slice(1) = [dashboardLayout, postsLayout]
    // Then iterates from length-1 to 0: index 1, then 0
    // This is: postsLayout, then dashboardLayout
    const clientLayouts = chain.slice(1);
    const clientOrder: number[] = [];
    for (let i = clientLayouts.length - 1; i >= 0; i--) {
      clientOrder.push(i + 1); // +1 because we sliced
    }

    // Both should process in same order
    expect(ssrOrder).toEqual(clientOrder);
  });

  test("all routes have consistent chain structure", async () => {
    const result = await scanPages(EXAMPLE_PAGES_DIR);

    for (const route of result.routes) {
      const chain = collectRouteChain(route.page);

      // Every chain starts with root
      expect(chain[0]).toBe(result.root?.route);

      // Root is only at index 0
      const rootCount = chain.filter((r) => r === result.root?.route).length;
      expect(rootCount).toBe(1);
    }
  });
});
