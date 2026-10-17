import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultView } from "../src/components/ResultView";
import { formatTime } from "../src/shell/runs";
import { stamp } from "./fixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const FINISHED = {
  package: { identity: "projects/20/w", version: "1.0.0", checksum: "c" },
  summary: "**6** open responses", display: "# Heading\n\nBody", finished_at: stamp(1000)
};

describe("ResultView", () => {
  it("shows the summary as text", () => {
    render(<ResultView title="W" classTitle="Period 2" finished={FINISHED} updated={null} onClose={vi.fn()} />);
    expect(screen.getByText("**6** open responses")).toBeDefined();
    expect(document.querySelector("strong")).toBeNull();
  });

  it("renders the display as markdown", () => {
    render(<ResultView title="W" classTitle="Period 2" finished={FINISHED} updated={null} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 4, name: "Heading" })).toBeDefined();
  });

  it("says the result includes every save before its run began reading the class", () => {
    render(<ResultView title="W" classTitle="Period 2" finished={{ ...FINISHED, started_at: stamp(500) }} updated={null} onClose={vi.fn()} />);
    expect(screen.getByText(`Includes every save before ${formatTime(500)}, when this run began reading the class's data.`)).toBeDefined();
  });

  it("says nothing of it for a run with no start time", () => {
    render(<ResultView title="W" classTitle="Period 2" finished={FINISHED} updated={null} onClose={vi.fn()} />);
    expect(screen.queryByText(/Includes every save before/)).toBeNull();
  });

  it("copies the display markdown and says so", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ResultView title="W" classTitle="Period 2" finished={FINISHED} updated={null} onClose={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy markdown" })));
    expect(writeText).toHaveBeenCalledWith("# Heading\n\nBody");
    expect(screen.getByText("Copied the markdown.").closest("[aria-live]")).not.toBeNull();
  });

  it("says when the markdown could not be copied, with no clipboard at all", async () => {
    vi.stubGlobal("navigator", {});
    render(<ResultView title="W" classTitle="Period 2" finished={FINISHED} updated={null} onClose={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy markdown" })));
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
    render(<ResultView title="W" classTitle="Period 2" finished={FINISHED} updated={null} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Download .md" }));
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

  it("offers neither for a result with no display", () => {
    render(<ResultView title="W" classTitle="Period 2" finished={{ ...FINISHED, display: null }} updated={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Copy markdown" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download .md" })).toBeNull();
  });
});
