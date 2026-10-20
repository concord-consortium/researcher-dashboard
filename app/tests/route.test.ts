// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseRoute, routeHash } from "../src/shell/route";

describe("parseRoute and routeHash", () => {
  it("carry the list's search as q, and only on the list", () => {
    expect(parseRoute("#packages?q=wildfire%20model")).toEqual({ tab: "packages", key: null, q: "wildfire model" });
    expect(routeHash({ tab: "packages", key: null, q: "wildfire model" })).toBe("#packages?q=wildfire+model");
    expect(parseRoute(routeHash({ tab: "packages", key: null, q: "a&b=c" }))).toEqual({ tab: "packages", key: null, q: "a&b=c" });
    expect(parseRoute("#packages?q=%20%20")).toEqual({ tab: "packages", key: null });
    expect(routeHash({ tab: "packages", key: "official__x", q: "ignored" })).toBe("#packages/official__x");
    expect(parseRoute("#packages/official__x?q=ignored")).toEqual({ tab: "packages", key: "official__x" });
  });

  it("opens no package for a key that is not valid percent-encoding", () => {
    expect(parseRoute("#packages/%")).toEqual({ tab: "packages", key: null });
    expect(parseRoute("#packages/%E0")).toEqual({ tab: "packages", key: null });
    expect(parseRoute("#packages/official__x%2Fy")).toEqual({ tab: "packages", key: "official__x/y" });
  });
});
