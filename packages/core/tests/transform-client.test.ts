import { describe, expect, test } from "bun:test";
import MagicString from "magic-string";
import { deadCodeElimination, transformForClient } from "../src/plugin/transform-client";

// ---------------------------------------------------------------------------
// Top-level regex constants (satisfies lint/performance/useTopLevelRegex)
// ---------------------------------------------------------------------------
const LOADER_PROPERTY_RE = /\bloader\s*:/;
const IMPORT_DB_RE = /from\s+["']\.\/db["']/;
const IMPORT_RELATIVE_DB_RE = /from\s+["'][^"']*db["']/;
const IMPORT_FROM_DB_RE = /from ["']\.\/db["']/;

// ---------------------------------------------------------------------------
// Basic transformation
// ---------------------------------------------------------------------------

describe("transformForClient — basic", () => {
  test("code without server props is returned with removedServerCode=false", () => {
    const result = transformForClient("export const x = 1;", "test.tsx");

    expect(result.removedServerCode).toBe(false);
    expect(result.code).toContain("x = 1");
    expect(typeof result.code).toBe("string");
  });

  test("throws on unparseable code", () => {
    expect(() => transformForClient("<<<invalid>>>", "bad.tsx")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Server property removal — page()
// ---------------------------------------------------------------------------

describe("transformForClient — page() loader removal", () => {
  test("removes loader from page() call", () => {
    const input = `
      const result = page({
        loader: async () => ({ data: 1 }),
        component: (props) => null,
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.code).not.toMatch(LOADER_PROPERTY_RE);
    expect(result.code).toContain("component");
    expect(result.removedServerCode).toBe(true);
  });

  test("removes loader from export default page()", () => {
    const input = `
      export default page({
        loader: async () => ({ data: 1 }),
        component: (props) => null,
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.code).not.toMatch(LOADER_PROPERTY_RE);
    expect(result.code).toContain("component");
    expect(result.removedServerCode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Server property removal — createRoute()
// ---------------------------------------------------------------------------

describe("transformForClient — createRoute() loader removal", () => {
  test("removes loader from createRoute()", () => {
    const input = `
      const route = createRoute({
        loader: async () => ({ user: "test" }),
        mode: "ssr",
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.code).not.toMatch(LOADER_PROPERTY_RE);
    expect(result.code).toContain("mode");
    expect(result.removedServerCode).toBe(true);
  });

  test("removes loader from export default createRoute()", () => {
    const input = `
      export default createRoute({
        loader: async () => ({ user: "test" }),
        mode: "ssr",
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.code).not.toMatch(LOADER_PROPERTY_RE);
    expect(result.code).toContain("mode");
    expect(result.removedServerCode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Server property removal — route.page() (member expression)
// ---------------------------------------------------------------------------

describe("transformForClient — route.page() loader removal", () => {
  test("removes loader from route.page() member expression", () => {
    const input = `
      const route = createRoute({ mode: "ssr" });
      export default route.page({
        loader: async ({ user }) => ({ posts: [] }),
        component: ({ user, posts }) => null,
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.code).not.toMatch(LOADER_PROPERTY_RE);
    expect(result.code).toContain("component");
    expect(result.removedServerCode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dead code elimination
// ---------------------------------------------------------------------------

describe("transformForClient — dead code elimination", () => {
  test("import used only by loader is eliminated after loader removal", () => {
    const input = `
      import { getUser } from "./db";
      const route = createRoute({
        loader: async () => ({ user: getUser() }),
        mode: "ssr",
      });
    `;
    const result = transformForClient(input, "test.tsx");

    // getUser was only used in the loader → import should be removed
    expect(result.code).not.toMatch(IMPORT_DB_RE);
    expect(result.removedServerCode).toBe(true);
  });

  test("createRoute loader-only import removed when layout with JSX also exists", () => {
    const input = `
      import { queries } from "../../db";
      import { route as rootRoute } from "../root";
      export const route = createRoute({
        parent: rootRoute,
        loader: () => {
          const posts = queries.getPosts.all();
          return { posts };
        },
        layout: ({ children }) => <div>{children}</div>,
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.code).not.toMatch(IMPORT_RELATIVE_DB_RE);
    expect(result.removedServerCode).toBe(true);
  });

  test("route.page() loader-only import removed when component also exists", () => {
    const input = `
      import { queries } from "../../db";
      import { route } from "./route";
      export default route.page({
        loader: () => {
          const posts = queries.getPosts.all();
          return { posts };
        },
        component: ({ posts }) => <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>,
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.code).not.toMatch(IMPORT_RELATIVE_DB_RE);
    expect(result.removedServerCode).toBe(true);
  });

  test("import used by component is preserved after loader removal", () => {
    const input = `
      import { formatDate } from "./utils";
      export default page({
        loader: async () => ({ data: 1 }),
        component: (props) => formatDate(props.data),
      });
    `;
    const result = transformForClient(input, "test.tsx");

    // formatDate is used in component → import must survive
    expect(result.code).toContain("formatDate");
    expect(result.code).toContain("component");
    expect(result.removedServerCode).toBe(true);
  });

  test("removes only unused specifiers when some are still referenced", () => {
    // getUser only used in loader (removed) → should be stripped
    // formatDate used in component (kept) → must survive
    const input = `
      import { getUser, formatDate } from "./db";
      export default page({
        loader: async () => ({ user: getUser() }),
        component: (props) => formatDate(props.data),
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.removedServerCode).toBe(true);
    expect(result.code).not.toContain("getUser");
    expect(result.code).toContain("formatDate");
    // Import statement kept but without getUser specifier
    expect(result.code).toMatch(IMPORT_FROM_DB_RE);
  });
});

// ---------------------------------------------------------------------------
// Computed and quoted property keys
// ---------------------------------------------------------------------------

describe("transformForClient — property key variants", () => {
  test("does not remove computed property keys (computed: true)", () => {
    // `{ [serverOnlyKey]: fn }` — AST marks this as computed, must be preserved
    const input = `
      const serverOnlyKey = "loader";
      export default page({
        [serverOnlyKey]: async () => ({ data: 1 }),
        component: () => null,
      });
    `;
    const result = transformForClient(input, "test.tsx");

    // Computed key is NOT a server-only identifier reference → not removed
    expect(result.removedServerCode).toBe(false);
  });

  test("removes quoted string key 'loader'", () => {
    const input = `
      export default page({
        "loader": async () => ({ data: 1 }),
        component: () => null,
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.removedServerCode).toBe(true);
    expect(result.code).not.toMatch(LOADER_PROPERTY_RE);
    expect(result.code).toContain("component");
  });

  test("removes quoted string key 'query'", () => {
    const input = `
      export const route = createRoute({
        "query": { type: "object" },
        layout: ({ children }) => children,
      });
    `;
    const result = transformForClient(input, "test.tsx");

    expect(result.removedServerCode).toBe(true);
    expect(result.code).not.toContain('"query"');
    expect(result.code).toContain("layout");
  });
});

// ---------------------------------------------------------------------------
// Windows CRLF line endings
// ---------------------------------------------------------------------------

describe("transformForClient — Windows CRLF", () => {
  test("removes loader from code with CRLF line endings", () => {
    const input =
      "export default page({\r\n  loader: async () => ({ data: 1 }),\r\n  component: () => null,\r\n});";
    const result = transformForClient(input, "test.tsx");

    expect(result.removedServerCode).toBe(true);
    expect(result.code).not.toMatch(LOADER_PROPERTY_RE);
    expect(result.code).toContain("component");
  });
});

// ---------------------------------------------------------------------------
// deadCodeElimination — parse error guard
// ---------------------------------------------------------------------------

describe("deadCodeElimination — parse error recovery", () => {
  test("returns input unchanged when transformed code is unparseable", () => {
    // Feed deliberately invalid JS to DCE — it must not throw
    const broken = new MagicString("import { x } from 'y'; <<<INVALID>>>");
    const result = deadCodeElimination(broken);

    // Returns the same string unchanged (not null, not throws)
    expect(result.toString()).toBe("import { x } from 'y'; <<<INVALID>>>");
  });
});
