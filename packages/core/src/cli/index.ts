import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildApp } from "../build/index.ts";
import { BUILD_TARGETS, type BuildTarget } from "../config.ts";
import { loadCliConfig } from "./config.ts";

const argv = process.argv.slice(2);
const command = argv[0];

function log(msg: string): void {
  console.log(`\x1b[32m◆\x1b[0m ${msg}`);
}

function bail(msg: string): never {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
}

function resolveCompileMode(
  flag: string | undefined,
  configCompile: "split" | "embed" | undefined
): "split" | "embed" | undefined {
  if (flag === "split" || flag === "embed") {
    return flag;
  }
  if (flag !== undefined) {
    bail(`Invalid compile mode "${flag}". Valid: split, embed`);
  }
  return configCompile;
}

if (command === "build") {
  const { values: rawValues } = parseArgs({
    args: argv.slice(1),
    options: {
      target: { type: "string" },
      pagesDir: { type: "string" },
      config: { type: "string" },
      compile: { type: "string" },
    },
    strict: false,
  });

  const values = rawValues as {
    target?: string;
    pagesDir?: string;
    config?: string;
    compile?: string;
  };

  const target = values.target ?? "bun";

  if (target !== "all" && !(BUILD_TARGETS as readonly string[]).includes(target)) {
    bail(`Unsupported build target "${target}". Valid: ${BUILD_TARGETS.join(", ")}, all`);
  }

  const config = await loadCliConfig(process.cwd(), values.config);

  const serverEntry = resolve(config.rootDir, "src/server.ts");
  if (!existsSync(serverEntry)) {
    throw new Error("[elyra] Entrypoint server.ts not found");
  }

  log(`Building Elyra for ${target}…`);

  const result = await buildApp({
    target: target as BuildTarget | "all",
    compile: resolveCompileMode(values.compile, config.bun?.compile),
    rootDir: config.rootDir,
    pagesDir: values.pagesDir ?? config.pagesDir,
    serverEntry: config.serverEntry ?? serverEntry ?? undefined,
    plugins: config.plugins,
  });

  const built = Object.keys(result.targets).join(", ") || "none";
  log(`Done: ${built} → .elyra/build`);
} else if (!command || command === "help") {
  console.log(
    `Elyra CLI

USAGE  elyra build [options]

OPTIONS
  --target    ${BUILD_TARGETS.join(" | ")} | all  (default: bun)
  --pagesDir  Pages directory
  --config    Config file path
  --compile   split | embed  Compile to binary (bun only, default: split)
`
  );
} else {
  bail(`Unknown command "${command}". Run "elyra help" for usage.`);
}
