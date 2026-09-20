import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyzeClass } from "../src/pages/AnalyzeClass";
import { BUILD_VERSION } from "../src/build-info";

// The launch url a researcher bookmarks is well formed, so it reaches AnalyzeClass and the
// refusal comes from the portal rather than from the parser. app.test.tsx covers the other
// path, where `classRef` rejects the url before this page ever mounts, and it mocks this
// page out, which is why the case lives in its own file.
const CLASS_REF = { portalOrigin: "https://portal.test", classId: "111" };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AnalyzeClass with a grant the portal refuses", () => {
  function portalRefusing(status: number) {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status, json: async () => ({ message: "the grant has expired" })
    })));
  }

  it("tells the researcher to relaunch", async () => {
    portalRefusing(401);
    render(<AnalyzeClass ref_={CLASS_REF} token="expired" />);
    expect(await screen.findByText(/this link has expired/i)).toBeDefined();
  });

  // Criterion 1 asks for the build version on this page, and it is the one thing a
  // researcher reporting a dead link can give you that identifies which deploy they are on.
  it("names the build it is", async () => {
    portalRefusing(401);
    render(<AnalyzeClass ref_={CLASS_REF} token="expired" />);
    await screen.findByText(/this link has expired/i);
    expect(screen.getByText(BUILD_VERSION)).toBeDefined();
  });

  // Never a result, however the page got here: an expired grant renders no data at all.
  it("renders no analysis", async () => {
    portalRefusing(403);
    const { container } = render(<AnalyzeClass ref_={CLASS_REF} token="expired" />);
    await screen.findByText(/this link has expired/i);
    expect(container.querySelector(".display")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
