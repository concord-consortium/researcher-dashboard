// @vitest-environment node
import { fileURLToPath } from "node:url";
import { build, type Rollup } from "vite";
import { describe, expect, it } from "vitest";

const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));

const build_ = async (deployPath?: string) => {
  const saved = process.env.DEPLOY_PATH;
  if (deployPath) process.env.DEPLOY_PATH = deployPath; else delete process.env.DEPLOY_PATH;
  try {
    return (await build({ configFile, logLevel: "silent", build: { write: false } }) as Rollup.RollupOutput).output;
  } finally {
    if (saved === undefined) delete process.env.DEPLOY_PATH; else process.env.DEPLOY_PATH = saved;
  }
};

describe("index-top.html", () => {
  it("writes an index-top.html whose references to the build's files carry the deploy path", async () => {
    const output = await build_("version/app-9.9.9");
    const source = (name: string) => String((output.find((o) => o.fileName === name) as Rollup.OutputAsset).source);
    const top = source("index-top.html"), index = source("index.html");
    const refs = [...top.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(3);
    const files = new Set(output.map((o) => o.fileName));
    for (const ref of refs) {
      expect(ref.startsWith("version/app-9.9.9/"), ref).toBe(true);
      expect(files.has(ref.slice("version/app-9.9.9/".length)), ref).toBe(true);
    }
    expect(top.replaceAll('="version/app-9.9.9/', '="./')).toBe(index);
  }, 60_000);

  it("writes no index-top.html without a deploy path", async () => {
    expect((await build_()).some((o) => o.fileName === "index-top.html")).toBe(false);
  }, 60_000);
});
