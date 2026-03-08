import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { BUILD_TARGETS, type BuildTarget, type ElyraConfig } from "../config";

const buildTargetSchema = z.enum(BUILD_TARGETS);

const configSchema = z.object({
  rootDir: z.string().optional(),
  pagesDir: z.string().optional(),
  outDir: z.string().optional(),
  serverEntry: z.string().optional(),
  targets: z.array(buildTargetSchema).optional(),
  client: z
    .object({
      minify: z.boolean().optional(),
      sourcemap: z.boolean().optional(),
    })
    .optional(),
  bun: z
    .object({
      compile: z.boolean().optional(),
    })
    .optional(),
});

const DEFAULT_CONFIG_FILENAMES = [
  "elyra.config.ts",
  "elyra.config.js",
  "elyra.config.mjs",
] as const;

export interface ResolvedCliConfig extends ElyraConfig {
  configPath: string | null;
  pagesDir: string;
  rootDir: string;
}

export function resolveServerEntrypoint(rootDir: string, target?: BuildTarget): string | null {
  const candidates = [
    target ? `src/server.${target}.ts` : undefined,
    "src/server.ts",
    "src/app.ts",
  ].filter((value): value is string => !!value);

  for (const candidate of candidates) {
    const path = resolve(rootDir, candidate);
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

export async function loadCliConfig(
  cwd: string,
  explicitConfigPath?: string
): Promise<ResolvedCliConfig> {
  const rootDir = resolve(cwd);
  const configPath = explicitConfigPath
    ? resolve(rootDir, explicitConfigPath)
    : DEFAULT_CONFIG_FILENAMES.map((filename) => resolve(rootDir, filename)).find((path) =>
        existsSync(path)
      );

  if (!configPath) {
    return {
      configPath: null,
      rootDir,
      pagesDir: resolve(rootDir, "src/pages"),
    };
  }

  const imported = await import(pathToFileURL(configPath).href);
  const config = configSchema.parse(imported.default ?? imported) satisfies ElyraConfig;

  const resolvedRootDir = resolve(rootDir, config.rootDir ?? ".");
  return {
    ...config,
    configPath,
    rootDir: resolvedRootDir,
    pagesDir: resolve(resolvedRootDir, config.pagesDir ?? "src/pages"),
  };
}
