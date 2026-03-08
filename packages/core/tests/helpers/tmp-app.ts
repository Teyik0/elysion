import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FIXTURES_ROOT = resolve(import.meta.dir, "../fixtures");
const TMP_ROOT = resolve(import.meta.dir, "../../.tmp-tests");

export interface TmpApp {
  cleanup: () => void;
  path: string;
}

function ensureTmpRoot(): void {
  if (!existsSync(TMP_ROOT)) {
    mkdirSync(TMP_ROOT, { recursive: true });
  }
}

export function createTmpApp(fixtureName = "cli-app"): TmpApp {
  ensureTmpRoot();

  const source = join(FIXTURES_ROOT, fixtureName);
  const path = mkdtempSync(join(TMP_ROOT, `${fixtureName}-`));
  cpSync(source, path, { recursive: true });

  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

export function writeAppFile(appPath: string, relativePath: string, contents: string): void {
  const path = join(appPath, relativePath);
  const directory = resolve(path, "..");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path, contents);
}

export function removeAppPath(appPath: string, relativePath: string): void {
  rmSync(join(appPath, relativePath), { recursive: true, force: true });
}
