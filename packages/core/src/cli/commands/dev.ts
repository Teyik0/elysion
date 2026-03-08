import { defineCommand } from "citty";
import { loadCliConfig, resolveServerEntrypoint } from "../config";
import { logger } from "../logger";

type ChildProcess = ReturnType<typeof Bun.spawn>;

function forwardSignal(proc: ChildProcess, signal: NodeJS.Signals): void {
  try {
    proc.kill(signal);
  } catch {
    // Best-effort shutdown.
  }
}

export const devCommand = defineCommand({
  meta: {
    name: "dev",
    description: "Start the Elyra app in Bun dev mode",
  },
  args: {
    config: {
      type: "string",
    },
  },
  async run({ args }) {
    const config = await loadCliConfig(process.cwd(), args.config);
    const serverEntry = config.serverEntry ?? resolveServerEntrypoint(config.rootDir, "bun");

    if (!serverEntry) {
      throw new Error(
        "[elyra] Could not find a server entrypoint. Checked src/server.ts and src/app.ts."
      );
    }

    logger.start(`Starting dev server from ${serverEntry}`);

    const proc = Bun.spawn(["bun", "--hot", serverEntry], {
      cwd: config.rootDir,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
    });

    process.on("SIGINT", () => forwardSignal(proc, "SIGINT"));
    process.on("SIGTERM", () => forwardSignal(proc, "SIGTERM"));

    const exitCode = await proc.exited;
    process.exit(exitCode ?? 1);
  },
});
