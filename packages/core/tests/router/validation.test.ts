import { describe, expect, test } from "bun:test";
import type { RuntimeRoute } from "../../src/client";
import { collectRouteChainFromRoute, hasCycle, validateRouteChain } from "../../src/utils";

const NO_ROOT_LAYOUT_RE = /no root layout/i;
const MUST_INHERIT_FROM_ROOT_RE = /must inherit from root/i;
const CYCLE_RE = /cycle/i;

describe("route chain validation (pure functions)", () => {
  describe("collectRouteChainFromRoute", () => {
    test("returns empty array for undefined route", () => {
      expect(collectRouteChainFromRoute(undefined)).toEqual([]);
    });

    test("returns single route when no parent", () => {
      const route: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      expect(collectRouteChainFromRoute(route)).toEqual([route]);
    });

    test("returns chain in correct order (parent first)", () => {
      const root: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      const child: RuntimeRoute = { __type: "ELYSION_ROUTE", parent: root };
      const grandchild: RuntimeRoute = { __type: "ELYSION_ROUTE", parent: child };

      expect(collectRouteChainFromRoute(grandchild)).toEqual([root, child, grandchild]);
    });
  });

  describe("hasCycle", () => {
    test("returns false for route without parent", () => {
      const route: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      expect(hasCycle(route)).toBe(false);
    });

    test("returns false for valid chain", () => {
      const root: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      const child: RuntimeRoute = { __type: "ELYSION_ROUTE", parent: root };
      expect(hasCycle(child)).toBe(false);
    });

    test("returns true for direct self-cycle", () => {
      const route: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      route.parent = route;
      expect(hasCycle(route)).toBe(true);
    });

    test("returns true for indirect cycle A→B→A", () => {
      const routeA: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      const routeB: RuntimeRoute = { __type: "ELYSION_ROUTE", parent: routeA };
      routeA.parent = routeB;
      expect(hasCycle(routeA)).toBe(true);
      expect(hasCycle(routeB)).toBe(true);
    });
  });

  describe("validateRouteChain", () => {
    test("throws when root is null", () => {
      const chain: RuntimeRoute[] = [{ __type: "ELYSION_ROUTE" }];
      expect(() => validateRouteChain(chain, null)).toThrow(NO_ROOT_LAYOUT_RE);
    });

    test("throws when chain does not contain root", () => {
      const root: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      const otherRoute: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      const chain = [otherRoute];

      expect(() => validateRouteChain(chain, root)).toThrow(MUST_INHERIT_FROM_ROOT_RE);
    });

    test("succeeds when chain contains root", () => {
      const root: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      const child: RuntimeRoute = { __type: "ELYSION_ROUTE", parent: root };
      const chain = [root, child];

      expect(() => validateRouteChain(chain, root)).not.toThrow();
    });

    test("succeeds when level-3 page uses root directly (skips level-2)", () => {
      const root: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      const level3DirectRoot: RuntimeRoute = { __type: "ELYSION_ROUTE", parent: root };

      const chain = [root, level3DirectRoot];

      expect(() => validateRouteChain(chain, root)).not.toThrow();
    });

    test("throws when cycle is detected", () => {
      const root: RuntimeRoute = { __type: "ELYSION_ROUTE" };
      const cyclicRoute: RuntimeRoute = { __type: "ELYSION_ROUTE", parent: root };
      cyclicRoute.parent = cyclicRoute;

      const chain = [root, cyclicRoute];

      expect(() => validateRouteChain(chain, root)).toThrow(CYCLE_RE);
    });
  });
});
