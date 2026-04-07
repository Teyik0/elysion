import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

const decoder = new TextDecoder();
const appRoot = resolve(import.meta.dir, "..");
const entrypoint = resolve(appRoot, "src/index.ts");

describe("create-furin CLI", () => {
  it("formats parseArgs failures through the CLI error handler", () => {
    const result = Bun.spawnSync(["bun", entrypoint, "--unknown-flag"], {
      cwd: appRoot,
      stderr: "pipe",
      stdout: "pipe",
    });

    const output = decoder.decode(result.stdout) + decoder.decode(result.stderr);
    expect(result.exitCode).toBe(1);
    expect(output).toContain('Unknown option "--unknown-flag"');
  });
});
