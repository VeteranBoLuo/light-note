export function normalizeLengthText(value) {
  return String(value || '')
    .replace(/[０-９]/g, (character) => String(character.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, '')
    .trim();
}

export function scaledLengthValue(rawValue, rawScale = '') {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const scale = String(rawScale || '').toLowerCase();
  const multiplier = scale === '万' ? 10_000 : scale === '千' || scale === 'k' ? 1_000 : 1;
  return Math.ceil(numeric * multiplier);
}

/**
 * 从自然语言要求中确定性提取“最低输出字符数”。
 * 这是所有 AI 功能共用的输出约束编译器，不依赖模型，也不针对某个页面或某句示例写分支。
 */
export function extractMinimumOutputCharacters(instruction) {
  const text = normalizeLengthText(instruction);
  if (!text) return null;
  const candidates = [];
  const patterns = [
    /(?:至少|最少|不少于|不低于|不得少于|不能少于|起码)\s*(?:写(?:到)?|达到|有|为)?\s*(\d+(?:\.\d+)?)\s*(万|千|k)?\s*(?:个\s*)?(?:字|字符)/giu,
    /(\d+(?:\.\d+)?)\s*(万|千|k)?\s*(?:个\s*)?(?:字|字符)\s*(?:以上|起步|起|打底)/giu,
    /\bat\s+least\s+(\d+(?:\.\d+)?)\s*(k)?\s*(?:characters?|chars?)\b/giu,
    /\bminimum(?:\s+of)?\s+(\d+(?:\.\d+)?)\s*(k)?\s*(?:characters?|chars?)\b/giu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = scaledLengthValue(match[1], match[2]);
      if (value > 0) candidates.push(value);
    }
  }
  return candidates.length ? Math.max(...candidates) : null;
}

export const aiOutputLengthInternals = Object.freeze({ normalizeLengthText, scaledLengthValue });
