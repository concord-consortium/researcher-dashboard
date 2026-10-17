import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTENTS_MIN_HEADINGS, ResultMarkdown, SIDEBAR_QUERY } from "../src/components/ResultMarkdown";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const LONG = "# Overview\n\nText.\n\n# Patterns\n\n## Task 23\n\n| A |\n|---|\n| 1 |\n\n## Task 24\n\nText.\n\n# Settings\n\n## Terrain\n";
const contents = () => screen.queryByRole("navigation", { name: "Result contents" });

describe("a result's contents", () => {
  it("lists a long result's sections with their subsections under them", () => {
    render(<ResultMarkdown markdown={LONG} />);
    const top = within(contents()!).getAllByRole("list")[0];
    const sections = [...top.children].map((li) => [
      li.querySelector(":scope > button")!.textContent,
      [...li.querySelectorAll(":scope > ol button")].map((b) => b.textContent)
    ]);
    expect(sections).toEqual([["Overview", []], ["Patterns", ["Task 23", "Task 24"]], ["Settings", ["Terrain"]]]);
  });

  it("takes a single heading that leads the result as its title, and lists the two levels below it", () => {
    render(<ResultMarkdown markdown={"# Title\n\n## Patterns\n\n### Task 23\n\n#### Detail\n\n## Settings\n\n### Terrain\n"} />);
    expect(within(contents()!).getAllByRole("button").map((b) => b.textContent)).toEqual(["Patterns", "Task 23", "Settings", "Terrain"]);
  });

  it("can be hidden above the result, and always shows beside it on a wide window", () => {
    render(<ResultMarkdown markdown={LONG} />);
    expect(contents()!.closest("details")).not.toBeNull();
    expect(contents()!.closest(".result-layout")!.classList.contains("sidebar")).toBe(false);
    cleanup();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === SIDEBAR_QUERY, addEventListener: () => {}, removeEventListener: () => {}
    }));
    render(<ResultMarkdown markdown={LONG} />);
    expect(contents()!.closest("details")).toBeNull();
    expect(contents()!.closest(".result-layout")!.classList.contains("sidebar")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("is left out of a result with fewer headings", () => {
    expect(CONTENTS_MIN_HEADINGS).toBe(4);
    render(<ResultMarkdown markdown={"# One\n\n# Two\n\n## Three\n"} />);
    expect(contents()).toBeNull();
    cleanup();
    render(<ResultMarkdown markdown={"# One\n\n# Two\n\n## Three\n\n## Four\n"} />);
    expect(contents()).not.toBeNull();
  });

  it("scrolls to and focuses the heading an entry names, leaving the URL alone", () => {
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) { scrolled.push(this); });
    window.location.hash = "#packages/official__wildfire-model-use";
    render(<ResultMarkdown markdown={LONG} />);
    fireEvent.click(within(contents()!).getByRole("button", { name: "Task 24" }));
    const heading = screen.getByRole("heading", { name: "Task 24" });
    expect(document.activeElement).toBe(heading);
    expect(scrolled).toEqual([heading]);
    expect(window.location.hash).toBe("#packages/official__wildfire-model-use");
  });
});
