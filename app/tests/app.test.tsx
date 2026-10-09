import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App";

afterEach(cleanup);

describe("App", () => {
  it("renders the info page, naming the portal's link as it is labeled", () => {
    render(<App start={{ kind: "info", reason: "no-launch" }} />);
    expect(screen.getByRole("heading", { name: "Researcher Dashboard" })).toBeDefined();
    expect(screen.getByText(/use the Researcher Dashboard link/)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/Analy[sz]/);
  });

  it("says why it is not showing a class", () => {
    render(<App start={{ kind: "info", reason: "unknown-portal" }} />);
    expect(screen.getByRole("status").textContent).toMatch(/portal this dashboard does not serve/);
  });

  it("says it is signing in while the browser leaves for the portal", () => {
    render(<App start={{ kind: "redirecting" }} />);
    expect(screen.getByText(/signing in/i)).toBeDefined();
  });
});
