import { describe, expect, it } from "vitest";
import { ANALYZE_CLASS, classRef, pageFor, parseLaunch } from "../src/shell/launch";

const CLASS_URL = "https://learn.portal.staging.concord.org/api/v1/classes/111";

function launch(search: string) {
  return parseLaunch(search);
}

describe("parseLaunch", () => {
  it("reads what the portal puts in the url", () => {
    const l = launch(`?page=analyze-class&class=${encodeURIComponent(CLASS_URL)}&token=abc&researcher=true`);
    expect(l.page).toBe(ANALYZE_CLASS);
    expect(l.classUrl).toBe(CLASS_URL);
    expect(l.token).toBe("abc");
    expect(l.researcher).toBe(true);
  });

  it("treats a missing researcher flag as not a researcher", () => {
    expect(launch("?page=analyze-class").researcher).toBe(false);
  });
});

describe("classRef", () => {
  it("finds the portal and the class id in the api url", () => {
    expect(classRef(CLASS_URL)).toEqual({
      portalOrigin: "https://learn.portal.staging.concord.org",
      classId: "111"
    });
  });

  // This value decides where the bearer is sent, and anything can put a query on this
  // page, so a url that is not a portal class url has to be refused rather than trusted.
  it("refuses a url that is not a class api url", () => {
    expect(classRef("https://evil.test/api/v1/classes/111/../../secrets")).toBeNull();
    expect(classRef("https://learn.portal.staging.concord.org/api/v1/offerings/111")).toBeNull();
    expect(classRef("https://learn.portal.staging.concord.org/api/v1/classes/abc")).toBeNull();
  });

  it("refuses a scheme that is not http or https", () => {
    expect(classRef("javascript:alert(1)//api/v1/classes/1")).toBeNull();
    expect(classRef("file:///api/v1/classes/1")).toBeNull();
  });

  it("refuses nonsense rather than throwing", () => {
    expect(classRef("not a url")).toBeNull();
    expect(classRef(null)).toBeNull();
  });
});

describe("pageFor", () => {
  const good = `?page=analyze-class&class=${encodeURIComponent(CLASS_URL)}&token=abc`;

  it("selects analyze-class when the launch carries what it needs", () => {
    expect(pageFor(launch(good))).toBe(ANALYZE_CLASS);
  });

  // The root info page is what a bookmarked launch url lands on once its grant expires,
  // which is the common case rather than an edge one.
  it("falls back to the info page with no token", () => {
    expect(pageFor(launch(`?page=analyze-class&class=${encodeURIComponent(CLASS_URL)}`))).toBeNull();
  });

  it("falls back to the info page with no page", () => {
    expect(pageFor(launch(`?class=${encodeURIComponent(CLASS_URL)}&token=abc`))).toBeNull();
  });

  it("falls back to the info page for a page it does not know", () => {
    expect(pageFor(launch(`?page=analyze-cohort&class=${encodeURIComponent(CLASS_URL)}&token=abc`))).toBeNull();
  });

  it("falls back to the info page when the class url is not one", () => {
    expect(pageFor(launch("?page=analyze-class&class=https://evil.test/&token=abc"))).toBeNull();
  });

  it("falls back to the info page on an empty query" , () => {
    expect(pageFor(launch(""))).toBeNull();
  });
});
