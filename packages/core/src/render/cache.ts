export interface ISRCacheEntry {
  generatedAt: number;
  html: string;
  revalidate: number;
}

export interface SsgCacheEntry {
  cachedAt: number;
  html: string;
}

export const isrCache = new Map<string, ISRCacheEntry>();

export const ssgCache = new Map<string, SsgCacheEntry>();

// ── Build ID ─────────────────────────────────────────────────────────────────

let _buildId = "";

/** Set once at server startup from the CompileContext. */
export function setBuildId(id: string): void {
  _buildId = id;
}

/** Returns the current deployment build ID, or empty string in dev / before set. */
export function getBuildId(): string {
  return _buildId;
}

// Queue of invalidated paths to send to the client via response header.
//
// Safety note: this Set is module-level and shared across all requests. A theoretical race
// exists if two requests interleave between `revalidatePath()` and `consumePendingInvalidations()`.
// In practice the window is zero: Bun is single-threaded and Elysia fires `onAfterHandle`
// synchronously in the same micro-task queue as the handler return, with no `await` in between.
const pendingInvalidations = new Set<string>();

/**
 * Consume and clear all pending invalidation paths.
 * Called by the Elysia onAfterHandle hook.
 * @internal
 */
export function consumePendingInvalidations(): string[] {
  if (pendingInvalidations.size === 0) {
    return [];
  }
  const paths = [...pendingInvalidations];
  pendingInvalidations.clear();
  return paths;
}

/**
 * Programmatically invalidate the cache for a given path.
 *
 * - `type: 'page'` (default): exact URL match.
 * - `type: 'layout'`: path + all nested children (prefix match).
 *
 * Works for ISR and SSG routes. SSR routes are always fresh (no server-side cache),
 * but the path is still queued for client-side prefetch cache invalidation via
 * the `X-Furin-Revalidate` response header.
 *
 * @returns `true` if at least one server-side cache entry was removed.
 */
export function revalidatePath(path: string, type: "page" | "layout" = "page"): boolean {
  // Queue for client-side notification (works for all modes, including SSR)
  pendingInvalidations.add(type === "layout" ? `${path}:layout` : path);

  if (type === "page") {
    const deletedISR = isrCache.delete(path);
    const deletedSSG = ssgCache.delete(path);
    return deletedISR || deletedSSG;
  }

  // layout: prefix match — invalidate path itself + all nested children
  let prefix: string;
  if (path === "/") {
    prefix = "/";
  } else if (path.endsWith("/")) {
    prefix = path;
  } else {
    prefix = `${path}/`;
  }
  let deleted = false;

  for (const key of isrCache.keys()) {
    if (key === path || key.startsWith(prefix)) {
      isrCache.delete(key);
      deleted = true;
    }
  }
  for (const key of ssgCache.keys()) {
    if (key === path || key.startsWith(prefix)) {
      ssgCache.delete(key);
      deleted = true;
    }
  }
  return deleted;
}
