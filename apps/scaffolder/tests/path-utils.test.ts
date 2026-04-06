import { describe, expect, it } from "bun:test";
import { getProjectRelativePath } from "../src/utils/path.ts";

describe("getProjectRelativePath", () => {
  it("normalizes Windows-style paths before comparing generated files", () => {
    expect(getProjectRelativePath("C:\\tmp\\my-app", "C:\\tmp\\my-app\\package.json")).toBe(
      "package.json"
    );
    expect(getProjectRelativePath("C:\\tmp\\my-app", "C:\\tmp\\my-app\\src\\pages\\root.tsx")).toBe(
      "src/pages/root.tsx"
    );
  });

  it("returns a relative Unix path when the file is inside the project", () => {
    expect(getProjectRelativePath("/tmp/my-app", "/tmp/my-app/package.json")).toBe("package.json");
  });

  it("returns an empty string when targetDir equals filePath", () => {
    expect(getProjectRelativePath("/tmp/my-app", "/tmp/my-app")).toBe("");
    expect(getProjectRelativePath("C:\\tmp\\my-app", "C:\\tmp\\my-app")).toBe("");
  });

  it("returns the normalized absolute path when the file is outside the project", () => {
    expect(getProjectRelativePath("/tmp/my-app", "/other/path/file.ts")).toBe(
      "/other/path/file.ts"
    );
  });
});
