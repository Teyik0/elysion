/**
 * Server-only helpers for doc content.
 * This file imports node:fs and must NOT be imported from client components.
 * The transform-client plugin strips `loader` from page bundles, so this module
 * is automatically excluded from browser chunks via dead-code elimination.
 */
import { readFileSync } from "node:fs";
import { DOCS_CONTENT } from "../generated/docs-content";

const SOURCE_PREFIX_RE = /^src\//;

/**
 * Returns the raw MDX source text for a doc page.
 *
 * - In production (compiled binary): reads from the pre-generated DOCS_CONTENT map.
 * - In dev: falls back to a live filesystem read so edits appear without rebuilding.
 */
export function getDocSourceText(sourcePath: string): string {
  const pregenerated = DOCS_CONTENT[sourcePath];
  if (pregenerated) {
    return pregenerated;
  }

  // In compiled binaries the filesystem is virtual and raw MDX sources are not
  // present. Fail fast with a clear message instead of an obscure ENOENT.
  if (import.meta.path?.includes("/$bunfs/")) {
    throw new Error(
      `Missing pre-generated content for ${sourcePath}. Run generate:content before building the binary.`
    );
  }

  return readFileSync(
    new URL(`../${sourcePath.replace(SOURCE_PREFIX_RE, "")}`, import.meta.url),
    "utf8"
  );
}
