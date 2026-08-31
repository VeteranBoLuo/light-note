import { describe, expect, it } from "vitest";
import { stripAiAnalysisCitations } from "./aiCitationPresentation.js";

describe("stripAiAnalysisCitations", () => {
  it("removes standalone numeric source markers and cleans punctuation spacing", () => {
    expect(stripAiAnalysisCitations("第一点 [1]\n\n[2]\n\n第二点。[1]")).toBe(
      "第一点\n\n第二点。",
    );
    expect(stripAiAnalysisCitations("结论 [1]，下一步 [2]。")).toBe(
      "结论，下一步。",
    );
  });

  it("keeps code indexes, fenced code, numeric links, and footnote definitions", () => {
    const markdown = [
      "数组 arr[1] 与 `value[2]` 不应变化。",
      "",
      "[1](https://example.com)",
      "[2]: https://example.com/source",
      "",
      "```js",
      "const item = rows[1];",
      "```",
    ].join("\n");
    expect(stripAiAnalysisCitations(markdown)).toBe(markdown);
  });
});
