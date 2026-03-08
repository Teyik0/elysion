import { defineCommand } from "citty";
import { buildApp } from "../../build";
import { BUILD_TARGETS, type BuildTarget } from "../../config";
import { loadCliConfig, resolveServerEntrypoint } from "../config";
import { logger } from "../logger";

function parseBuildTarget(value: string): BuildTarget | "all" {
  if (value === "all") {
    return value;
  }

  if ((BUILD_TARGETS as readonly string[]).includes(value)) {
    return value as BuildTarget;
  }

  throw new Error(`[elyra] Unsupported build target "${value}"`);
}

export const buildCommand = defineCommand({
  meta: {
    name: "build",
    description: "Build an Elyra app for a deployment target",
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
    pagesDir: {
      type: "string",
    },
    config: {
      type: "string",
    },
    compile: {
      type: "boolean",
      default: false,
    },
  },
  async run({ args }) {
    const config = await loadCliConfig(process.cwd(), args.config);
    const target = parseBuildTarget(args.target);
    const serverEntry = resolveServerEntrypoint(
      config.rootDir,
      target === "all" ? undefined : target
    );

    logger.start(`Building Elyra for ${target}`);

    const result = await buildApp({
      target,
      compile: args.compile,
      rootDir: config.rootDir,
      pagesDir: args.pagesDir ?? config.pagesDir,
      outDir: args.outDir ?? config.outDir,
      minify: config.client?.minify,
      sourcemap: config.client?.sourcemap,
      serverEntry: config.serverEntry ?? serverEntry ?? undefined,
    });

    logger.success(
      `Build complete: ${Object.keys(result.targets).join(", ") || "no target"} → ${args.outDir ?? config.outDir ?? ".elyra/build"}`
    );
  },
});
