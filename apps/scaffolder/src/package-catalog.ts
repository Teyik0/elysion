import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import catalog from "./generated/package-catalog.json";

export interface PackageCatalog {
  "@teyik0/furin": string;
  "@types/bun": string;
  "@types/react": string;
  "@types/react-dom": string;
  "bun-plugin-tailwind": string;
  "class-variance-authority": string;
  clsx: string;
  elysia: string;
  "lucide-react": string;
  "radix-ui": string;
  react: string;
  "react-dom": string;
  "tailwind-merge": string;
  tailwindcss: string;
  "tw-animate-css": string;
  typescript: string;
}

function resolveWorkspaceProtocol(value: string): string {
  if (value === "workspace:*") {
    const corePackageJsonPath = resolve(import.meta.dir, "../../../packages/core/package.json");
    const corePackageJson = JSON.parse(readFileSync(corePackageJsonPath, "utf8"));
    return corePackageJson.version;
  }
  return value;
}

export function getPackageCatalog(): PackageCatalog {
  return {
    ...catalog,
    "@teyik0/furin": resolveWorkspaceProtocol(catalog["@teyik0/furin"]),
  } as PackageCatalog;
}
