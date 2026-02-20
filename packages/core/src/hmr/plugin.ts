import { watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { Elysia, t } from "elysia";
import { getCachedCss, getCssConfig, invalidateCssCache } from "../css";
import { REFRESH_SETUP_CODE } from "./refresh-setup";
import { broadcastMessage, getHmrClients, getTransformedModule } from "./watcher";

// ─── Module-level watcher state ──────────────────────────────────────────────
// Watchers are owned at module scope so import.meta.hot.dispose() can tear
// them down cleanly before a hot reload re-establishes them.

let _pagesWatcher: ReturnType<typeof watch> | null = null;
let _cssWatcher: ReturnType<typeof watch> | null = null;

// Config is persisted across hot reloads so watchers can be restarted
// automatically when this module itself is hot-replaced.
let _pagesDir: string | null = import.meta.hot?.data.pagesDir ?? null;
let _cssInputPath: string | undefined = import.meta.hot?.data.cssInputPath;

function stopWatchers(): void {
	_pagesWatcher?.close();
	_pagesWatcher = null;
	_cssWatcher?.close();
	_cssWatcher = null;
}

function startWatchers(pagesDir: string, cssInputPath?: string): void {
	stopWatchers();

	const recentlyBroadcast = new Map<string, number>();

	_pagesWatcher = watch(pagesDir, { recursive: true }, (event, filename) => {
		if (!filename) return;
		if (!(filename.endsWith(".tsx") || filename.endsWith(".ts"))) return;

		// Debounce: fs.watch fires duplicate events on some platforms
		const now = Date.now();
		if (now - (recentlyBroadcast.get(filename) ?? 0) < 100) return;
		recentlyBroadcast.set(filename, now);

		console.log(`[hmr] File ${event}: ${filename}`);

		// Invalidate CSS cache since Tailwind classes might have changed
		const cssConfig = getCssConfig();
		if (cssConfig) {
			invalidateCssCache(resolve(process.cwd(), cssConfig.input));
		}

		// Normalize to POSIX separators (Windows compatibility)
		const normalizedFilename = filename.replace(/\\/g, "/");

		broadcastMessage(
			JSON.stringify({
				type: "update",
				path: `/src/pages/${normalizedFilename}`,
				modules: [`/src/pages/${normalizedFilename}`],
				cssUpdate: true,
			}),
		);

		console.log(`[hmr] Broadcast update to ${getHmrClients().size} client(s)`);
	});

	console.log("[hmr] File watcher started for pages");

	if (cssInputPath) {
		const absoluteCssPath = resolve(process.cwd(), cssInputPath);
		const cssDir = dirname(absoluteCssPath);

		_cssWatcher = watch(cssDir, { recursive: true }, (event, filename) => {
			if (!filename) return;

			const changedPath = resolve(cssDir, filename);
			if (changedPath !== absoluteCssPath && !filename.endsWith(".css")) return;

			const now = Date.now();
			if (now - (recentlyBroadcast.get(filename) ?? 0) < 100) return;
			recentlyBroadcast.set(filename, now);

			console.log(`[hmr] CSS file ${event}: ${filename}`);
			invalidateCssCache(absoluteCssPath);

			broadcastMessage(JSON.stringify({ type: "css-update", path: filename }));
			console.log(`[hmr] Broadcast css-update to ${getHmrClients().size} client(s)`);
		});

		console.log("[hmr] CSS watcher started");
	}
}

// Restart watchers automatically when this module is hot-reloaded
if (_pagesDir) {
	startWatchers(_pagesDir, _cssInputPath);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createHmrPlugin(pagesDir: string, cssInputPath?: string) {
	// Persist config so it survives a hot reload of this module
	_pagesDir = pagesDir;
	_cssInputPath = cssInputPath;

	startWatchers(pagesDir, cssInputPath);

	const srcDir = dirname(pagesDir);

	return new Elysia({ name: "elysion-hmr" })
		.ws("/__elysion/hmr", {
			body: t.Any(),
			open(ws) {
				getHmrClients().add(ws.raw);
				console.log(`[hmr] Client connected (${getHmrClients().size} total)`);
				ws.send(JSON.stringify({ type: "connected" }));
			},
			close(ws) {
				getHmrClients().delete(ws.raw);
				console.log(`[hmr] Client disconnected (${getHmrClients().size} remaining)`);
			},
			message(_ws, message) {
				console.log("[hmr] Client message:", message);
			},
		})
		.get("/__refresh-setup.js", ({ set }) => {
			set.headers["content-type"] = "application/javascript";
			set.headers["cache-control"] = "no-cache";
			return REFRESH_SETUP_CODE;
		})
		.get("/_modules/src/*", async ({ path, set, status }) => {
			const relativePath = decodeURIComponent(path.replace("/_modules/src/", ""));
			let fullPath = resolve(srcDir, relativePath);

			if (!fullPath.startsWith(srcDir)) {
				return status("Forbidden", `File does not exist at: ${fullPath}`);
			}

			// Try with extensions if file doesn't exist
			const extensions = [".tsx", ".ts", ".jsx", ".js"];
			const file = Bun.file(fullPath);
			if (!(await file.exists())) {
				for (const ext of extensions) {
					const pathWithExt = fullPath + ext;
					const fileWithExt = Bun.file(pathWithExt);
					if (await fileWithExt.exists()) {
						fullPath = pathWithExt;
						break;
					}
				}
			}

			set.headers["content-type"] = "application/javascript";
			set.headers["cache-control"] = "no-cache";
			try {
				const code = await getTransformedModule(fullPath, srcDir, pagesDir);
				return status(200, code);
			} catch (error) {
				console.error("[hmr] Module transform error:", error);
				return status(500, `// Error: ${error}`);
			}
		})
		.get("/__elysion/css", async ({ set, status }) => {
			const config = getCssConfig();
			set.headers["content-type"] = "text/css";
			if (!config) {
				return status("Not Found", "CSS Not Configured");
			}

			set.headers["cache-control"] = "no-cache";

			try {
				const absolutePath = resolve(process.cwd(), config.input);
				invalidateCssCache(absolutePath);

				const result = await getCachedCss(process.cwd());
				return result?.code;
			} catch (error: unknown) {
				console.error("[hmr] CSS processing error:", error);
				return status("Internal Server Error", `CSS Error: ${error}`);
			}
		});
}

// ─── HMR lifecycle ────────────────────────────────────────────────────────────
// Stop file watchers before this module is replaced; persist config so the
// incoming version can restart them without being called by elysion() again.
if (import.meta.hot) {
	import.meta.hot.dispose((data) => {
		data.pagesDir = _pagesDir;
		data.cssInputPath = _cssInputPath;
		stopWatchers();
	});
	import.meta.hot.accept();
}
