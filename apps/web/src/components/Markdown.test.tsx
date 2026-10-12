import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";
import { createRequire } from "node:module";
import { micromark } from "micromark";
import { math, mathHtml } from "micromark-extension-math";
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

it("keeps the micromark math HTML API compatible with inline and display math", () => {
  const html = micromark("$x^2$\n\n$$\n\\frac{1}{2}\n$$", {
    extensions: [math()],
    htmlExtensions: [mathHtml()],
  });
  expect(html).toContain("<msup>");
  expect(html).toContain("<mfrac>");
  expect(html).toContain('class="katex-display"');
});

it.each(["rehype-katex", "micromark-extension-math"])(
  "%s resolves a renderer that rejects inherited trust before HTML sanitization",
  (consumer) => {
    const require = createRequire(import.meta.url);
    const katex = createRequire(require.resolve(consumer))("katex");
    const html = katex.renderToString(
      String.raw`\includegraphics{https://example.invalid/probe.png}`,
      Object.assign(Object.create({ trust: true }), { strict: "ignore" }),
    );
    expect(html).not.toContain("<img");
    expect(
      katex.renderToString(
        String.raw`\href{javascript:alert(1)}{click}`,
        Object.assign(Object.create({ trust: true }), { strict: "ignore" }),
      ),
    ).not.toMatch(/href="javascript:/i);
    // Explicit trusted rendering remains available upstream; the app never enables it.
    expect(
      katex.renderToString(
        String.raw`\includegraphics{https://example.invalid/probe.png}`,
        { trust: true, strict: "ignore" },
      ),
    ).toContain("<img");
  },
);

it("renders inline/block math, aligned equations and malformed-math fallback", () => {
  const html = renderToStaticMarkup(
    <Markdown>{String.raw`Tiếng Việt: $\frac{1}{2}+\sqrt{x}$.

$$
\begin{aligned}a&=b+c\\d&=\sum_{i=1}^{n} i\end{aligned}
$$

Invalid: $\notARealCommand{x}$`}</Markdown>,
  );
  expect(html).toContain("Tiếng Việt");
  expect(html).toContain('class="katex-display"');
  expect(html).toContain("<math");
  expect(html).toContain("<mfrac>");
  expect(html).toContain("<msqrt>");
  expect(html).toContain("<mtable");
  expect(html).toContain("notARealCommand");
});

it("does not enable trusted math from inherited renderer options", () => {
  // GHSA-238p-pmpm-9mq7: simulate the prerequisite without adding a pollution path.
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "trust");
  Object.defineProperty(Object.prototype, "trust", {
    value: true,
    configurable: true,
  });
  try {
    const html = renderToStaticMarkup(
      <Markdown>{String.raw`$\href{javascript:alert(1)}{click}$ $\includegraphics{https://example.invalid/probe.png}$`}</Markdown>,
    );
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toContain("<img");
    expect(html).toContain("katex");
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "trust", previous);
    else Reflect.deleteProperty(Object.prototype, "trust");
  }
});
