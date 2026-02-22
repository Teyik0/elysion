import type { ReactNode } from "react";
import type { RuntimePage, RuntimeRoute } from "../../src/client";
import type { ClientManifest, ModuleAnalysis } from "../../src/rsc/types";

export function createMockPage(overrides: Partial<RuntimePage> = {}): RuntimePage {
  return {
    component: () => null as ReactNode,
    _route: { __type: "ELYSION_ROUTE", mode: undefined, ...overrides._route },
    ...overrides,
  } as RuntimePage;
}

export function createClientAnalysis(path = "/mock.tsx"): ModuleAnalysis {
  return {
    type: "client",
    exports: [{ name: "Component", type: "client" }],
    clientFeatures: ["useState"],
    path,
  };
}

export function createServerAnalysis(path = "/mock.tsx"): ModuleAnalysis {
  return {
    type: "server",
    exports: [],
    clientFeatures: [],
    path,
  };
}

export function createMockManifest(): ClientManifest {
  return {
    "/mock.tsx#Component": {
      id: "/mock.tsx#Component",
      name: "Component",
      chunks: ["Component.js"],
    },
  };
}

export function createMockRouteChain(): RuntimeRoute[] {
  return [];
}
