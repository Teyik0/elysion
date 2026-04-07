import { join } from "node:path";

/**
 * Runs `fn` with `Bun.build` replaced by a lightweight stub that returns a
 * synthetic build output (one JS entry-point + one CSS asset).  The real
 * `Bun.build` is always restored when `fn` resolves or rejects.
 *
 * Captures the *current* value of `Bun.build` at call time (not at module
 * load time) so that nested / overlapping invocations each restore the value
 * that was active before their own stub was installed, rather than always
 * clobbering back to the original real implementation.
 *
 * Used by both build-cli.test.ts and adapter-bun.test.ts to avoid spawning
 * an actual Bun bundler process during unit tests.
 */
export async function withBuildStub<T>(run: () => Promise<T>): Promise<T> {
  const previousBunBuild = Bun.build;
  let buildCallCount = 0;

  Bun.build = ((config) => {
    const outdir = (config as Bun.BuildConfig).outdir;
    const outputs =
      buildCallCount++ === 0 && typeof outdir === "string"
        ? ([
            {
              kind: "entry-point",
              path: join(outdir, "_hydrate.js"),
              size: 128,
            },
            {
              kind: "asset",
              path: join(outdir, "_hydrate.css"),
              size: 64,
            },
          ] satisfies Array<{ kind: string; path: string; size: number }>)
        : [];

    return Promise.resolve({
      success: true,
      outputs,
      logs: [],
    } as unknown as Bun.BuildOutput);
  }) as typeof Bun.build;

  try {
    return await run();
  } finally {
    Bun.build = previousBunBuild;
  }
}
