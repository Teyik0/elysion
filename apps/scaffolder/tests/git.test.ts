import { afterEach, describe, expect, it } from "bun:test";
import { initGitRepo } from "../src/utils/git";

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

describe("initGitRepo", () => {
  it("keeps a successful git init when the initial commit fails", () => {
    Bun.spawnSync = ((args) => {
      const gitArgs = getCommand(args).slice(1);

      return {
        exitCode: gitArgs[0] === "commit" ? 1 : 0,
        stderr: new Uint8Array(),
        stdout: new Uint8Array(),
      } as ReturnType<typeof Bun.spawnSync>;
    }) as typeof Bun.spawnSync;

    expect(initGitRepo("/tmp/project")).toEqual({
      committed: false,
      initialized: true,
    });
  });
});
