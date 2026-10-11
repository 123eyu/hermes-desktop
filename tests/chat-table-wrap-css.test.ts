import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  join(import.meta.dirname, "../src/renderer/src/assets/main.css"),
  "utf-8",
);

describe("Agent markdown table cell wrapping", () => {
  // @lat: [[code-blocks#Table cells wrap long unbreakable text]]
  it("lets long unbreakable text wrap inside table cells", () => {
    const cellRule = CSS.match(
      /\.chat-bubble-agent th,\s*\.chat-bubble-agent td\s*\{(?<body>[\s\S]*?)\n\}/,
    )?.groups?.body;

    expect(cellRule).toBeDefined();
    expect(cellRule).toContain("overflow-wrap: anywhere");
    expect(CSS).not.toMatch(
      /\.chat-bubble-agent table\s*\{[^}]*table-layout:\s*fixed/,
    );
  });
});

describe("Mixed-direction Markdown list markers", () => {
  // @lat: [[rtl-chat#Bidirectional message rendering#Opposite-direction list marker spacing]]
  it("reserves logical marker space only when an item differs from its list", () => {
    expect(CSS).toMatch(
      /\.chat-markdown :is\(ul, ol\):dir\(ltr\) > li:dir\(rtl\),\s*\.chat-markdown :is\(ul, ol\):dir\(rtl\) > li:dir\(ltr\)\s*\{\s*margin-inline-start: 1\.5em !important;/,
    );
    expect(CSS).toContain("margin-inline-start: 16px !important");
  });
});
