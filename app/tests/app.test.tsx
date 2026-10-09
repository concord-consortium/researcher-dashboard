import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App";

afterEach(cleanup);

describe("App", () => {
  it("renders the info page, naming the portal's link as it is labeled", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Researcher Dashboard" })).toBeDefined();
    expect(screen.getByText(/use the Researcher Dashboard link/)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/Analy[sz]/);
  });
});
