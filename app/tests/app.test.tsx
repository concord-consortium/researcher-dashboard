import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { Portal } from "../src/shell/portal";
import { SCOPE } from "./fixtures";

afterEach(cleanup);

const none = () => {};

describe("App", () => {
  it("renders the info page, naming the portal's link as it is labeled", () => {
    render(<App start={{ kind: "info", reason: "no-launch" }} reauthorize={none} />);
    expect(screen.getByRole("heading", { name: "Researcher Dashboard" })).toBeDefined();
    expect(screen.getByText(/use the Researcher Dashboard link/)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/Analy[sz]/);
  });

  it("says why it is not showing a class, with the portal's error where it sent one", () => {
    render(<App start={{ kind: "info", reason: "authorize-error", detail: "server_error" }} reauthorize={none} />);
    expect(screen.getByRole("status").textContent).toMatch(/could not sign you in.*server_error/);
  });

  it("says it is signing in while the browser leaves for the portal", () => {
    render(<App start={{ kind: "redirecting" }} reauthorize={none} />);
    expect(screen.getByText(/signing in/i)).toBeDefined();
  });

  it("renders the class once signed in", async () => {
    const token = { accessToken: "at", issuedAt: 0, expiresAt: 1 };
    const portal = { origin: "https://p.test", reportServer: "https://r.test", firebaseProject: "f" };
    const services = { portal: { scope: async () => SCOPE } as unknown as Portal, watchProfile: async () => () => {}, now: () => 0 };
    render(<App start={{ kind: "ready", portal, launch: { authDomain: "https://p.test", classId: "1", loginHint: null }, token }} reauthorize={none} services={services} />);
    expect(await screen.findByRole("heading", { level: 1, name: SCOPE.name })).toBeDefined();
  });
});
