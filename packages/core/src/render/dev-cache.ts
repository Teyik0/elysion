/**
 * Dev-mode "Live ISR" loader-output cache.
 *
 * The production ISR cache stores fully-assembled HTML.  In dev that breaks
 * because the dev shell template embeds the Bun client chunk URL, which flips
 * on every rebundle.  Caching loader DATA instead — and re-assembling HTML
 * with the freshest shell on each request — preserves the actual value of
 * ISR (skipping expensive loader work) without ever serving stale chunk URLs.
 *
 * Source-aware invalidation: each entry records the source files it depends
 * on (page file + intermediate `_route.tsx` chain + `root.tsx`).  When one of
 * those files changes, every dependent entry is dropped (see
 * `invalidateDevLoaderCacheBySource`).
 *
 * Two separate Maps for ISR and SSG keep the type pure and let the inspector
 * surface both modes uniformly without union juggling.
 */

import { statSync } from "node:fs";

export interface DevLoaderCacheEntry {
  /**
   * Source files this entry depends on (absolute paths).  Editing any of
   * these must drop the entry on the next request.
   */
  dependencies: string[];
  /** ms timestamp at which the entry was written. */
  generatedAt: number;
  /** Response headers contributed by the loaders. */
  headers: Record<string, string>;
  /** Merged data record from the route chain's loaders. */
  loaderData: Record<string, unknown>;
  /** Mode the entry was generated for — surfaced by the inspector. */
  mode: "isr" | "ssg";
  /** Window in seconds during which the entry is fresh. */
  revalidate: number;
}

const devISRLoaderCache = new Map<string, DevLoaderCacheEntry>();
const devSSGLoaderCache = new Map<string, DevLoaderCacheEntry>();

/**
 * Reverse index: source file → set of cache keys whose entries depend on it.
 * Populated by `setDevISRLoaderCache` / `setDevSSGLoaderCache`, drained by
 * `invalidateDevLoaderCacheBySource`.  Memory cost is O(distinct cache keys
 * × avg dependency-chain length) — independent of total route count.
 */
const sourceFileToCacheKeys = new Map<string, Set<string>>();

interface CacheKindHandle {
  cache: Map<string, DevLoaderCacheEntry>;
  kind: "isr" | "ssg";
}

const isrHandle: CacheKindHandle = { cache: devISRLoaderCache, kind: "isr" };
const ssgHandle: CacheKindHandle = { cache: devSSGLoaderCache, kind: "ssg" };

function indexEntryDependencies(cacheKey: string, deps: string[]): void {
  for (const dep of deps) {
    let bucket = sourceFileToCacheKeys.get(dep);
    if (!bucket) {
      bucket = new Set<string>();
      sourceFileToCacheKeys.set(dep, bucket);
    }
    bucket.add(cacheKey);
  }
}

function unindexEntryDependencies(cacheKey: string, deps: string[]): void {
  for (const dep of deps) {
    const bucket = sourceFileToCacheKeys.get(dep);
    if (!bucket) {
      continue;
    }
    bucket.delete(cacheKey);
    if (bucket.size === 0) {
      sourceFileToCacheKeys.delete(dep);
    }
  }
}

function setEntry(handle: CacheKindHandle, key: string, entry: DevLoaderCacheEntry): void {
  // Drop any stale reverse-index links from a previous entry under this key.
  const previous = handle.cache.get(key);
  if (previous) {
    unindexEntryDependencies(key, previous.dependencies);
  }
  handle.cache.set(key, entry);
  indexEntryDependencies(key, entry.dependencies);
}

export function getDevISRLoaderCache(key: string): DevLoaderCacheEntry | undefined {
  return devISRLoaderCache.get(key);
}

export function setDevISRLoaderCache(key: string, entry: DevLoaderCacheEntry): void {
  setEntry(isrHandle, key, entry);
}

export function getDevSSGLoaderCache(key: string): DevLoaderCacheEntry | undefined {
  return devSSGLoaderCache.get(key);
}

export function setDevSSGLoaderCache(key: string, entry: DevLoaderCacheEntry): void {
  setEntry(ssgHandle, key, entry);
}

/**
 * Result of a source-aware invalidation pass.  `cleared` lists every cache
 * key that was dropped, broken down by mode for inspector / log surfacing.
 */
export interface InvalidateOutcome {
  cleared: string[];
  isr: number;
  ssg: number;
}

/**
 * Drops every dev cache entry whose dependency chain includes `filePath`.
 * Safe to call for files that were never registered — returns an empty
 * outcome.  Called by the dev-page-plugin's onLoad hook on each workspace
 * source re-evaluation.
 */
export function invalidateDevLoaderCacheBySource(filePath: string): InvalidateOutcome {
  const keys = sourceFileToCacheKeys.get(filePath);
  if (!keys || keys.size === 0) {
    return { cleared: [], isr: 0, ssg: 0 };
  }

  const cleared: string[] = [];
  let isr = 0;
  let ssg = 0;

  // Snapshot keys before mutation — drop-as-we-go would invalidate the iterator.
  const snapshot = [...keys];
  for (const key of snapshot) {
    const isrEntry = devISRLoaderCache.get(key);
    if (isrEntry) {
      devISRLoaderCache.delete(key);
      unindexEntryDependencies(key, isrEntry.dependencies);
      cleared.push(key);
      isr++;
      continue;
    }
    const ssgEntry = devSSGLoaderCache.get(key);
    if (ssgEntry) {
      devSSGLoaderCache.delete(key);
      unindexEntryDependencies(key, ssgEntry.dependencies);
      cleared.push(key);
      ssg++;
    }
  }

  return { cleared, isr, ssg };
}

/**
 * Returns true when `entry.generatedAt` is within the revalidate window.
 * SSG entries pass `revalidate: Number.POSITIVE_INFINITY` so they are always
 * considered fresh until source-aware invalidation drops them.
 */
export function isDevLoaderCacheFresh(entry: DevLoaderCacheEntry): boolean {
  return Date.now() - entry.generatedAt < entry.revalidate * 1000;
}

/**
 * Pre-read validity check used by `renderDevISRWithLoaderCache` and
 * `renderDevSSGWithLoaderCache`.  Combines two distinct invariants:
 *
 *   1. Time-based   — `isDevLoaderCacheFresh(entry)`
 *   2. Source-based — every file in `entry.dependencies` must have an mtime
 *                     less than or equal to `entry.generatedAt`
 *
 * The mtime check is what closes the gap left by the previous "invalidate in
 * `onLoad`" approach: a `root.tsx` edit that does NOT trigger Bun's plugin
 * hooks (because, say, `--hot` decided not to re-evaluate it before the next
 * page request) is still detected at cache read time.  A fresh `statSync` is
 * the source of truth — no shared map, no bootstrap problem, no dependency
 * on plugin invocation order.
 *
 * Cost: O(deps) `statSync` per cache hit candidate.  Typical chain is
 * 2–3 files (page + root + maybe `_route.tsx`), each stat ≈ 5–10 µs on APFS,
 * so ≈ 15–30 µs per ISR/SSG dev request — negligible vs the 100 ms+ loaders
 * the cache exists to skip.
 *
 * Errors are conservative: if a dep file is missing or unreadable we treat
 * the entry as invalid and force a re-run.  This handles file deletion,
 * rename, and transient I/O issues uniformly.
 */
export function isDevLoaderCacheValid(entry: DevLoaderCacheEntry): boolean {
  if (!isDevLoaderCacheFresh(entry)) {
    return false;
  }
  for (const dep of entry.dependencies) {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(dep).mtimeMs;
    } catch {
      return false;
    }
    if (mtimeMs > entry.generatedAt) {
      return false;
    }
  }
  return true;
}

/** @internal — exposed for the inspector endpoint. */
export function getAllDevISRLoaderEntries(): [string, DevLoaderCacheEntry][] {
  return [...devISRLoaderCache.entries()];
}

/** @internal — exposed for the inspector endpoint. */
export function getAllDevSSGLoaderEntries(): [string, DevLoaderCacheEntry][] {
  return [...devSSGLoaderCache.entries()];
}

/** @internal — test reset, drops every cached entry from both Maps. */
export function __resetDevLoaderCacheState(): void {
  devISRLoaderCache.clear();
  devSSGLoaderCache.clear();
  sourceFileToCacheKeys.clear();
}
