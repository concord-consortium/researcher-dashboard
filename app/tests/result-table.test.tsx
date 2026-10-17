import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultMarkdown } from "../src/components/ResultMarkdown";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const MARKDOWN = `| Untitled | n |
|---|---:|
| a | 1 |

## Task 23: Fires

| Level | Students |
|---|---:|
| 1 | 0 of 14 |
| 2 | 3, of 14 |
`;

const blocks = () => [...document.querySelectorAll(".result-table")] as HTMLElement[];

const read = (blob: Blob) => new Promise<string>((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.readAsText(blob);
});

// The name and text of what one Download CSV saves.
async function downloaded(block: HTMLElement) {
  let saved: Blob | null = null, name = "";
  vi.stubGlobal("URL", { createObjectURL: (blob: Blob) => { saved = blob; return "blob:t"; }, revokeObjectURL: () => {} });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
  fireEvent.click(within(block).getByRole("button", { name: /^Download CSV/ }));
  const text = await read(saved!);
  // The link's object URL is released on the next tick, while URL is still the stub.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { name, text };
}

describe("a result's tables", () => {
  it("each have Copy table and Download CSV under them", () => {
    render(<ResultMarkdown markdown={MARKDOWN} fileBase="use-p2" />);
    expect(blocks()).toHaveLength(2);
    for (const block of blocks()) {
      expect(block.firstElementChild!.tagName).toBe("TABLE");
      expect(within(block.querySelector(".table-actions") as HTMLElement).getAllByRole("button").map((b) => b.textContent))
        .toEqual(["Copy table", "Download CSV"]);
    }
    const named = blocks()[1];
    expect(named.querySelector("table")!.getAttribute("aria-label")).toBe("Task 23: Fires");
    expect(within(named).getAllByRole("button").map((b) => b.getAttribute("aria-label")))
      .toEqual(["Copy table: Task 23: Fires", "Download CSV: Task 23: Fires"]);
    expect(blocks()[0].querySelector("table")!.hasAttribute("aria-label")).toBe(false);
  });

  it("download as CSV named after the heading above, else by their place", async () => {
    render(<ResultMarkdown markdown={MARKDOWN} fileBase="use-p2" />);
    expect(await downloaded(blocks()[1])).toEqual({ name: "use-p2-task-23-fires.csv", text: "Level,Students\r\n1,0 of 14\r\n2,\"3, of 14\"\r\n" });
    expect((await downloaded(blocks()[0])).name).toBe("use-p2-table-1.csv");
  });

  it("copy as a table and as tab-separated text", async () => {
    const write = vi.fn(async () => {});
    vi.stubGlobal("ClipboardItem", class { constructor(readonly items: Record<string, Blob>) {} });
    vi.stubGlobal("navigator", { clipboard: { write } });
    render(<ResultMarkdown markdown={MARKDOWN} />);
    const button = within(blocks()[1]).getByRole("button", { name: /^Copy table/ });
    await act(async () => fireEvent.click(button));
    const [[[item]]] = write.mock.calls as unknown as [[[{ items: Record<string, Blob> }]]];
    expect(await read(item.items["text/plain"])).toBe("Level\tStudents\n1\t0 of 14\n2\t3, of 14");
    expect(await read(item.items["text/html"])).toBe(
      "<table><tr><th>Level</th><th>Students</th></tr><tr><td>1</td><td>0 of 14</td></tr><tr><td>2</td><td>3, of 14</td></tr></table>");
    expect(button.classList.contains("copy-ok")).toBe(true);
  });

  it("copy as tab-separated text where the browser has no ClipboardItem", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("ClipboardItem", undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ResultMarkdown markdown={MARKDOWN} />);
    await act(async () => fireEvent.click(within(blocks()[0]).getByRole("button", { name: /^Copy table/ })));
    expect(writeText).toHaveBeenCalledWith("Untitled\tn\na\t1");
  });
});
