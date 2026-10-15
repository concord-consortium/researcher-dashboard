import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultView } from "../src/components/ResultView";
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
});
