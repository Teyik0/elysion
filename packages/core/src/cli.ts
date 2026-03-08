#!/usr/bin/env bun

import { defineCommand, runMain } from "citty";
import { buildCommand } from "./cli/commands/build";
import { devCommand } from "./cli/commands/dev";
import { previewCommand } from "./cli/commands/preview";
import { typegenCommand } from "./cli/commands/typegen";

const main = defineCommand({
  meta: {
    name: "elyra",
    description: "Elyra framework CLI",
  },
  subCommands: {
    build: buildCommand,
    dev: devCommand,
    preview: previewCommand,
    typegen: typegenCommand,
  },
});

await runMain(main);
