import type { RuntimePage, RuntimeRoute } from "./client";

export function isElysionPage(value: unknown): value is RuntimePage {
  return (
    typeof value === "object" &&
    value !== null &&
    "__type" in value &&
    (value as { __type: unknown }).__type === "ELYSION_PAGE"
  );
}

export function isElysionRoute(value: unknown): value is RuntimeRoute {
  return (
    typeof value === "object" &&
    value !== null &&
    "__type" in value &&
    (value as { __type: unknown }).__type === "ELYSION_ROUTE"
  );
}

export function collectRouteChain(page: RuntimePage): RuntimeRoute[] {
  const chain: RuntimeRoute[] = [];
  let current: RuntimeRoute | undefined = page._route;

  while (current) {
    chain.unshift(current);
    current = current.parent;
  }

  return chain;
}
