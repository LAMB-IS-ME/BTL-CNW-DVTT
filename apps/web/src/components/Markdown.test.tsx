import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";
it("renders GFM, Vietnamese, math and highlighted code without raw HTML execution", () => {
  const html = renderToStaticMarkup(
    <Markdown>
      {
        "# Nguyễn Hoàng Anh\n\n$x^2$\n\n```js\nconst x = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>"
      }
    </Markdown>,
  );
  expect(html).toContain("Nguyễn Hoàng Anh");
  expect(html).toContain("katex");
  expect(html).toContain("hljs");
  expect(html).toContain("<table>");
  expect(html).not.toContain("<script>");
});
