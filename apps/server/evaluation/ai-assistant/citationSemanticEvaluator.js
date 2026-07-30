const NEGATION_PATTERN = /(?:不|未|无|没有|并非|不能|禁止|never|not|no|without|cannot|can't|won't)/i;
const LATIN_WORD_PATTERN = /[a-z][a-z0-9_-]{1,}/gi;
const NUMBER_PATTERN = /(?:\d+(?:\.\d+)?%?)/g;
const CJK_PATTERN = /[\u3400-\u9fff]+/g;
const STOP_TERMS = new Set([
  '这个',
  '那个',
  '以及',
  '可以',
  '进行',
  '相关',
  '内容',
  'the',
  'and',
  'that',
  'with',
  'from',
  'this',
]);

function semanticTerms(text) {
  const normalized = String(text || '').toLowerCase();
  const terms = new Set(normalized.match(LATIN_WORD_PATTERN) || []);
  for (const block of normalized.match(CJK_PATTERN) || []) {
    if (block.length === 1) terms.add(block);
    for (let index = 0; index < block.length - 1; index += 1) terms.add(block.slice(index, index + 2));
  }
  for (const term of normalized.match(NUMBER_PATTERN) || []) terms.add(term);
  for (const stop of STOP_TERMS) terms.delete(stop);
  return terms;
}

/**
 * 离线、可重复的语义支持度代理指标。它不把词面相似度冒充通用 NLI：
 * 数字不一致和明显否定冲突会直接失败，其余使用主张关键项覆盖率作为可量化回归信号。
 */
export function evaluateCitationSemanticSupport(claimText, evidenceText, { threshold = 0.58 } = {}) {
  const claim = String(claimText || '').trim();
  const evidence = String(evidenceText || '').trim();
  if (!claim || !evidence) return { supported: false, score: 0, reason: 'missing_text', overlap: 0 };

  const claimNumbers = [...new Set(claim.match(NUMBER_PATTERN) || [])];
  const evidenceNumbers = new Set(evidence.match(NUMBER_PATTERN) || []);
  const missingNumbers = claimNumbers.filter((number) => !evidenceNumbers.has(number));
  if (missingNumbers.length) {
    return { supported: false, score: 0, reason: 'number_mismatch', overlap: 0, missingNumbers };
  }

  const claimTerms = semanticTerms(claim);
  const evidenceTerms = semanticTerms(evidence);
  const matched = [...claimTerms].filter((term) => evidenceTerms.has(term));
  const overlap = claimTerms.size ? matched.length / claimTerms.size : 0;
  const negationConflict =
    overlap >= 0.35 && NEGATION_PATTERN.test(claim) !== NEGATION_PATTERN.test(evidence);
  if (negationConflict) {
    return { supported: false, score: 0, reason: 'negation_conflict', overlap };
  }

  const score = Math.max(0, Math.min(1, overlap));
  return {
    supported: score >= threshold,
    score,
    reason: score >= threshold ? 'supported' : 'insufficient_overlap',
    overlap,
  };
}
