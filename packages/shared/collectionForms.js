/** Shared, bounded public collection contract. No account or browser dependencies. */
export const QUESTION_TYPES = [
  "short",
  "long",
  "single",
  "multiple",
  "rating",
  "number",
  "date",
];
export const FORM_LIMITS = Object.freeze({
  questions: 50,
  options: 30,
  short: 500,
  long: 5000,
});
export class FormError extends Error {
  constructor(message, status = 400, field = "") {
    super(message);
    this.status = status;
    this.field = field;
  }
}
const fail = (message, field = "") => {
  throw new FormError(message, 400, field);
};
function text(value, max, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail("文字为空或超出长度限制");
  return value.trim();
}
export function validateDefinition(input) {
  if (!input || !Array.isArray(input.questions) || input.questions.length > 50)
    fail("最多添加 50 道题");
  if (
    input.submissionPolicy !== undefined &&
    !["multiple", "replace"].includes(input.submissionPolicy)
  )
    fail("重复提交规则无效");
  const ids = new Set();
  const questions = input.questions.map((q) => {
    if (
      !q ||
      typeof q.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(q.id) ||
      ids.has(q.id) ||
      ["__proto__", "constructor", "prototype"].includes(q.id)
    )
      fail("题目标识无效");
    ids.add(q.id);
    if (!QUESTION_TYPES.includes(q.type)) fail("不支持的题型", q.id);
    const result = {
      id: q.id,
      type: q.type,
      title: text(q.title, 500, true),
      required: q.required === true,
      options: [],
    };
    if (["single", "multiple"].includes(q.type)) {
      if (
        !Array.isArray(q.options) ||
        q.options.length < 2 ||
        q.options.length > 30
      )
        fail("选项数量应为 2–30 个", q.id);
      const optionIds = new Set();
      result.options = q.options.map((o) => {
        if (
          !o ||
          typeof o.id !== "string" ||
          !/^[a-zA-Z0-9_-]{1,64}$/.test(o.id) ||
          optionIds.has(o.id) ||
          ["__proto__", "constructor", "prototype"].includes(o.id)
        )
          fail("选项标识无效", q.id);
        optionIds.add(o.id);
        return { id: o.id, label: text(o.label, 300, true) };
      });
    }
    return result;
  });
  return {
    title: text(input.title, 200, true),
    description: text(input.description ?? "", 5000),
    submissionPolicy: input.submissionPolicy ?? "multiple",
    successMessage: text(input.successMessage ?? "感谢你的填写！", 1000),
    questions,
  };
}
export function validateAnswers(definition, input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("填写内容无效");
  const answers = {};
  const known = new Set(definition.questions.map((q) => q.id));
  if (Object.keys(input).some((key) => !known.has(key))) fail("包含未知题目");
  for (const q of definition.questions) {
    const v = input[q.id];
    const missing =
      v == null ||
      v === "" ||
      (Array.isArray(v) && !v.length) ||
      (typeof v === "string" && !v.trim());
    if (missing) {
      if (q.required) fail("请填写此题", q.id);
      continue;
    }
    if (q.type === "short" || q.type === "long") {
      if (typeof v !== "string" || v.length > FORM_LIMITS[q.type])
        fail("文字超出长度限制", q.id);
      answers[q.id] = v.trim();
    } else if (q.type === "single" || q.type === "multiple") {
      const values = q.type === "single" ? [v] : v;
      if (
        !Array.isArray(values) ||
        values.length > 30 ||
        values.some((x) => !q.options.some((o) => o.id === x))
      )
        fail("请选择有效选项", q.id);
      answers[q.id] = q.type === "single" ? v : [...new Set(values)].sort();
    } else if (q.type === "number" || q.type === "rating") {
      if (
        !["number", "string"].includes(typeof v) ||
        !Number.isFinite(Number(v)) ||
        Math.abs(Number(v)) > 1e12
      )
        fail("请输入有效数字", q.id);
      if (
        q.type === "rating" &&
        (!Number.isInteger(Number(v)) || Number(v) < 1 || Number(v) > 5)
      )
        fail("请选择 1–5 分", q.id);
      answers[q.id] = Number(v);
    } else {
      if (
        typeof v !== "string" ||
        !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(v) ||
        !Number.isFinite(Date.parse(v.slice(0, 10))) ||
        new Date(v.slice(0, 10)).toISOString().slice(0, 10) !== v.slice(0, 10)
      )
        fail("请选择有效日期时间", q.id);
      answers[q.id] = v;
    }
  }
  return answers;
}
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f\u007f\uFEFF]*[=+@\-]/.test(s) || /^[\t\r\n]/.test(s))
    s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
