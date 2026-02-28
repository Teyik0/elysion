import { plugin } from "bun";
import { transformForClient } from "./transform-client";

const TS_FILE_FILTER = /\.(tsx|ts)$/;

// Persisted across bun --hot reloads so we don't re-register the plugin
// on every file-change-triggered re-evaluation of this module.
// Direct access per Bun HMR guidelines (no indirection).
const _hmrData = import.meta.hot?.data as { pluginRegistered?: boolean } | undefined;
if (_hmrData && _hmrData.pluginRegistered === undefined) {
  _hmrData.pluginRegistered = false;
}
import.meta.hot?.dispose((data: { pluginRegistered?: boolean }) => {
  data.pluginRegistered = _hmrData?.pluginRegistered ?? false;
});

// Minimal browser stub for elysia — `t` is only used for schema definitions
// in params/query, which the client never validates at runtime.
const ELYSIA_STUB = `\
export const t = new Proxy({}, { get: () => (...args) => args[0] ?? {} });
export class NotFoundError extends Error { constructor(m) { super(m); this.name = "NotFoundError"; } }
export class ValidationError extends Error { constructor(m) { super(m); this.name = "ValidationError"; } }
export default {};
`;

/**
 * Registers a Bun build plugin (once per process) that:
 *  1. Stubs 'elysia' for the browser with a minimal proxy.
 *  2. Strips server-only code (loader, head) from page files before they are
 *     bundled into the client entry by Bun's native HTML bundler.
 *
 * Must be called before the first `import(…/index.html)` so Bun uses the
 * plugin when it processes the HTML entry.
 */
export function registerBunStripPlugin(pagesDir: string): void {
  if (_hmrData?.pluginRegistered) return;
  if (_hmrData) _hmrData.pluginRegistered = true;

  plugin({
    name: "elysion-strip-server",
    setup(build) {
      // ── elysia browser stub ──────────────────────────────────────────────
      build.onResolve({ filter: /^elysia$/ }, () => ({
        path: "elysia-stub",
        namespace: "elysion-stubs",
      }));

      build.onLoad({ namespace: "elysion-stubs", filter: /.*/ }, () => ({
        contents: ELYSIA_STUB,
        loader: "js",
      }));

      // ── page file stripping ───────────────────────────────────────────────
      build.onLoad({ filter: TS_FILE_FILTER }, async (args) => {
        const { path } = args;

        // Only process files inside the user's pages directory.
        if (path.includes("node_modules") || !path.startsWith(pagesDir)) {
          return undefined;
        }

        const source = await Bun.file(path).text();

        try {
          const result = transformForClient(source, path);
          let code = result.code;

          // transformForClient uses the classic JSX factory (React.createElement),
          // but doesn't add the React import for files that didn't import it
          // explicitly. Add it when needed so React is always in scope.
          if (code.includes("React.createElement") && !/import\s+React\b/.test(code)) {
            code = 'import React from "react";\n' + code;
          }

          return { contents: code, loader: "js" };
        } catch (err) {
          console.error(`[elysion] Strip-server transform error for ${path}:`, err);
          return undefined;
        }
      });
    },
  });
}

// ── Self-fetch helpers ──────────────────────────────────────────────────────

/**
 * Lazily fetches the Bun-processed /_bun_entry HTML and extracts all <script>
 * tags. These are the content-hashed bundle paths + the HMR client script
 * that Bun injects. Cached for the lifetime of the server process.
 *
 * Must be called from within a request handler (after the server is listening).
 */
let _devScriptsPromise: Promise<string> | null = null;

export function getDevBunScripts(serverOrigin: string): Promise<string> {
  _devScriptsPromise ??= fetch(`${serverOrigin}/_bun_entry`)
    .then((r) => r.text())
    .then((html) => {
      const tags = html.match(/<script\b[^>]*>[^<]*<\/script>/g) ?? [];
      return tags.join("\n");
    })
    .catch((err) => {
      _devScriptsPromise = null;
      throw err;
    });
  return _devScriptsPromise;
}

export function resetDevBunScripts(): void {
  _devScriptsPromise = null;
}
