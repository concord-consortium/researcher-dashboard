import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { Portal, ReportServer } from "../src/shell/portal";
import { SCOPE } from "./fixtures";

afterEach(cleanup);

const none = () => {};

describe("App", () => {
  it("renders the info page, naming the portal's link as it is labeled", () => {
    render(<App start={{ kind: "info", reason: "no-launch" }} reauthorize={none} />);
    expect(screen.getByRole("heading", { name: "Researcher Dashboard" })).toBeDefined();
    expect(screen.getByText(/use the Researcher Dashboard link/i)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/Analy[sz]/);
  });

  it("says the dashboard runs analyses and shows their results and counts", () => {
    render(<App start={{ kind: "info", reason: "no-launch" }} reauthorize={none} />);
    const list = screen.getByRole("heading", { name: "What it can show" }).nextElementSibling!;
    expect([...list.querySelectorAll("li")].map((li) => li.textContent!.replace(/\s+/g, " ").trim())).toEqual([
      "The analyses that apply to the class, which you can search and filter by group: Official, Project, Personal and Community.",
      "Running an analysis for the class, and reading, copying and downloading its result and its tables.",
      "Finished results that re-run on their own as students save new work.",
      "How many of the class's students saved work in the last few minutes, and the counts from your own runs."
    ]);
  });

  it("links to the demo beside it only when there is no launch, and to its own ready state from the demo", () => {
    render(<App start={{ kind: "info", reason: "no-launch" }} reauthorize={none} />);
    expect(screen.getByRole("link", { name: "Open the demo" }).getAttribute("href")).toBe("demo/?scenario=ready");
    cleanup();
    render(<App start={{ kind: "info", reason: "no-launch" }} reauthorize={none} demo />);
    expect(screen.getByRole("link", { name: "Open the demo" }).getAttribute("href")).toBe("?scenario=ready");
    cleanup();
    render(<App start={{ kind: "info", reason: "expired" }} reauthorize={none} />);
    expect(screen.queryByRole("link", { name: "Open the demo" })).toBeNull();
  });

  it("says why it is not showing a class, with the portal's error where it sent one", () => {
    render(<App start={{ kind: "info", reason: "authorize-error", detail: "server_error" }} reauthorize={none} />);
    expect(screen.getByRole("status").textContent).toMatch(/could not sign you in.*server_error/);
  });

  it.each(["withdrawn", "access-denied", "class-gone"] as const)("leaves out how to open it and what it can show when %s", (reason) => {
    render(<App start={{ kind: "info", reason }} reauthorize={none} />);
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.queryByRole("heading", { name: "How to use it" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "What it can show" })).toBeNull();
  });

  it("says who to ask when the portal refused research access at sign-in, with no portal to link back to yet", () => {
    render(<App start={{ kind: "info", reason: "access-denied" }} reauthorize={none} />);
    expect(screen.getByText(/^Research access to a class comes from/).textContent).toMatch(/ask the project's administrator, or contact Concord\.$/);
    expect(screen.queryByRole("link", { name: "Back to the portal" })).toBeNull();
  });

  it("keeps how to open it where opening it again is the way forward", () => {
    render(<App start={{ kind: "info", reason: "expired" }} reauthorize={none} />);
    expect(screen.getByRole("heading", { name: "How to use it" })).toBeDefined();
  });

  it("says it is signing in while the browser leaves for the portal", () => {
    render(<App start={{ kind: "redirecting" }} reauthorize={none} />);
    expect(screen.getByText(/signing in/i)).toBeDefined();
  });

  const signedIn = (demo = false) => {
    const token = { accessToken: "at", issuedAt: 0, expiresAt: 1 };
    const portal = { origin: "https://p.test", reportServer: "https://r.test", firebaseProject: "f", clue: { firebaseApp: "c", projectId: "c" } };
    const services = { portal: { scope: async () => SCOPE, user: async () => null } as unknown as Portal, reportServer: {} as ReportServer, watchClass: async () => () => {}, now: () => 0 };
    render(<App start={{ kind: "ready", portal, launch: { authDomain: "https://p.test", classId: "1", loginHint: null }, token }} reauthorize={none} services={services} demo={demo} />);
  };

  it("renders the class once signed in, with no name when the portal gives none", async () => {
    signedIn();
    expect(await screen.findByRole("heading", { level: 1, name: SCOPE.name })).toBeDefined();
    expect(document.querySelector(".app-header .user")).toBeNull();
    expect(within(screen.getByRole("banner")).queryByText("Demo with sample data")).toBeNull();
  });

  it("links the portal that launched it under the class's name in the Info tab's Class card", async () => {
    signedIn();
    fireEvent.click(await screen.findByRole("tab", { name: "Info" }));
    const card = screen.getByRole("region", { name: "Class" });
    const facts = [...card.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling!.textContent]);
    expect(facts.map(([label]) => label)).toEqual(["Name", "Portal", "Class ID", "Teachers", "Cohorts", "Projects"]);
    expect(within(card).getByRole("link", { name: "https://p.test" }).getAttribute("href")).toBe("https://p.test");
  });

  it("says it is a demo in the header only on the demo page", async () => {
    signedIn(true);
    const pill = within(await screen.findByRole("banner")).getByText("Demo with sample data");
    expect(pill.getAttribute("title")).toMatch(/made-up class and simulated runs/);
  });
});
