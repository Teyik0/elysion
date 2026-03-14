import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildClient } from "../build/client.ts";
import { generateCompileEntry } from "../build/compile-entry.ts";
import { buildTargetManifest, ensureDir, toPosixPath, writeJsonFile } from "../build/shared.ts";
import type { BuildAppOptions, TargetBuildManifest } from "../build/types.ts";
import type { BuildTarget } from "../config.ts";
import type { ResolvedRoute } from "../router.ts";

export async function buildBunTarget(
  routes: ResolvedRoute[],
  rootDir: string,
  buildRoot: string,
  rootPath: string,
  serverEntry: string | null,
  options: BuildAppOptions
): Promise<TargetBuildManifest> {
  if (options.compile && !serverEntry) {
    throw new Error(
      `[elyra] \`compile: "${options.compile}"\` requires a server entry point. ` +
        "Create src/server.ts or set `serverEntry` in your elyra.config.ts."
    );
  }

  const target = "bun" satisfies BuildTarget;
  const targetManifest = buildTargetManifest(rootDir, buildRoot, target, serverEntry);
  const targetDir = resolve(rootDir, targetManifest.targetDir);

  rmSync(targetDir, { force: true, recursive: true });
  ensureDir(targetDir);

  await buildClient(routes, {
    outDir: targetDir,
    rootLayout: rootPath,
    plugins: options.plugins,
  });

  if (options.compile && serverEntry) {
    const clientDir = join(targetDir, "client");
    const outfile = join(targetDir, "server");
    const entryPath = generateCompileEntry({
      rootPath,
      pagePaths: routes.map((r) => r.path),
      serverEntry,
      outDir: targetDir,
      embed: options.compile === "embed" ? { clientDir } : undefined,
    });

    await Bun.build({
      entrypoints: [entryPath],
      compile: { outfile },
      minify: true,
      sourcemap: "linked",
      plugins: options.plugins,
    });
    console.log(`[elyra] Server binary (embed): ${outfile}`);

    targetManifest.serverPath = toPosixPath(join(targetManifest.targetDir, "server"));

    // Embed mode: all assets are embedded in the binary — clean up everything except
    if (options.compile === "embed") {
      rmSync(clientDir, { force: true, recursive: true });
      for (const file of [
        "_hydrate.tsx",
        "index.html",
        "_compile-entry.ts",
        "_compile-entry.js.map",
      ]) {
        rmSync(join(targetDir, file), { force: true });
      }
    }
  }

  // Embed mode: the binary is fully self-contained — no manifest needed at runtime.
  if (options.compile !== "embed") {
    writeJsonFile(resolve(rootDir, targetManifest.manifestPath), targetManifest);
  }
  return targetManifest;
}
