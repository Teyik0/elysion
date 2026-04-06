import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { checkDiskSpace } from "../src/utils/disk";

const encoder = new TextEncoder();
const originalSpawnSync = Bun.spawnSync;

function getCommand(args: unknown): string[] {
  if (Array.isArray(args)) {
    return [...args];
  }

  if (args && typeof args === "object" && "cmd" in args) {
    const { cmd } = args as { cmd: string[] };
    return [...cmd];
  }

  throw new Error("Unexpected Bun.spawnSync arguments");
}

afterEach(() => {
  Bun.spawnSync = originalSpawnSync;
});

describe("checkDiskSpace", () => {
  it("checks the nearest existing ancestor for relative target paths", () => {
    let command: string[] = [];

    Bun.spawnSync = ((args) => {
      command = getCommand(args);
      return {
        exitCode: 0,
        stderr: new Uint8Array(),
        stdout: encoder.encode(
          "Filesystem 1K-blocks Used Available Capacity Mounted\n/dev/disk 100 0 100 0% /\n"
        ),
      } as ReturnType<typeof Bun.spawnSync>;
    }) as typeof Bun.spawnSync;

    expect(checkDiskSpace("new-project/nested", 1024)).toBe(true);
    expect(command).toEqual(["df", "-k", resolve(process.cwd())]);
  });
});
