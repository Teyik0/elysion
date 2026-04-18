import { t } from "elysia";
import { createRoute } from "../../../../src/client";
import { route as rootRoute } from "../root";

// Parent _route: declares parentFilter query with a default.
// The bug: when a child _route also declares query, findLast() in createRoutePlugin
// picks only the child schema — this parent schema is silently ignored at runtime.
export const route = createRoute({
  parent: rootRoute,
  query: t.Object({
    parentFilter: t.Optional(t.String({ default: "parent-default" })),
  }),
});
