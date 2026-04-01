export interface ISRCacheEntry {
  generatedAt: number;
  html: string;
  revalidate: number;
}

/** Maximum number of ISR cache entries before LRU eviction kicks in. */
const MAX_ISR_CACHE_SIZE = 1000;
/** Maximum number of SSG cache entries before LRU eviction kicks in. */
const MAX_SSG_CACHE_SIZE = 1000;

export const isrCache = new Map<string, ISRCacheEntry>();
export const ssgCache = new Map<string, string>();

/**
 * Evicts the oldest entry from a Map when its size exceeds the given limit.
 * JS Maps maintain insertion order, so the first key is always the oldest.
 */
function evictOldest<V>(map: Map<string, V>, maxSize: number): void {
  if (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) {
      map.delete(oldest);
    }
  }
}

/** Sets an ISR cache entry with LRU eviction. */
export function setISRCache(key: string, entry: ISRCacheEntry): void {
  // Delete first to re-insert at the end (refresh insertion order for LRU)
  isrCache.delete(key);
  isrCache.set(key, entry);
  evictOldest(isrCache, MAX_ISR_CACHE_SIZE);
}

/** Sets an SSG cache entry with LRU eviction. */
export function setSSGCache(key: string, html: string): void {
  ssgCache.delete(key);
  ssgCache.set(key, html);
  evictOldest(ssgCache, MAX_SSG_CACHE_SIZE);
}
