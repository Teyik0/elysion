import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildApp } from "../src/build";
import { generateCompileEntry } from "../src/build/compile-entry";
import { createTmpApp, removeAppPath } from "./helpers/tmp-app";

const tmpApps: Array<{ cleanup: () => void }> = [];

function rememberTmpApp<T extends { cleanup: () => void }>(app: T): T {
  tmpApps.push(app);
  return app;
}

afterEach(() => {
  while (tmpApps.length > 0) {
    tmpApps.pop()?.cleanup();
  }
});

describe.serial("compile: embed", () => {
  test('buildApp({ compile: "embed" }) without serverEntry throws a clear error', async () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));
    removeAppPath(app.path, "src/server.ts");

    await expect(buildApp({ rootDir: app.path, target: "bun", compile: "embed" })).rejects.toThrow(
      "compile"
    );
  });

  test('buildApp({ compile: "embed" }) writes a single server binary', async () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));

    const result = await buildApp({ rootDir: app.path, target: "bun", compile: "embed" });

    const bunManifest = result.targets.bun;
    expect(bunManifest).toBeDefined();
    const targetDir = join(app.path, bunManifest?.targetDir ?? "");
    const serverBin = existsSync(join(targetDir, "server"))
      ? join(targetDir, "server")
      : join(targetDir, "server.exe");

    expect(existsSync(serverBin)).toBe(true);
    expect(bunManifest?.serverPath).not.toBeNull();
  });

  test("generateCompileEntry with embed produces file imports and __setCompileContext", () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));

    // Create a fake clientDir with some assets
    const clientDir = join(app.path, "fake-client");
    mkdirSync(clientDir, { recursive: true });
    writeFileSync(join(clientDir, "index.html"), "<html></html>");
    writeFileSync(join(clientDir, "chunk-abc.js"), "console.log()");

    const entryPath = generateCompileEntry({
      rootPath: join(app.path, "src/pages/root.tsx"),
      pagePaths: [join(app.path, "src/pages/index.tsx")],
      serverEntry: join(app.path, "src/server.ts"),
      outDir: app.path,
      embed: { clientDir },
    });

    expect(existsSync(entryPath)).toBe(true);
    const content = readFileSync(entryPath, "utf8");

    // Must use Bun's native embed import attribute
    expect(content).toContain('with { type: "file" }');
    // Must call __setCompileContext (not the old registerEmbeddedApp)
    expect(content).toContain("__setCompileContext");
    // Must contain embedded block
    expect(content).toContain("embedded:");
    // Must contain modules block
    expect(content).toContain("modules:");
    // Must dynamically import the server entry
    expect(content).toContain("import(");
  });

  test("generateCompileEntry without embed does not contain embedded block", () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));

    const entryPath = generateCompileEntry({
      rootPath: join(app.path, "src/pages/root.tsx"),
      pagePaths: [join(app.path, "src/pages/index.tsx")],
      serverEntry: join(app.path, "src/server.ts"),
      outDir: app.path,
    });

    const content = readFileSync(entryPath, "utf8");

    expect(content).toContain("__setCompileContext");
    expect(content).toContain("modules:");
    expect(content).not.toContain("embedded:");
    expect(content).not.toContain('with { type: "file" }');
  });

  test("generateCompileEntry with embed throws if clientDir does not exist", () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));

    expect(() =>
      generateCompileEntry({
        rootPath: join(app.path, "src/pages/root.tsx"),
        pagePaths: [],
        serverEntry: join(app.path, "src/server.ts"),
        outDir: app.path,
        embed: { clientDir: join(app.path, "nonexistent") },
      })
    ).toThrow("Client directory not found");
  });
});
