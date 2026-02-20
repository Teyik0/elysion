import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTransformedModule } from "../../src/hmr/watcher";

// ---------------------------------------------------------------------------
// Temp directory setup
// A fresh directory tree is created before each test and torn down after.
// ---------------------------------------------------------------------------
const TMP_BASE = join(tmpdir(), "elysion-watcher-tests");
const SRC_DIR = TMP_BASE;
const PAGES_DIR = join(TMP_BASE, "pages");

/** Write a .tsx file inside the temp pages directory and return its full path. */
async function writePage(name: string, content: string): Promise<string> {
  const filePath = join(PAGES_DIR, name);
  await Bun.write(filePath, content);
  return filePath;
}

beforeEach(() => {
  mkdirSync(PAGES_DIR, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TMP_BASE, { recursive: true, force: true });
  } catch {
    // Cleanup errors don't fail the test
  }
});

// ---------------------------------------------------------------------------
// getTransformedModule — basic functionality
// Each call reads from disk and transforms fresh (no in-process cache).
// ---------------------------------------------------------------------------
describe("getTransformedModule — basic functionality", () => {
  test("transforms a real file and returns a non-empty JS string", async () => {
    const filePath = await writePage("index.tsx", "export const App = () => null;");
    const result = await getTransformedModule(filePath, SRC_DIR, PAGES_DIR);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("two calls with the same file return equal content", async () => {
    const filePath = await writePage("double.tsx", "export const x = 1;");
    const first = await getTransformedModule(filePath, SRC_DIR, PAGES_DIR);
    const second = await getTransformedModule(filePath, SRC_DIR, PAGES_DIR);
    expect(first).toEqual(second);
  });
});

// ---------------------------------------------------------------------------
// getTransformedModule — output content
// The transformed code must satisfy the contracts the client runtime expects.
// ---------------------------------------------------------------------------
describe("getTransformedModule — output content", () => {
  test("output contains the HMR $RefreshReg$ wrapper", async () => {
    const filePath = await writePage("hmr.tsx", "export const App = () => null;");
    const result = await getTransformedModule(filePath, SRC_DIR, PAGES_DIR);
    expect(result).toContain("$RefreshReg$");
  });

  test("output contains injected globals (window.React)", async () => {
    const filePath = await writePage("globals.tsx", "export const x = 1;");
    const result = await getTransformedModule(filePath, SRC_DIR, PAGES_DIR);
    expect(result).toContain("window.React");
  });

  test("module ID in output is derived from the path relative to srcDir", async () => {
    const filePath = await writePage("about.tsx", "export const x = 1;");
    const result = await getTransformedModule(filePath, SRC_DIR, PAGES_DIR);
    // srcDir = TMP_BASE, file = TMP_BASE/pages/about.tsx
    // relative path from srcDir = pages/about.tsx
    // expected module ID = /_modules/src/pages/about.tsx
    expect(result).toContain("/_modules/src/pages/about.tsx");
  });
});

// ---------------------------------------------------------------------------
// getTransformedModule — error cases
// ---------------------------------------------------------------------------
describe("getTransformedModule — error cases", () => {
  test("throws with a descriptive message for a missing file", () => {
    expect(getTransformedModule("/nonexistent/file.tsx", SRC_DIR, PAGES_DIR)).rejects.toThrow(
      "File not found"
    );
  });
});
