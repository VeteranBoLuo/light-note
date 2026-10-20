import { describe, it, expect } from "vitest";
import {
  validateDefinition,
  validateAnswers,
  csvCell,
  OTHER_OPTION_ID,
  choiceAnswerParts,
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
  it("新提交提醒默认关闭，只接受布尔配置", () => {
    expect(validateDefinition(definition).notifyOnSubmission).toBe(false);
    expect(
      validateDefinition({ ...definition, notifyOnSubmission: true })
        .notifyOnSubmission,
    ).toBe(true);
    expect(
      validateDefinition({ ...definition, notifyOnSubmission: false })
        .notifyOnSubmission,
    ).toBe(false);
    for (const notifyOnSubmission of [null, 0, 1, "true", "false", {}, []])
      expect(() =>
        validateDefinition({ ...definition, notifyOnSubmission }),
      ).toThrow("新提交提醒设置无效");
  });
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

describe("其他填写选项", () => {
  const choice = definition.questions[0];
  const form = (type = "multiple", allowOther = true) =>
    validateDefinition({
      ...definition,
      questions: [{ ...choice, type, allowOther }],
    });
  it("默认关闭且保持旧题目快照不变，普通选项答案保持原格式", () => {
    expect(validateDefinition(definition).questions[0]).toEqual(choice);
    expect(form("single", false).questions[0]).not.toHaveProperty("allowOther");
    expect(validateAnswers(form("single"), { q1: "a" })).toEqual({ q1: "a" });
    expect(validateAnswers(form(), { q1: ["b", "a"] })).toEqual({
      q1: ["a", "b"],
    });
  });
  it("单选其他互斥，多选支持同时选择普通选项；文本去空白、选项去重排序", () => {
    expect(
      validateAnswers(form("single"), {
        q1: { optionIds: [], otherText: "  朋友介绍  " },
      }),
    ).toEqual({ q1: { optionIds: [], otherText: "朋友介绍" } });
    expect(
      validateAnswers(form(), {
        q1: { optionIds: ["b", "a", "b"], otherText: "社群分享" },
      }),
    ).toEqual({ q1: { optionIds: ["a", "b"], otherText: "社群分享" } });
    expect(() =>
      validateAnswers(form("single"), {
        q1: { optionIds: ["a"], otherText: "朋友介绍" },
      }),
    ).toThrow("有效选项");
  });
  it("拒绝空白、超长、伪造字段和选项；只选其他也能完成必填题", () => {
    for (const otherText of ["", "  \n "]) {
      try {
        validateAnswers(form(), { q1: { optionIds: [], otherText } });
      } catch (e) {
        expect(e).toMatchObject({ field: "q1", code: "otherRequired" });
      }
      expect(() =>
        validateAnswers(form(), { q1: { optionIds: [], otherText } }),
      ).toThrow("请填写其他");
    }
    expect(
      validateAnswers(form(), {
        q1: { optionIds: [], otherText: "字".repeat(500) },
      }).q1.otherText,
    ).toHaveLength(500);
    expect(() =>
      validateAnswers(form(), {
        q1: { optionIds: [], otherText: "字".repeat(501) },
      }),
    ).toThrow("500");
    for (const value of [
      { optionIds: [], otherText: 12 },
      { optionIds: "a", otherText: "说明" },
      { optionIds: ["forged"], otherText: "说明" },
      { optionIds: [OTHER_OPTION_ID], otherText: "说明" },
      { optionIds: [], otherText: "说明", userId: "forged" },
      {},
    ])
      expect(() => validateAnswers(form(), { q1: value })).toThrow("有效选项");
    expect(() =>
      validateAnswers(form("multiple", false), {
        q1: { optionIds: [], otherText: "说明" },
      }),
    ).toThrow("有效选项");
  });
  it("可选题未选择时无需文字，不接受非选择题开关或与其他保留 ID 冲突", () => {
    const optional = form();
    optional.questions[0].required = false;
    expect(validateAnswers(optional, {})).toEqual({});
    expect(validateAnswers(optional, { q1: [] })).toEqual({});
    expect(() =>
      validateDefinition({
        ...definition,
        questions: [{ ...choice, type: "short", allowOther: true }],
      }),
    ).toThrow("单选、多选");
    expect(() =>
      validateDefinition({
        ...definition,
        questions: [{ ...choice, allowOther: "yes" }],
      }),
    ).toThrow("设置无效");
    expect(() =>
      validateDefinition({
        ...definition,
        questions: [
          {
            ...choice,
            allowOther: true,
            options: [
              { id: OTHER_OPTION_ID, label: "其他" },
              choice.options[0],
            ],
          },
        ],
      }),
    ).toThrow("标识");
    const legacyReserved = validateDefinition({
      ...definition,
      questions: [
        {
          ...choice,
          options: [
            { id: OTHER_OPTION_ID, label: "旧固定选项" },
            choice.options[0],
          ],
        },
      ],
    });
    expect(validateAnswers(legacyReserved, { q1: [OTHER_OPTION_ID] })).toEqual({
      q1: [OTHER_OPTION_ID],
    });
    expect(choiceAnswerParts({ optionIds: ["a"], otherText: "来源" })).toEqual({
      optionIds: ["a"],
      otherText: "来源",
    });
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
