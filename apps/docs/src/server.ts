import { furin } from "@teyik0/furin";
import { Elysia } from "elysia";
import mdxPlugin from "./lib/bun-mdx-plugin.ts";

Bun.plugin(mdxPlugin);

const app = new Elysia()
  .use(
    await furin({
      pagesDir: "./src/pages",
    })
  )
  .listen(3000);

console.log(`Furin Docs running at http://localhost:${app.server?.port}`);
