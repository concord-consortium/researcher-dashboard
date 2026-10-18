import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const renders = vi.hoisted(() => ({ count: 0 }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => { renders.count += 1; return <p>{children}</p>; }
}));

const { ResultMarkdown } = await import("../src/components/ResultMarkdown");

afterEach(cleanup);

function Parent({ tick }: { tick: number }) {
  return <div data-tick={tick}><ResultMarkdown markdown="# Result" /></div>;
}

it("does not render the same markdown again when its parent re-renders", () => {
  const { rerender } = render(<Parent tick={1} />);
  rerender(<Parent tick={2} />);
  expect(renders.count).toBe(1);
});
