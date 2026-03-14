import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type BuildManifest, buildApp, type TargetBuildManifest } from "../src/build/index.ts";
import { runCli } from "./helpers/run-cli.ts";
import { createTmpApp, removeAppPath, writeAppFile } from "./helpers/tmp-app.ts";

const tmpApps: Array<{ cleanup: () => void }> = [];

function rememberTmpApp<T extends { cleanup: () => void }>(app: T): T {
  tmpApps.push(app);
  return app;
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

afterEach(() => {
  while (tmpApps.length > 0) {
    tmpApps.pop()?.cleanup();
  }
});

describe.serial("CLI/build Bun feature", () => {
  test("buildApp({ target: 'bun' }) writes manifests and built client assets", async () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));

    const result = await buildApp({
      rootDir: app.path,
      target: "bun",
    });

    expect(result.targets.bun).toBeDefined();
    expect(existsSync(join(app.path, ".elyra/build/manifest.json"))).toBe(true);
    expect(existsSync(join(app.path, ".elyra/build/bun/manifest.json"))).toBe(true);
    expect(existsSync(join(app.path, ".elyra/build/bun/client/index.html"))).toBe(true);
  });

  test("CLI build --target bun succeeds and writes expected manifest fields", () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));

    const result = runCli(["build", "--target", "bun"], { cwd: app.path });

    expect(result.exitCode).toBe(0);

    const manifest = readJsonFile<BuildManifest>(join(app.path, ".elyra/build/manifest.json"));
    const targetManifest = readJsonFile<TargetBuildManifest>(
      join(app.path, ".elyra/build/bun/manifest.json")
    );

    expect(manifest.rootPath).toBe("src/pages/root.tsx");
    expect(manifest.serverEntry).toBe("src/server.ts");
    expect(
      manifest.routes.some((route) => route.pattern === "/blog/:slug" && route.hasStaticParams)
    ).toBe(true);
    expect(targetManifest.targetDir).toBe(".elyra/build/bun");
    expect(targetManifest.clientDir).toBe(".elyra/build/bun/client");
    expect(targetManifest.templatePath).toBe(".elyra/build/bun/client/index.html");
  });

  test("buildApp() rejects apps without a root.tsx layout", () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));
    removeAppPath(app.path, "src/pages/root.tsx");
    writeAppFile(
      app.path,
      "src/pages/index.tsx",
      [
        'import { createRoute } from "elyra/client";',
        "const route = createRoute({ mode: 'ssg' });",
        "export default route.page({ component: () => <main>No root</main> });",
      ].join("\n")
    );
    writeAppFile(
      app.path,
      "src/pages/blog/[slug].tsx",
      [
        'import { createRoute } from "elyra/client";',
        "const route = createRoute({ mode: 'ssg' });",
        "export default route.page({",
        "  staticParams: () => [{ slug: 'hello-world' }],",
        "  component: () => <article>No root blog</article>,",
        "});",
      ].join("\n")
    );

    expect(buildApp({ rootDir: app.path, target: "bun" })).rejects.toThrow();
  });

  test("CLI build rejects unsupported targets with a non-zero exit code", () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));

    const result = runCli(["build", "--target", "vercel"], { cwd: app.path });

    expect(result.exitCode).toBeGreaterThan(0);
    expect(result.stderr + result.stdout).toContain("planned but not implemented");
  });

  test("CLI build rejects invalid target values", () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));

    const result = runCli(["build", "--target", "wat"], { cwd: app.path });

    expect(result.exitCode).toBeGreaterThan(0);
    expect(result.stderr + result.stdout).toContain('Unsupported build target "wat"');
  });

  test('buildApp({ compile: "split" }) without serverEntry throws a clear error', () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));
    removeAppPath(app.path, "src/server.ts");

    expect(buildApp({ rootDir: app.path, target: "bun", compile: "split" })).rejects.toThrow(
      "server.ts"
    );
  });

  test('buildApp({ compile: "split" }) writes a server binary in the target dir', async () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));

    const result = await buildApp({ rootDir: app.path, target: "bun", compile: "split" });

    const bunManifest = result.targets.bun;
    expect(bunManifest).toBeDefined();
    const targetDir = join(app.path, bunManifest?.targetDir ?? "");
    const serverBin = existsSync(join(targetDir, "server"))
      ? join(targetDir, "server")
      : join(targetDir, "server.exe");

    expect(existsSync(serverBin)).toBe(true);
    expect(bunManifest?.serverPath).not.toBeNull();
  });

  test("buildApp passes user plugins to the client Bun.build() call", async () => {
    const app = rememberTmpApp(createTmpApp("cli-app"));
    let setupWasCalled = false;

    const trackingPlugin: Bun.BunPlugin = {
      name: "tracking-plugin",
      setup(_build) {
        setupWasCalled = true;
      },
    };

    await buildApp({ rootDir: app.path, target: "bun", plugins: [trackingPlugin] });

    expect(setupWasCalled).toBe(true);
  });
});
