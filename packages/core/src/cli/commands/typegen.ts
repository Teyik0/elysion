import { defineCommand } from "citty";
import { generateTypes } from "../../build";
import { loadCliConfig } from "../config";
import { logger } from "../logger";

export const typegenCommand = defineCommand({
  meta: {
    name: "typegen",
    description: "Generate Elyra route types",
  },
  args: {
    outDir: {
      type: "string",
    },
    pagesDir: {
      type: "string",
    },
    config: {
      type: "string",
    },
  },
  async run({ args }) {
    const config = await loadCliConfig(process.cwd(), args.config);
    const output = await generateTypes({
      rootDir: config.rootDir,
      pagesDir: args.pagesDir ?? config.pagesDir,
      outDir: args.outDir ?? config.outDir,
    });

    logger.success(`Route types written to ${output}`);
  },
});
