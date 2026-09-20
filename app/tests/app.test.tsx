import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

// AnalyzeClass talks to the portal and to Firebase the moment it mounts, neither of which
// this test is about: what is under test is which page the launch url selects.
vi.mock("../src/pages/AnalyzeClass", () => ({
  AnalyzeClass: ({ token }: { token: string }) => <div>analyze-class for {token}</div>
}));

const CLASS_URL = "https://learn.portal.staging.concord.org/api/v1/classes/111";

afterEach(cleanup);

describe("App", () => {
  it("renders analyze-class for a complete launch", () => {
    render(<App search={`?page=analyze-class&class=${encodeURIComponent(CLASS_URL)}&token=grant-1`} />);
    expect(screen.getByText(/analyze-class for grant-1/)).toBeDefined();
  });

  it("renders the info page at the root", () => {
    render(<App search="" />);
    expect(screen.getByRole("heading", { name: "Researcher Dashboard" })).toBeDefined();
    expect(screen.getByText(/launched one class at a time from the portal/i)).toBeDefined();
  });

  // The bookmark case: the launch url is intact but the grant is not, and the researcher
  // needs telling to go back to the portal rather than being shown a generic page.
  it("tells a researcher with a stale launch url to relaunch", () => {
    render(<App search="?page=analyze-class&token=expired" />);
    expect(screen.getByText(/this link has expired/i)).toBeDefined();
  });

  it("renders the info page for a page it does not know", () => {
    render(<App search={`?page=analyze-cohort&class=${encodeURIComponent(CLASS_URL)}&token=grant-1`} />);
    expect(screen.queryByText(/analyze-class for/)).toBeNull();
  });

  // portal-report has a fake-data demo mode. Copying it would put invented analyses in
  // front of a researcher, which read as real results. The page may describe what the
  // dashboard can show; what it must not do is render a result.
  it("renders no analysis result on the info page", () => {
    const { container } = render(<App search="" />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.querySelector(".display")).toBeNull();
    expect(container.querySelector(".summary")).toBeNull();
  });
});
