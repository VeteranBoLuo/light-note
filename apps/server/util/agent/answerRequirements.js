const MAX_REQUIREMENTS = 16;
const MAX_MATCHERS = 8;
const MAX_MATCHER_CHARS = 160;
const MAX_APPEND_CHARS = 500;

function compact(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .trim();
}

function normalizeRequirement(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = String(value.id || `requirement_${index + 1}`)
    .trim()
    .replace(/[^a-z0-9_.-]+/giu, '_')
    .slice(0, 64);
  const anyOf = [
    ...new Set(
      (Array.isArray(value.anyOf) ? value.anyOf : [])
        .map((item) => compact(item).slice(0, MAX_MATCHER_CHARS))
        .filter(Boolean),
    ),
  ].slice(0, MAX_MATCHERS);
  const appendText = String(value.appendText || '')
    .trim()
    .slice(0, MAX_APPEND_CHARS);
  const onMissing = value.onMissing === 'replace' ? 'replace' : 'append';
  if (!id || !anyOf.length || !appendText) return null;
  return Object.freeze({ id, anyOf: Object.freeze(anyOf), appendText, onMissing });
}

/**
 * 工具可声明少量“最终回答必须保留”的结构化事实。这里只接受有界匹配串与安全回退
 * 文本，不接收函数、正则或原始业务对象，避免把工具私有结果泄漏到日志或客户端协议。
 */
export function normalizeAgentAnswerRequirements(values) {
  const seen = new Set();
  const result = [];
  for (const [index, value] of (Array.isArray(values) ? values : []).entries()) {
    const requirement = normalizeRequirement(value, index);
    if (!requirement || seen.has(requirement.id)) continue;
    seen.add(requirement.id);
    result.push(requirement);
    if (result.length >= MAX_REQUIREMENTS) break;
  }
  return Object.freeze(result);
}

/**
 * 最终模型遗漏工具声明的关键事实时，服务端只补回该工具已经生成的安全事实句；不让
 * 模型重试、不猜测新事实。仅当一次请求只有一个成功工具、调用方显式允许，工具才能把
 * 纯事实回答声明为 replace，避免错误模型文案与权威统计并存；复合任务一律追加，不能吞掉
 * 其他工具的回答。调用方只记录 addedCount，禁止记录正文。
 */
export function applyAgentAnswerRequirements(answer, values, { allowAuthoritativeReplacement = false } = {}) {
  const requirements = normalizeAgentAnswerRequirements(values);
  const normalizedAnswer = compact(answer);
  const missing = requirements.filter(
    (requirement) => !requirement.anyOf.some((matcher) => normalizedAnswer.includes(matcher)),
  );
  const replacement = allowAuthoritativeReplacement
    ? requirements.filter((requirement) => requirement.onMissing === 'replace')
    : [];
  const supplements = missing
    .filter((requirement) => !replacement.includes(requirement))
    .map((requirement) => requirement.appendText)
    .join('\n');
  // replace 表示该单工具结果本身就是完整的权威回答。即使模型碰巧包含了正确片段，
  // 仍统一使用工具生成的句子，避免它在别处同时保留矛盾数字或无依据扩写。
  if (replacement.length) {
    const authoritative = replacement.map((requirement) => requirement.appendText).join('\n');
    return {
      answer: [authoritative, supplements].filter(Boolean).join('\n\n'),
      addedCount: missing.length,
    };
  }
  if (!missing.length) return { answer: String(answer || '').trim(), addedCount: 0 };
  const base = String(answer || '').trim();
  return {
    answer: [base, supplements].filter(Boolean).join('\n\n'),
    addedCount: missing.length,
  };
}
