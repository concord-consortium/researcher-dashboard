// @vitest-environment node
import { fileURLToPath } from "node:url";
import { build, type Rollup } from "vite";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, FIREBASE_HOSTS } from "../src/shell/csp";
import { DEPLOYED } from "../src/shell/portals";

const directives = (policy: string) => new Map(policy.split("; ").map((d) => {
  const [name, ...values] = d.split(" ");
  return [name, values] as const;
}));

describe("contentSecurityPolicy", () => {
  it("has exactly the dashboard's directives", () => {
    const policy = directives(contentSecurityPolicy(DEPLOYED));
    expect([...policy.keys()]).toEqual([
      "default-src", "script-src", "style-src", "img-src", "connect-src",
      "font-src", "manifest-src", "base-uri", "form-action", "object-src", "frame-src"
    ]);
    expect(policy.get("default-src")).toEqual(["'none'"]);
    expect(policy.get("script-src")).toEqual(["'self'"]);
    expect(policy.get("style-src")).toEqual(["'self'"]);
    expect(policy.get("img-src")).toEqual(["'self'", "data:"]);
    expect(policy.get("font-src")).toEqual(["'self'"]);
    expect(policy.get("manifest-src")).toEqual(["'self'"]);
    for (const name of ["base-uri", "form-action", "object-src", "frame-src"]) expect(policy.get(name), name).toEqual(["'none'"]);
  });

  it("connects only to itself, each allowlisted portal and report-server, and Firebase", () => {
    expect(DEPLOYED.length).toBeGreaterThan(0);
    const connect = directives(contentSecurityPolicy(DEPLOYED)).get("connect-src")!;
    expect(new Set(connect)).toEqual(new Set(["'self'", ...DEPLOYED.flatMap((p) => [p.origin, p.reportServer]), ...FIREBASE_HOSTS]));
  });
});

describe("the built index.html", () => {
  it("carries the policy as the first element of its head", async () => {
    const output = await build({
      configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
      logLevel: "silent",
      build: { write: false }
    }) as Rollup.RollupOutput;
    const html = output.output.find((o) => o.fileName === "index.html") as Rollup.OutputAsset;
    const head = String(html.source).match(/<head>\s*(<[^>]+>)/)![1];
    expect(head).toBe(`<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(DEPLOYED)}">`);
  }, 30_000);
});
