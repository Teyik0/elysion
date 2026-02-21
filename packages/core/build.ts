import { $ } from "bun";

$.cwd(import.meta.dir);

await $`rm -rf dist`;
await $`tsc --project tsconfig.dts.json`;

// JS ESM with Bun.build (for Node/Deno)
await Bun.build({
  entrypoints: [`${import.meta.dir}/src/elysion.ts`, `${import.meta.dir}/src/client.ts`],
  outdir: `${import.meta.dir}/dist`,
  target: "node",
  format: "esm",
  external: ["elysia", "react", "react-dom"],
  minify: false,
  sourcemap: false,
});
