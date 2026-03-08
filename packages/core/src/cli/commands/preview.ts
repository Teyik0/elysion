import { resolve } from "node:path";
import { defineCommand } from "citty";
import { readTargetBuildManifest } from "../../build";
import { BUILD_TARGETS } from "../../config";
import { loadCliConfig, resolveServerEntrypoint } from "../config";
import { logger } from "../logger";

type ChildProcess = ReturnType<typeof Bun.spawn>;

function forwardSignal(proc: ChildProcess, signal: NodeJS.Signals): void {
  try {
    proc.kill(signal);
  } catch {
    // Best-effort shutdown.
  }
}

export const previewCommand = defineCommand({
  meta: {
    name: "preview",
    description: "Preview a prebuilt Elyra target locally",
  },
  args: {
    target: {
      type: "string",
      default: "bun",
      valueHint: BUILD_TARGETS.join("|"),
    },
    outDir: {
      type: "string",
    },
    config: {
      type: "string",
    },
  },
  async run({ args }) {
    if (args.target !== "bun" && args.target !== "node") {
      throw new Error(
        `[elyra] \`preview --target ${args.target}\` is not implemented yet. Use \`bun\` or \`node\` for now.`
      );
    }

    const config = await loadCliConfig(process.cwd(), args.config);
    const outDir = args.outDir ?? config.outDir ?? ".elyra/build";
    logger.start(`Previewing ${args.target} build from ${outDir}`);

    const proc =
      args.target === "bun"
        ? (() => {
            const manifest = readTargetBuildManifest(config.rootDir, "bun", outDir);
            if (!manifest) {
              throw new Error(
                "[elyra] Could not find a prebuilt Bun build manifest. Run `elyra build --target bun` first."
              );
            }

            const serverEntry =
              config.serverEntry ?? resolveServerEntrypoint(config.rootDir, "bun");

            if (!serverEntry) {
              throw new Error("[elyra] Could not find a server entrypoint for preview.");
            }

            return Bun.spawn(["bun", serverEntry], {
              cwd: config.rootDir,
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
              env: {
                ...process.env,
                NODE_ENV: "production",
                ELYRA_BUILD_OUT_DIR: outDir,
                ELYRA_BUILD_TARGET: "bun",
              },
            });
          })()
        : (() => {
            const manifest = readTargetBuildManifest(config.rootDir, "node", outDir);
            if (!manifest?.serverPath) {
              throw new Error(
                "[elyra] Could not find a prebuilt Node server bundle. Run `elyra build --target node` first."
              );
            }

            return Bun.spawn(["node", resolve(config.rootDir, manifest.serverPath)], {
              cwd: config.rootDir,
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
              env: {
                ...process.env,
                NODE_ENV: "production",
              },
            });
          })();

    process.on("SIGINT", () => forwardSignal(proc, "SIGINT"));
    process.on("SIGTERM", () => forwardSignal(proc, "SIGTERM"));

    const exitCode = await proc.exited;
    process.exit(exitCode ?? 1);
  },
});
