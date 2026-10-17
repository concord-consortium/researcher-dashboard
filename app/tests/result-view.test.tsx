import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultActions, ResultView, ResultWhen } from "../src/components/ResultView";
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

  it("copies the display markdown and says so", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ResultActions classTitle="Period 2" finished={FINISHED} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
    expect(writeText).toHaveBeenCalledWith("# Heading\n\nBody");
    expect(screen.getByText("Copied the markdown.").closest("[aria-live]")).not.toBeNull();
  });

  it("says when the markdown could not be copied, with no clipboard at all", async () => {
    vi.stubGlobal("navigator", {});
    render(<ResultActions classTitle="Period 2" finished={FINISHED} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
    expect(screen.getByText("The markdown could not be copied.")).toBeDefined();
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
