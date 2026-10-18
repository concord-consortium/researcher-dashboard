import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultView } from "../src/components/ResultView";
import { formatTime } from "../src/shell/runs";
import { stamp } from "./fixtures";

afterEach(cleanup);

const FINISHED = {
  package: { identity: "projects/20/w", version: "1.0.0", checksum: "c" },
  summary: "**6** open responses", display: "# Heading\n\nBody", finished_at: stamp(1000)
};

describe("ResultView", () => {
  it("shows the summary as text", () => {
    render(<ResultView title="W" finished={FINISHED} updated={null} onClose={vi.fn()} />);
    expect(screen.getByText("**6** open responses")).toBeDefined();
    expect(document.querySelector("strong")).toBeNull();
  });

  it("renders the display as markdown", () => {
    render(<ResultView title="W" finished={FINISHED} updated={null} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 4, name: "Heading" })).toBeDefined();
  });

  it("says the result includes every save before its run began reading the class", () => {
    render(<ResultView title="W" finished={{ ...FINISHED, started_at: stamp(500) }} updated={null} onClose={vi.fn()} />);
    expect(screen.getByText(`Includes every save before ${formatTime(500)}, when this run began reading the class's data.`)).toBeDefined();
  });

  it("says nothing of it for a run with no start time", () => {
    render(<ResultView title="W" finished={FINISHED} updated={null} onClose={vi.fn()} />);
    expect(screen.queryByText(/Includes every save before/)).toBeNull();
  });
});
