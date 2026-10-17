import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ActiveCount } from "../src/components/ClassActivity";
import { stamp } from "./fixtures";

vi.mock("../src/shell/activity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/shell/activity")>()),
  ACTIVE_WINDOW_MINUTES: 7
}));

afterEach(cleanup);

it("names the window from its constant", () => {
  render(<ActiveCount activity={new Map([["u", { lastActivityAt: stamp(Date.now()) }]])} now={Date.now} />);
  expect(document.querySelector(".active-count")!.textContent).toBe("1 student active in the last 7 minutes");
});
