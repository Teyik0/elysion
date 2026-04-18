import { t } from "elysia";
import { createRoute } from "../../../../../src/client";
import { route as parentRoute } from "../_route";

// Child _route: declares childFilter query with a default.
// createRoutePlugin uses findLast() so THIS schema wins, and the parent's
// parentFilter schema is dropped from the Elysia guard entirely.
export const route = createRoute({
  parent: parentRoute,
  query: t.Object({
    childFilter: t.Optional(t.String({ default: "child-default" })),
  }),
});
