import { aiSkillError } from './errors.js';

function citations(content) {
  return [...String(content || '').matchAll(/\[(\d{1,3})\]/gu)].map((match) => Number(match[1]));
}

export function validateGroundedMarkdownOutput({ content, sources = [], coverage = {}, minimumChars = 0 }) {
  const normalized = String(content || '').trim();
  if (!normalized) throw aiSkillError('AI_SKILL_OUTPUT_EMPTY', 'AI 没有返回可用内容', 502);
  if (normalized.length > 60_000) throw aiSkillError('AI_SKILL_OUTPUT_TOO_LONG', 'AI 返回内容过长', 502);
  const requiredChars = Math.max(0, Number(minimumChars) || 0);
  if (requiredChars && normalized.length < requiredChars) {
    throw aiSkillError(
      'AI_SKILL_OUTPUT_TOO_SHORT',
      `AI 返回内容未达到要求（${normalized.length}/${requiredChars} 字）`,
      502,
    );
  }
  const refs = citations(normalized);
  if (sources.length && !refs.length) {
    throw aiSkillError('AI_SKILL_OUTPUT_SOURCE_REQUIRED', 'AI 回答缺少来源引用', 502);
  }
  if (sources.length && refs.some((index) => index < 1 || index > sources.length)) {
    throw aiSkillError('AI_SKILL_OUTPUT_SOURCE_INVALID', 'AI 回答引用了不存在的来源', 502);
  }
  return Object.freeze({ kind: 'grounded_markdown', content: normalized });
}

export const aiSkillOutputInternals = { citations };
