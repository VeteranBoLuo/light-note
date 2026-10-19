import { describe, it, expect } from "vitest";
import {
  validateDefinition,
  validateAnswers,
  csvCell,
} from "./collectionForms.js";
const definition = {
  title: "反馈",
  questions: [
    {
      id: "q1",
      type: "multiple",
      title: "选择",
      required: true,
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
  ],
};
describe("公开收集共享验证", () => {
  it("奖励自动要求账号，拒绝非整数、越界及伪造的配置", () => {
    expect(
      validateDefinition({
        ...definition,
        reward: { points: 20, maxRecipients: 100 },
      }),
    ).toMatchObject({
      membersOnly: true,
      reward: { points: 20, maxRecipients: 100 },
    });
    for (const reward of [
      true,
      [],
      { points: 0, maxRecipients: 1 },
      { points: 1.5, maxRecipients: 1 },
      { points: 10001, maxRecipients: 1 },
      { points: 1, maxRecipients: 5001 },
      { points: 1, maxRecipients: 0 },
      { points: 1, maxRecipients: 1, userId: "forged" },
    ])
      expect(() => validateDefinition({ ...definition, reward })).toThrow(
        "奖励",
      );
    expect(() =>
      validateDefinition({ ...definition, membersOnly: "true" }),
    ).toThrow("填写范围");
    expect(validateDefinition(definition)).toMatchObject({
      membersOnly: false,
      reward: null,
    });
  });
  it("限制结构、必填、未知选项并去重多选", () => {
    const d = validateDefinition(definition);
    expect(validateAnswers(d, { q1: ["b", "a", "b"] })).toEqual({
      q1: ["a", "b"],
    });
    expect(() => validateAnswers(d, {})).toThrow("请填写此题");
    expect(() => validateAnswers(d, { q1: ["bad"] })).toThrow("有效选项");
    expect(() =>
      validateDefinition({
        ...definition,
        questions: [...definition.questions, ...definition.questions],
      }),
    ).toThrow("标识");
  });
  it("拒绝越界评分、非有限数字与无效日期", () => {
    for (const [type, value] of [
      ["rating", 0],
      ["rating", 1.5],
      ["number", Infinity],
      ["date", "2026-02-30"],
    ]) {
      const d = validateDefinition({
        title: "t",
        questions: [{ id: "q", title: "q", type }],
      });
      expect(() => validateAnswers(d, { q: value })).toThrow();
    }
  });
  it("保留零和可选空答案", () => {
    const d = validateDefinition({
      title: "t",
      questions: [{ id: "q", title: "q", type: "number", required: true }],
    });
    expect(validateAnswers(d, { q: 0 })).toEqual({ q: 0 });
  });
  it("CSV 转义公式、换行与引号", () => {
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell(" \t@x")).toContain("'");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
});

it("日期题接受日期时间并兼容旧日期，拒绝无效日期与时分", () => {
  const form = {
    title: "时间",
    questions: [
      { id: "when", type: "date", title: "时间", required: true, options: [] },
    ],
  };
  for (const value of ["2026-09-24", "2026-09-24T00:00", "2026-09-24T23:59"]) {
    expect(validateAnswers(form, { when: value }).when).toBe(value);
  }
  for (const value of [
    "2026-02-30T12:00",
    "2026-09-24T24:00",
    "2026-09-24T12:60",
    "2026-09-24T1:00",
    "2026-09-24T12:00Z",
  ]) {
    expect(() => validateAnswers(form, { when: value })).toThrow();
  }
});

it("重复提交规则默认兼容旧表单且拒绝未知规则", () => {
  const base = {
    title: "测试",
    description: "",
    successMessage: "谢谢",
    questions: [],
  };
  expect(validateDefinition(base).submissionPolicy).toBe("multiple");
  expect(
    validateDefinition({ ...base, submissionPolicy: "replace" })
      .submissionPolicy,
  ).toBe("replace");
  expect(() =>
    validateDefinition({ ...base, submissionPolicy: "anything" }),
  ).toThrow("重复提交规则无效");
});
