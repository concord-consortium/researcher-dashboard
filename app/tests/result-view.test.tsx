import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPIED_MS, ResultActions, ResultView, ResultWhen } from "../src/components/ResultView";
import { formatTime } from "../src/shell/runs";
import { stamp } from "./fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const FINISHED = {
  package: { identity: "projects/20/w", version: "1.0.0", checksum: "c" },
  summary: "**6** open responses", display: "# Heading\n\nBody", finished_at: stamp(1000)
};

describe("ResultView", () => {
  it("renders the display as markdown", () => {
    render(<ResultView finished={FINISHED} updated={null} />);
    expect(screen.getByRole("heading", { level: 3, name: "Heading" })).toBeDefined();
  });

  it("says the version and finish time, with what the run read as the title and for a screen reader", () => {
    const read = `Includes every save before ${formatTime(500)}, when this run began reading the class's data.`;
    render(<ResultWhen finished={{ ...FINISHED, started_at: stamp(500) }} />);
    const line = document.querySelector(".result-when")!;
    expect(line.getAttribute("title")).toBe(read);
    expect(line.querySelector(".visually-hidden")!.textContent).toBe(` ${read}`);
    expect(line.textContent).toBe(`Version 1.0.0 · Finished ${formatTime(1000)} ${read}`);
  });

  it("says nothing of what it read for a run with no start time", () => {
    render(<ResultWhen finished={FINISHED} />);
    const line = document.querySelector(".result-when")!;
    expect(line.hasAttribute("title")).toBe(false);
    expect(line.textContent).toBe(`Version 1.0.0 · Finished ${formatTime(1000)}`);
  });

  const live = () => document.querySelector("[aria-live]")!;

  it("copies the display markdown, shows it on the button for a while and says so to a screen reader", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ResultActions classTitle="Period 2" finished={FINISHED} />);
    const button = screen.getByRole("button", { name: "Copy" });
    await act(async () => fireEvent.click(button));
    expect(writeText).toHaveBeenCalledWith("# Heading\n\nBody");
    expect(button.classList.contains("copy-ok")).toBe(true);
    expect(live().textContent).toBe("Copied the markdown.");
    expect(live().classList.contains("visually-hidden")).toBe(true);
    act(() => vi.advanceTimersByTime(COPIED_MS - 1));
    expect(button.classList.contains("copy-ok")).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(button.classList.contains("copy-ok")).toBe(false);
    expect(live().textContent).toBe("");
    vi.useRealTimers();
  });

  it("shows on the button, and says, when the markdown could not be copied, with no clipboard at all", async () => {
    vi.stubGlobal("navigator", {});
    render(<ResultActions classTitle="Period 2" finished={FINISHED} />);
    const button = screen.getByRole("button", { name: "Copy" });
    await act(async () => fireEvent.click(button));
    expect(button.classList.contains("danger")).toBe(true);
    expect(live().textContent).toBe("The markdown could not be copied.");
  });

  it("downloads the display markdown under the package, class and finish date, then releases it", async () => {
    vi.useFakeTimers();
    let saved: Blob | null = null;
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: (blob: Blob) => { saved = blob; return "blob:result"; }, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(`w-period-2-${new Date(1000).toLocaleDateString("en-CA")}.md`);
      expect(this.getAttribute("href")).toBe("blob:result");
    });
    render(<ResultActions classTitle="Period 2" finished={FINISHED} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(click).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:result");
    vi.useRealTimers();
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(saved!);
    });
    expect(text).toBe("# Heading\n\nBody");
  });

});
