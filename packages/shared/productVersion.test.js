import { describe, expect, it } from "vitest";
import { normalizeProductVersion } from "./index.js";

describe("product versions", () => {
  it.each([undefined, null, "", "  "])(
    "空版本保留为未编号历史记录：%j",
    (value) => {
      expect(normalizeProductVersion(value)).toBe("");
    },
  );
  it.each([
    "0.0.0",
    "1.0.0",
    "1.1.0",
    "12.30.405",
    " 1.1.0 ",
    `${"1".repeat(28)}.1.0`,
  ])("只接收可保存的正式三段式版本：%s", (value) =>
    expect(normalizeProductVersion(value)).toBe(value.trim()),
  );
  it.each([
    "1.0",
    "v1.0.0",
    "01.0.0",
    "1.01.0",
    "1.0.00",
    "1.0.0-rc.1",
    "1.0.0+build",
    "1.0.0.1",
    "-1.0.0",
    1,
    {},
    `${"1".repeat(29)}.1.0`,
  ])("拒绝格式无效或越界的版本：%j", (value) =>
    expect(normalizeProductVersion(value)).toBeNull(),
  );
});
