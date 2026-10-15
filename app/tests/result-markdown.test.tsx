import { cleanup, render } from "@testing-library/react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { afterEach, describe, expect, it } from "vitest";
import { ResultMarkdown, SCHEMA } from "../src/components/ResultMarkdown";

afterEach(cleanup);

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const HOSTILE = `# Title

## Section

<script>alert(1)</script>

<img src=x onerror=alert(1)>

<iframe src="https://evil.test/frame"></iframe>

[x](javascript:alert(1)) [y](javascript:void('https:')) [r](/relative)

![remote](https://evil.test/b.png) ![svg](data:image/svg+xml;base64,PHN2Zz4=) ![png](${PNG})

[ok](https://concord.org)

| left | right |
|:-----|------:|
| a    | b     |

- [x] done
- [ ] not done
`;

const LINK = /^(https?:|mailto:)/i;

describe.each([true, false])("ResultMarkdown with the sanitizer %s", (sanitize) => {
  it("renders no script, frame or remote image, and no handler or unsafe link", () => {
    const { container } = render(<ResultMarkdown markdown={HOSTILE} sanitize={sanitize} />);
    expect(container.querySelectorAll("script, iframe, object")).toHaveLength(0);
    const images = [...container.querySelectorAll("img")];
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toBe(PNG);
    const all = [...container.querySelectorAll("*")];
    expect(all.length).toBeGreaterThan(10);
    for (const element of all) {
      for (const attribute of element.getAttributeNames()) expect(attribute.startsWith("on"), `${element.tagName} ${attribute}`).toBe(false);
    }
    const hrefs = [...container.querySelectorAll("[href]")].map((e) => e.getAttribute("href")!);
    expect(hrefs).toContain("https://concord.org");
    for (const href of hrefs) expect(href).toMatch(LINK);
  });

  it("shows the HTML as text", () => {
    const { container } = render(<ResultMarkdown markdown={HOSTILE} sanitize={sanitize} />);
    expect(container.textContent).toContain("<script>");
    expect(container.textContent).toContain("onerror=alert(1)");
  });

  it("keeps a refused link's or image's text, as text", () => {
    const { container } = render(<ResultMarkdown markdown={HOSTILE} sanitize={sanitize} />);
    for (const text of ["x", "y", "r", "remote", "svg"]) {
      const span = [...container.querySelectorAll("span")].find((s) => s.textContent === text);
      expect(span, text).toBeDefined();
      expect(span!.closest("a")).toBeNull();
    }
  });

  it("renders what a result may hold: a link, a table, a task list and headings below the result's own", () => {
    const { container } = render(<ResultMarkdown markdown={HOSTILE} sanitize={sanitize} />);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    const cells = [...container.querySelectorAll("table td")] as HTMLElement[];
    expect(cells.map((c) => c.style.textAlign)).toEqual(["left", "right"]);
    const boxes = [...container.querySelectorAll("input[type=checkbox]")] as HTMLInputElement[];
    expect(boxes.map((b) => [b.disabled, b.checked])).toEqual([[true, true], [true, false]]);
    expect(container.querySelector("h4")!.textContent).toBe("Title");
    expect(container.querySelector("h5")!.textContent).toBe("Section");
    expect(container.querySelector("h1, h2, h3")).toBeNull();
  });
});

describe("SCHEMA", () => {
  // rehype-raw stands in for an HTML parser that was never switched off.
  it("drops elements CommonMark and GFM do not produce, should HTML ever reach the tree", () => {
    const { container } = render(
      <Markdown rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA]]}>
        {`<picture><source srcset="https://evil.test/a.png"><img src="${PNG}"></picture>\n\n<details><summary>s</summary>d</details>`}
      </Markdown>
    );
    expect(container.querySelectorAll("source, picture, details")).toHaveLength(0);
  });
});
