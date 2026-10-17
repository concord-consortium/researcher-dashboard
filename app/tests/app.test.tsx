import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { Portal, ReportServer } from "../src/shell/portal";
import { jwt, SCOPE } from "./fixtures";

afterEach(cleanup);

const none = () => {};

describe("App", () => {
  it("renders the info page, naming the portal's link as it is labeled", () => {
    render(<App start={{ kind: "info", reason: "no-launch" }} reauthorize={none} />);
    expect(screen.getByRole("heading", { name: "Researcher Dashboard" })).toBeDefined();
    expect(screen.getByText(/use the Researcher Dashboard link/)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/Analy[sz]/);
  });

  it("says the dashboard runs packages and shows their results and counts", () => {
    render(<App start={{ kind: "info", reason: "no-launch" }} reauthorize={none} />);
    const list = screen.getByRole("heading", { name: "What it can show" }).nextElementSibling!;
    expect(list.textContent).toMatch(/Running a package for the class, and the result it wrote\./);
    expect(list.textContent).toMatch(/The counts from your own runs\./);
    expect(list.textContent).toMatch(/How many of the class's students saved work in the last few minutes\./);
  });

  it("says why it is not showing a class, with the portal's error where it sent one", () => {
    render(<App start={{ kind: "info", reason: "authorize-error", detail: "server_error" }} reauthorize={none} />);
    expect(screen.getByRole("status").textContent).toMatch(/could not sign you in.*server_error/);
  });

  it("says it is signing in while the browser leaves for the portal", () => {
    render(<App start={{ kind: "redirecting" }} reauthorize={none} />);
    expect(screen.getByText(/signing in/i)).toBeDefined();
  });

  const signedIn = (accessToken: string, demo = false) => {
    const token = { accessToken, issuedAt: 0, expiresAt: 1 };
    const portal = { origin: "https://p.test", reportServer: "https://r.test", firebaseProject: "f" };
    const services = { portal: { scope: async () => SCOPE } as unknown as Portal, reportServer: {} as ReportServer, watchClass: async () => () => {}, now: () => 0 };
    render(<App start={{ kind: "ready", portal, launch: { authDomain: "https://p.test", classId: "1", loginHint: null }, token }} reauthorize={none} services={services} demo={demo} />);
  };

  it("renders the class once signed in, with no name for a token that has none", async () => {
    signedIn("at");
    expect(await screen.findByRole("heading", { level: 1, name: SCOPE.name })).toBeDefined();
    expect(document.querySelector(".app-header .user")).toBeNull();
    expect(within(screen.getByRole("banner")).queryByText("Demo with sample data")).toBeNull();
  });

  it("says it is a demo in the header only on the demo page", async () => {
    signedIn("at", true);
    const pill = within(await screen.findByRole("banner")).getByText("Demo with sample data");
    expect(pill.getAttribute("title")).toMatch(/made-up class and simulated runs/);
  });

  it("names the signed-in user in the header, with their username, from the token's claims", async () => {
    signedIn(jwt({ uid: 200, first_name: "Dana", last_name: "Researcher", username: "dresearcher" }));
    const banner = await screen.findByRole("banner");
    expect(within(banner).getByText("Dana Researcher")).toBeDefined();
    expect(within(banner).getByText("dresearcher")).toBeDefined();
  });
});
