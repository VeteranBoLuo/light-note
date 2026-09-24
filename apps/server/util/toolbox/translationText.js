import { createHash } from 'node:crypto';
import { TOOLBOX_TRANSLATION_MAX_CHARS } from '@lightnote/shared/toolbox-protocol';
import { toolboxError } from './errors.js';

/** Protect syntax and immutable data before translation, retaining original whitespace. */
export function splitTranslationText(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > TOOLBOX_TRANSLATION_MAX_CHARS)
    throw toolboxError('TOOLBOX_TRANSLATION_INPUT_INVALID', '请输入不超过 30000 字符的文字');
  const prefix = `LN${createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
  const protectedValues = [];
  const protect = value => { const token = `⟦${prefix}_${protectedValues.length}⟧`; protectedValues.push({ token, value }); return token; };
  let masked = text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*(?:\n|$)/gm, protect);
  masked = masked.replace(/`+[^`\n]+`+|!?\[[^\]\n]*\]\((?:[^()\n]|\([^()\n]*\))*\)|https?:\/\/[^\s<>]+|<[^>\n]+>/g, match => {
    // Keep link labels translatable but protect destination and delimiters.
    const link = match.match(/^(!?\[)([^\]]*)(\]\([\s\S]*\))$/);
    return link ? protect(link[1]) + link[2] + protect(link[3]) : protect(match);
  }).replace(/^(\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+))/gm, protect)
    .replace(/^\s*\|?[ :|-]+\|[ :|-]*$/gm, protect);
  masked = masked.replace(/⟦LN[a-f0-9]+_\d+⟧|\*+|_+|~~/g, value => value.startsWith('⟦') ? value : protect(value));
  const segments = [];
  const pieces = masked.split(/(\n\s*\n)/);
  let buffer = '';
  const flush = () => { if (buffer) { segments.push(buffer); buffer = ''; } };
  for (let piece of pieces) {
    while (piece.length > 2200) {
      flush();
      let end = piece.lastIndexOf('\n', 2200);
      if (end < 500) end = piece.lastIndexOf(' ', 2200);
      if (end < 500) end = 2200;
      // Do not split placeholders or UTF-16 surrogate pairs.
      const tokenStart = piece.lastIndexOf('⟦', end);
      if (tokenStart >= 0 && piece.indexOf('⟧', tokenStart) >= end) end = tokenStart || piece.indexOf('⟧', tokenStart) + 1;
      if (/[\uD800-\uDBFF]/u.test(piece[end - 1])) end--;
      segments.push(piece.slice(0, end)); piece = piece.slice(end);
    }
    if (buffer.length + piece.length > 2200) flush();
    buffer += piece;
  }
  flush();
  return segments.map((source, index) => {
    const tokens = protectedValues.filter(item => source.includes(item.token));
    const original = tokens.reduce((value, item) => value.replaceAll(item.token, item.value), source);
    return { id: String(index + 1), source, original, tokens };
  });
}
export function validateTranslationSegment(segment, translated) {
  if (typeof translated !== 'string' || !translated.trim() || translated.length > 12000)
    throw toolboxError('AI_TRANSLATION_OUTPUT_INVALID', '译文为空或超出段落限制', 502);
  const expected = segment.source.match(/⟦LN[a-f0-9]+_\d+⟧/g) || [];
  const actual = translated.match(/⟦LN[a-f0-9]+_\d+⟧/g) || [];
  if (JSON.stringify(expected) !== JSON.stringify(actual) || (segment.source.match(/\|/g) || []).length !== (translated.match(/\|/g) || []).length)
    throw toolboxError('AI_TRANSLATION_OUTPUT_INVALID', '译文未完整保留结构', 502);
  const leading = segment.source.match(/^\s*/)[0], trailing = segment.source.match(/\s*$/)[0];
  const normalized = leading + translated.trim() + trailing;
  if ((normalized.match(/\n/g) || []).length !== (segment.source.match(/\n/g) || []).length)
    throw toolboxError('AI_TRANSLATION_OUTPUT_INVALID', '译文未完整保留段落和换行', 502);
  return segment.tokens.reduce((value, item) => value.replaceAll(item.token, item.value), normalized);
}
export function translationNoteContent(artifact, format = 'translationOnly') {
  if (!['translationOnly', 'bilingual'].includes(format)) throw toolboxError('TOOLBOX_TRANSLATION_FORMAT_INVALID', '保存形式无效');
  if (format === 'translationOnly') return artifact.content;
  const pairs = artifact.meta?.translation?.segments;
  if (!Array.isArray(pairs) || !pairs.length) throw toolboxError('TOOLBOX_TRANSLATION_RESULT_INVALID', '译文结构不可用', 409);
  return pairs.map(pair => `### 原文 / Original\n\n${pair.original}\n\n### 译文 / Translation\n\n${pair.translated}`).join('\n\n---\n\n');
}
