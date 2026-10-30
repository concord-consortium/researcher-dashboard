import { afterEach, describe, expect, it, vi } from "vitest";
import { catchRedactedLinks, REDACTED_MESSAGE } from "../demo/redacted-links";

let remove: (() => void) | null = null;
afterEach(() => {
  remove?.();
  remove = null;
  document.body.innerHTML = "";
});

function install() {
  const say = vi.fn();
  remove = catchRedactedLinks(document, say);
  return say;
}

function link(href: string, inner = "open"): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.innerHTML = inner;
  document.body.append(a);
  return a;
}

// Whether the event went through: false when the handler prevented it.
const dispatch = (target: Element, type: string, button = 0) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button }));

describe("the demo's redacted links", () => {
  it("prevents a click on a redacted link, landing on text inside it, and says why", () => {
    const say = install();
    const a = link("https://redacted.demo.link.invalid/x", "<span>open</span>");
    expect(dispatch(a.querySelector("span")!, "click")).toBe(false);
    expect(say).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledWith(REDACTED_MESSAGE);
  });

  it("catches a middle-click but not a right-click", () => {
    const say = install();
    const a = link("https://redacted.demo.link.invalid/x");
    expect(dispatch(a, "auxclick", 2)).toBe(true);
    expect(dispatch(a, "click", 2)).toBe(true);
    expect(say).toHaveBeenCalledTimes(0);
    expect(dispatch(a, "auxclick", 1)).toBe(false);
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("leaves links to any other host alone", () => {
    const say = install();
    expect(dispatch(link("https://example.com/"), "click")).toBe(true);
    expect(dispatch(link("https://redacted.demo.link.invalid.example.com/"), "click")).toBe(true);
    expect(say).toHaveBeenCalledTimes(0);
  });

  it("stops once removed", () => {
    const say = install();
    remove!();
    remove = null;
    expect(dispatch(link("https://redacted.demo.link.invalid/x"), "click")).toBe(true);
    expect(dispatch(link("https://redacted.demo.link.invalid/y"), "auxclick", 1)).toBe(true);
    expect(say).toHaveBeenCalledTimes(0);
  });
});
