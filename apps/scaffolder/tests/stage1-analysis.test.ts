import { describe, expect, it } from "bun:test";
import { createContext } from "../src/pipeline/context";
import { stage1Analysis } from "../src/pipeline/stages/1-analysis";

describe("stage1Analysis", () => {
  it("validates CLI-provided project names before continuing", async () => {
    const ctx = createContext({ projectName: "foo/bar" });

    await expect(stage1Analysis(ctx)).rejects.toThrow("Name cannot contain slashes.");
  });
});
