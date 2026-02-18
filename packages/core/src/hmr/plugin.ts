import { resolve } from "node:path";
import { Elysia, t } from "elysia";
import { getCachedCss, getCssConfig, invalidateCssCache } from "../css";
import { REFRESH_SETUP_CODE } from "./refresh-setup";
import { getHmrClients, getTransformedModule, setupHmrWatcher } from "./watcher";

export function createHmrPlugin(pagesDir: string, cssInputPath?: string) {
  setupHmrWatcher(pagesDir, cssInputPath);

  const hmrPlugin = new Elysia({ name: "elysion-hmr" })
    .ws("/__elysion/hmr", {
      body: t.Any(),
      open(ws) {
        const rawWs = ws.raw;
        getHmrClients().add(rawWs);
        console.log(`[hmr] Client connected (${getHmrClients().size} total)`);
        ws.send(JSON.stringify({ type: "connected" }));
      },
      close(ws) {
        const rawWs = ws.raw;
        getHmrClients().delete(rawWs);
        console.log(`[hmr] Client disconnected (${getHmrClients().size} remaining)`);
      },
      message(_ws, message) {
        console.log("[hmr] Client message:", message);
      },
    })
    .get("/__refresh-setup.js", () => {
      return new Response(REFRESH_SETUP_CODE, {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache",
        },
      });
    })
    .get("/_modules/pages/*", async (ctx) => {
      const relativePath = ctx.path.replace("/_modules/pages/", "");
      const fullPath = resolve(pagesDir, relativePath);

      if (!fullPath.startsWith(pagesDir)) {
        return new Response("Forbidden", { status: 403 });
      }

      try {
        const code = await getTransformedModule(fullPath, pagesDir);
        return new Response(code, {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache",
          },
        });
      } catch (error) {
        console.error("[hmr] Module transform error:", error);
        return new Response(`// Error: ${error}`, {
          status: 500,
          headers: { "Content-Type": "application/javascript" },
        });
      }
    });

  // Add CSS endpoint for HMR
  hmrPlugin.get("/__elysion/css", async () => {
    const config = getCssConfig();
    if (!config) {
      return new Response("/* No CSS configured */", {
        status: 404,
        headers: { "Content-Type": "text/css" },
      });
    }

    try {
      // Invalidate cache to ensure fresh CSS
      const absolutePath = resolve(process.cwd(), config.input);
      invalidateCssCache(absolutePath);

      const result = await getCachedCss(process.cwd());
      return new Response(result?.code || "", {
        headers: {
          "Content-Type": "text/css",
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      console.error("[hmr] CSS processing error:", error);
      return new Response(`/* CSS Error: ${error} */`, {
        status: 500,
        headers: { "Content-Type": "text/css" },
      });
    }
  });

  return hmrPlugin;
}
