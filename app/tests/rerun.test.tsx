import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAutoRerun } from "../src/shell/rerun";

afterEach(cleanup);

type Behind = Map<string, { row: string; at: number | null }>;

function Probe({ behind, stopped = false, request }: { behind: Behind; stopped?: boolean; request: (key: string, row: string) => Promise<boolean> }) {
  useAutoRerun(behind, stopped, request);
  return null;
}

const item = (at: number | null): Behind => new Map([["a", { row: "row a", at }]]);

it("requests a behind item once on the first render", () => {
  const request = vi.fn(async () => true);
  render(<Probe behind={item(10)} request={request} />);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith("a", "row a");
});

it("does not request again for a new map holding the same result", () => {
  const request = vi.fn(async () => true);
  const { rerender } = render(<Probe behind={item(10)} request={request} />);
  rerender(<Probe behind={item(10)} request={request} />);
  rerender(<Probe behind={new Map()} request={request} />);
  rerender(<Probe behind={item(10)} request={request} />);
  expect(request).toHaveBeenCalledTimes(1);
});

it("requests once more for a newer result", () => {
  const request = vi.fn(async () => true);
  const { rerender } = render(<Probe behind={item(10)} request={request} />);
  rerender(<Probe behind={item(20)} request={request} />);
  expect(request).toHaveBeenCalledTimes(2);
});

it("requests nothing while stopped", () => {
  const request = vi.fn(async () => true);
  const { rerender } = render(<Probe behind={item(10)} stopped request={request} />);
  rerender(<Probe behind={item(20)} stopped request={request} />);
  expect(request).not.toHaveBeenCalled();
});

it("asks again for an item whose request did not take once it is no longer stopped, and not for one that did", async () => {
  const request = vi.fn(async (key: string) => key === "a");
  const both: Behind = new Map([["a", { row: "row a", at: 10 }], ["b", { row: "row b", at: 10 }]]);
  const { rerender } = render(<Probe behind={both} request={request} />);
  await act(async () => { await Promise.resolve(); });
  rerender(<Probe behind={both} stopped request={request} />);
  rerender(<Probe behind={both} request={request} />);
  expect(request.mock.calls.map((c) => c[0])).toEqual(["a", "b", "b"]);
});
