/**
 * Computes a deterministic, opaque 10-hex-character digest for an error.
 *
 * Purpose: render this digest in client-facing error UIs (e.g. `Error ID:
 * a3f2b9c1d8`) and log the same digest alongside the full stack on the server,
 * so support can correlate user reports with server logs without leaking stack
 * traces or sensitive message content to the browser.
 *
 * Deterministic: identical error message + stack ⇒ identical digest across
 * restarts and processes. Uses `Bun.hash` (Wyhash64) as the backing hash.
 */
export function computeErrorDigest(err: unknown): string {
  let message = "";
  let stack = "";

  if (err instanceof Error) {
    message = err.message;
    stack = err.stack ?? "";
  } else if (typeof err === "string") {
    message = err;
  } else {
    // Non-Error, non-string throws (e.g. `throw { code: 401 }`, `throw 42`,
    // `throw null`). Without this branch every such value would collapse to
    // the same empty `message`/`stack` and therefore the same digest, defeating
    // the whole point of correlating distinct failures with distinct IDs.
    // Prefer JSON.stringify for stable shape-aware hashing of plain objects;
    // fall back to String(err) when the value isn't JSON-serialisable
    // (circular refs, BigInt, symbols, …).
    try {
      message = JSON.stringify(err) ?? String(err);
    } catch {
      message = String(err);
    }
  }

  const input = `${message}\n${stack}`;
  const hex = fnv1a(input).toString(16);
  return hex.padStart(10, "0").slice(0, 10);
}

function fnv1a(input: string): number {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < input.length; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a requires XOR for the hash algorithm
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: unsigned right-shift required to coerce to 32-bit unsigned integer
  return hash >>> 0;
}
