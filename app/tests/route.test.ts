// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseRoute, routeHash } from "../src/shell/route";

describe("parseRoute and routeHash", () => {
  it("carry the list's search as q, and only on the list", () => {
    expect(parseRoute("#analytics?q=wildfire%20model")).toEqual({ tab: "packages", key: null, q: "wildfire model" });
    expect(routeHash({ tab: "packages", key: null, q: "wildfire model" })).toBe("#analytics?q=wildfire+model");
    expect(parseRoute(routeHash({ tab: "packages", key: null, q: "a&b=c" }))).toEqual({ tab: "packages", key: null, q: "a&b=c" });
    expect(parseRoute("#analytics?q=%20%20")).toEqual({ tab: "packages", key: null });
    expect(routeHash({ tab: "packages", key: "official__x", q: "ignored" })).toBe("#analytics/official__x");
    expect(parseRoute("#analytics/official__x?q=ignored")).toEqual({ tab: "packages", key: "official__x" });
  });

  it("opens no package for a key that is not valid percent-encoding", () => {
    expect(parseRoute("#analytics/%")).toEqual({ tab: "packages", key: null });
    expect(parseRoute("#analytics/%E0")).toEqual({ tab: "packages", key: null });
    expect(parseRoute("#analytics/official__x%2Fy")).toEqual({ tab: "packages", key: "official__x/y" });
  });

  it("opens on Info with no fragment, and reads #packages as #analytics", () => {
    expect(parseRoute("")).toEqual({ tab: "info" });
    expect(parseRoute("#")).toEqual({ tab: "info" });
    expect(parseRoute("#packages")).toEqual({ tab: "packages", key: null });
    expect(parseRoute("#packages/official__x")).toEqual({ tab: "packages", key: "official__x" });
    expect(parseRoute("#packages?q=fire")).toEqual({ tab: "packages", key: null, q: "fire" });
  });
});
