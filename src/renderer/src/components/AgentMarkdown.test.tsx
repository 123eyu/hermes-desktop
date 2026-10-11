import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentMarkdown } from "./AgentMarkdown";

vi.mock("./useI18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        "common.copied": "Copied",
        "common.showMore": "Show more",
        "common.showLess": "Show less",
      })[key] ?? key,
  }),
}));

vi.mock("./MediaImage", () => ({
  MediaImage: () => <div data-testid="media-image" />,
  DownloadChip: () => <div data-testid="download-chip" />,
}));

// Wait until the lazily-imported Prism highlighter has produced token spans,
// so a later "no .token" assertion is meaningful rather than just observing
// the not-yet-loaded fallback.
async function renderHighlighted(
  markdown: string,
): Promise<ReturnType<typeof render>> {
  const view = render(<AgentMarkdown>{markdown}</AgentMarkdown>);
  await waitFor(
    () => expect(view.container.querySelector(".token")).not.toBeNull(),
    { timeout: 5_000 },
  );
  return view;
}

describe("AgentMarkdown", () => {
  // @lat: [[rtl-chat#Bidirectional message rendering#Independent prose blocks]]
  it.each(["مرحبا بالعالم", "سلام دنیا", "שלום עולם"])(
    "detects each prose block independently for %s followed by English",
    (rtl) => {
      const { container } = render(
        <div dir="rtl">
          <AgentMarkdown>{`${rtl}\n\nEnglish first: translate "שלום"?`}</AgentMarkdown>
        </div>,
      );
      const paragraphs = container.querySelectorAll("p");
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[0]).toHaveAttribute("dir", "auto");
      expect(paragraphs[1]).toHaveAttribute("dir", "auto");
      expect(paragraphs[1].textContent).toBe(
        'English first: translate "שלום"?',
      );
    },
  );

  // @lat: [[rtl-chat#Bidirectional message rendering#Structured mixed-language content]]
  it("keeps independent list, quotation and table directions without losing Markdown semantics", () => {
    const { container } = render(
      <AgentMarkdown>
        {[
          "# عنوان فارسی",
          "",
          "- English item with سلام",
          "- مورد فارسی با `value = 1;`",
          "",
          "> نقل قول فارسی",
          "",
          "| English | فارسی |",
          "| :---: | --- |",
          "| mixed שלום | مقدار |",
          "",
          "- [x] Completed task",
        ].join("\n")}
      </AgentMarkdown>,
    );
    for (const element of container.querySelectorAll(
      "h1, ul, li, blockquote, th, td",
    )) {
      expect(element).toHaveAttribute("dir", "auto");
    }
    expect(container.querySelector("th")).toHaveStyle({ textAlign: "center" });
    expect(container.querySelector("code")).toHaveAttribute("dir", "ltr");
    expect(container.querySelector(".task-list-item")).not.toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeChecked();
  });

  // @lat: [[rtl-chat#Bidirectional message rendering#Loose list and quotation containers]]
  it.each(["ltr", "rtl"])(
    "lets loose items and quotations read first prose under a %s interface",
    (direction) => {
      const { container } = render(
        <div dir={direction}>
          <AgentMarkdown>
            {[
              "- سلام",
              "",
              "- دنیا",
              "",
              "  English later paragraph with سلام",
              "",
              "> `const first = 1;`",
              ">",
              "> **سلام** [دنیا](https://example.com)",
              ">",
              "> English later quote",
              "",
              "- ```js",
              "  // code first",
              "  ```",
              "",
              "  سلام پس از کد",
              "",
              "> English first with سلام",
              ">",
              "> فارسی بعدی",
            ].join("\n")}
          </AgentMarkdown>
        </div>,
      );
      const items = container.querySelectorAll("li");
      expect(items).toHaveLength(3);
      for (const item of items) {
        expect(item).toHaveAttribute("dir", "auto");
        expect(item.querySelector("p")).not.toHaveAttribute("dir");
      }
      expect(items[1].querySelectorAll("p")[1]).toHaveAttribute("dir", "auto");
      const quotes = container.querySelectorAll("blockquote");
      const paragraphs = quotes[0].querySelectorAll("p");
      expect(quotes[0]).toHaveAttribute("dir", "auto");
      expect(paragraphs[0]).toHaveAttribute("dir", "auto");
      expect(paragraphs[1]).not.toHaveAttribute("dir");
      expect(paragraphs[1].querySelector("a")).not.toHaveAttribute("dir");
      expect(paragraphs[2]).toHaveAttribute("dir", "auto");
      expect(quotes[1].querySelectorAll("p")[0]).not.toHaveAttribute("dir");
      expect(quotes[1].querySelectorAll("p")[1]).toHaveAttribute("dir", "auto");
      expect(paragraphs[0].querySelector("code")).toHaveAttribute("dir", "ltr");
      expect(items[2].querySelector(".chat-code-block")).toHaveAttribute(
        "dir",
        "ltr",
      );
      expect(items[2].querySelector("pre")).toHaveAttribute("dir", "ltr");
    },
  );

  // @lat: [[rtl-chat#Bidirectional message rendering#Heading first containers]]
  it.each(["ltr", "rtl"])(
    "exposes first prose headings under a %s interface",
    (direction) => {
      const { container } = render(
        <div dir={direction}>
          <AgentMarkdown>
            {
              "> # سلام\n>\n> English paragraph\n>\n> ## English heading\n\n- ## سلام\n\n  English later\n\n> 123 — !\n>\n> English after neutral"
            }
          </AgentMarkdown>
        </div>,
      );
      const quote = container.querySelector("blockquote")!;
      expect(quote.querySelector("h1")).not.toHaveAttribute("dir");
      expect(quote.querySelector("p")).toHaveAttribute("dir", "auto");
      expect(quote.querySelector("h2")).toHaveAttribute("dir", "auto");
      expect(container.querySelector("li h2")).not.toHaveAttribute("dir");
      expect(container.querySelector("li p")).toHaveAttribute("dir", "auto");
      const neutral = container.querySelectorAll("blockquote")[1];
      expect(neutral.querySelectorAll("p")[0]).not.toHaveAttribute("dir");
      expect(neutral.querySelectorAll("p")[1]).toHaveAttribute("dir", "auto");
    },
  );

  // @lat: [[rtl-chat#Bidirectional message rendering#Footnotes retain link targets]]
  it("preserves GFM footnote definition IDs and return-link attributes", () => {
    const { container } = render(
      <AgentMarkdown>
        {"سلام، یادداشت[^1]\n\n[^1]: English footnote"}
      </AgentMarkdown>,
    );
    const reference = container.querySelector("[data-footnote-ref]");
    const definition = container.querySelector('li[id="user-content-fn-1"]');
    const backlink = container.querySelector("[data-footnote-backref]");
    expect(reference).toHaveAttribute("href", "#user-content-fn-1");
    expect(definition).toHaveAttribute("dir", "auto");
    expect(backlink).toHaveAttribute("href", "#user-content-fnref-1");
    expect(container.querySelector("section[data-footnotes]")).not.toBeNull();
  });

  // @lat: [[rtl-chat#Bidirectional message rendering#Code and toolbar isolation]]
  it("keeps highlighted code and its copy controls LTR after RTL prose and preserves copied source", async () => {
    const code = '# تعليق عربي\nconst message = "سلام";';
    const copyToClipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: { copyToClipboard },
    });
    const { container } = await renderHighlighted(
      `سلام دنیا\n\n\`\`\`js\n${code}\n\`\`\``,
    );
    const block = container.querySelector(".chat-code-block");
    expect(block).toHaveAttribute("dir", "ltr");
    expect(block?.closest("pre")).toHaveAttribute("dir", "ltr");
    expect(block?.querySelector(".chat-code-lang")?.textContent).toBe("js");
    fireEvent.click(block!.querySelector("button")!);
    expect(copyToClipboard).toHaveBeenCalledWith(code);
  });

  // @lat: [[rtl-chat#Bidirectional message rendering#Plain diagrams and diffs]]
  it("pins plain diagrams and colored diffs to LTR in an RTL message", () => {
    const { container } = render(
      <AgentMarkdown>
        {[
          "سلام",
          "",
          "```text",
          "├── src",
          "└── שלום",
          "```",
          "",
          "```diff",
          "+سلام",
          "-hello",
          "```",
        ].join("\n")}
      </AgentMarkdown>,
    );
    expect(container.querySelector(".chat-code-plain")).not.toBeNull();
    expect(container.querySelector(".chat-diff-add")).not.toBeNull();
    for (const block of container.querySelectorAll(".chat-code-block")) {
      expect(block).toHaveAttribute("dir", "ltr");
    }
  });

  it("renders box-drawing tree diagrams as plain text, even with the highlighter loaded", async () => {
    // Control first: prove highlighting works in this environment, and leave
    // the highlighter module loaded so the tree block below would use Prism
    // synchronously if it were ever routed there.
    await renderHighlighted(
      ["```ts", "const answer: number = 42;", "```"].join("\n"),
    );

    const markdown = [
      "```text",
      "project",
      "├── src",
      "│   └── main.ts",
      "└── README.md",
      "```",
    ].join("\n");

    const { container } = render(<AgentMarkdown>{markdown}</AgentMarkdown>);
    const plain = container.querySelector(".chat-code-plain");

    expect(plain).not.toBeNull();
    expect(plain?.textContent).toContain("├── src");
    expect(plain?.textContent).toContain("│   └── main.ts");
    expect(plain?.textContent).toContain("└── README.md");
    expect(container.querySelector(".token")).toBeNull();
  });

  it("keeps syntax highlighting for code with an incidental box-drawing character", async () => {
    // One │ in a string literal must not demote the whole file to plain text.
    const markdown = [
      "```python",
      'SEPARATOR = "│"',
      "def greet(name):",
      '    return f"hello {name}"',
      "",
      "def main():",
      "    print(greet('world'))",
      "```",
    ].join("\n");

    const { container } = await renderHighlighted(markdown);
    expect(container.querySelector(".chat-code-plain")).toBeNull();
    expect(container.textContent).toContain("│");
  });

  it("keeps the colored diff view for diffs that touch box-drawing content", () => {
    // DiffView never uses Prism, so a patch on a tree diagram must not lose
    // its +/- coloring to the box-diagram plain path.
    const markdown = [
      "```diff",
      "+├── src",
      "-└── lib",
      "+│   └── main.ts",
      "```",
    ].join("\n");

    const { container } = render(<AgentMarkdown>{markdown}</AgentMarkdown>);
    expect(container.querySelector(".chat-diff-content")).not.toBeNull();
    expect(container.querySelector(".chat-diff-add")).not.toBeNull();
    expect(container.querySelector(".chat-diff-remove")).not.toBeNull();
    expect(container.querySelector(".chat-code-plain")).toBeNull();
  });

  it("labels an unlabeled box diagram as text but keeps a declared language", () => {
    const bare = render(
      <AgentMarkdown>
        {["```", "├── src", "└── README.md", "```"].join("\n")}
      </AgentMarkdown>,
    );
    expect(bare.container.querySelector(".chat-code-lang")?.textContent).toBe(
      "text",
    );

    const declared = render(
      <AgentMarkdown>
        {["```bash", "├── src", "└── README.md", "```"].join("\n")}
      </AgentMarkdown>,
    );
    expect(
      declared.container.querySelector(".chat-code-lang")?.textContent,
    ).toBe("bash");
    // Box-dominant content still renders plain regardless of the label.
    expect(declared.container.querySelector(".chat-code-plain")).not.toBeNull();
  });
});
