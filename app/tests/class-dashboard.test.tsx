import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassDashboard } from "../src/pages/ClassDashboard";
import { ApiError, SessionExpired, type Portal, type Scope } from "../src/shell/portal";
import type { DashboardServices } from "../src/shell/services";
import { SCOPE } from "./fixtures";

afterEach(cleanup);

function services(scope: () => Promise<Scope>): DashboardServices {
  return { portal: { scope } as unknown as Portal };
}

function mount(scope: () => Promise<Scope>, onExpired = vi.fn()) {
  render(<ClassDashboard services={services(scope)} onExpired={onExpired} />);
  return onExpired;
}

describe("ClassDashboard", () => {
  it("shows the class, its teachers, cohorts and assignments", async () => {
    mount(async () => SCOPE);
    expect(await screen.findByRole("heading", { level: 1, name: SCOPE.name })).toBeDefined();
    expect(screen.getByText(/T\. Teacher · Spike cohort/)).toBeDefined();
    expect(screen.getByRole("listitem").textContent).toBe("Wildfire · ActivityPlayer");
  });

  it("names an untitled assignment", async () => {
    mount(async () => ({ ...SCOPE, assignments: [{ ...SCOPE.assignments[0], name: null, tool: null }] }));
    expect((await screen.findByRole("listitem")).textContent).toBe("Untitled");
  });

  it("announces the loading line, and a failure in its place", async () => {
    mount(async () => { throw new TypeError("Failed to fetch"); });
    expect(screen.getByRole("status").textContent).toBe("Loading the class…");
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("The portal could not be reached."));
  });

  it("shows the portal's own message for a refusal it explains", async () => {
    mount(async () => { throw new ApiError("The Researcher Dashboard is not fully configured", 503); });
    expect(await screen.findByText(/not fully configured/)).toBeDefined();
  });

  it("renders the withdrawn page on a 403", async () => {
    mount(async () => { throw new ApiError("You do not have access to this class as a researcher", 403); });
    expect(await screen.findByText(/access to this class has been withdrawn/)).toBeDefined();
  });

  it("renders the class-gone page on a 404", async () => {
    mount(async () => { throw new ApiError("The class this token was issued for no longer exists", 404); });
    expect(await screen.findByText(/class no longer exists/)).toBeDefined();
  });

  it("opens classes only", async () => {
    mount(async () => ({ ...SCOPE, kind: "cohort" }));
    expect(await screen.findByText(/opens classes only/)).toBeDefined();
  });

  it("re-authorizes on an expired token, and stops on a fresh one refused", async () => {
    const onExpired = mount(async () => { throw new SessionExpired(false); });
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
    cleanup();
    const stop = mount(async () => { throw new SessionExpired(true); });
    expect(await screen.findByText(/could not be renewed/)).toBeDefined();
    expect(stop).not.toHaveBeenCalled();
  });
});
