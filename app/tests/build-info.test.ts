// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEPLOY_ROOT } from "../src/build-info";

describe("DEPLOY_ROOT", () => {
  // tests/ and src/ are both one level below the app root, as assets/ is in a build.
  it("is the app root, one level above the module", () => {
    expect(DEPLOY_ROOT).toBe(new URL(/* @vite-ignore */ "../", import.meta.url).href);
  });
});
