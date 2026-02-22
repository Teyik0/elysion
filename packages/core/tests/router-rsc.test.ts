import { describe, expect, test } from "bun:test";
import { resolveMode } from "../src/router";
import {
  createClientAnalysis,
  createMockPage,
  createMockRouteChain,
  createServerAnalysis,
} from "./helpers/rsc";

describe("resolveMode — RSC detection", () => {
  test("returns 'rsc' for route with client analysis", () => {
    const page = createMockPage();
    const analysis = createClientAnalysis();
    const routeChain = createMockRouteChain();

    const mode = resolveMode(page, routeChain, analysis);

    expect(mode).toBe("rsc");
  });

  test("returns 'ssr' for route with server analysis and loader", () => {
    const page = createMockPage({
      loader: async () => ({ data: "test" }),
    });
    const analysis = createServerAnalysis();
    const routeChain = createMockRouteChain();

    const mode = resolveMode(page, routeChain, analysis);

    expect(mode).toBe("ssr");
  });

  test("returns 'ssg' for route with server analysis and no loader", () => {
    const page = createMockPage();
    const analysis = createServerAnalysis();
    const routeChain = createMockRouteChain();

    const mode = resolveMode(page, routeChain, analysis);

    expect(mode).toBe("ssg");
  });

  test("respects explicit mode over detection", () => {
    const page = createMockPage({
      _route: { __type: "ELYSION_ROUTE", mode: "ssg" },
    });
    const analysis = createClientAnalysis();
    const routeChain = createMockRouteChain();

    const mode = resolveMode(page, routeChain, analysis);

    expect(mode).toBe("ssg");
  });

  test("respects explicit 'rsc' mode even for server analysis", () => {
    const page = createMockPage({
      _route: { __type: "ELYSION_ROUTE", mode: "rsc" },
    });
    const analysis = createServerAnalysis();
    const routeChain = createMockRouteChain();

    const mode = resolveMode(page, routeChain, analysis);

    expect(mode).toBe("rsc");
  });
});
