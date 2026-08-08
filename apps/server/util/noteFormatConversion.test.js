import { describe, expect, it } from 'vitest';
import {
  buildNoteFormatConversionAnalysisHash,
  isValidNoteFormatConversionAnalysisHash,
  serializeNoteFormatConversionHashInput,
  verifyNoteFormatConversionAnalysisHash,
} from './noteFormatConversion.js';

describe('noteFormatConversion', () => {
  const input = { targetType: 'markdown', convertedContent: '# 标题\n', baseRevision: 7 };

  it('序列化口径与前端一致', () => {
    expect(serializeNoteFormatConversionHashInput(input)).toBe(
      '{"version":1,"targetType":"markdown","baseRevision":7,"convertedContent":"# 标题\\n"}',
    );
  });

  it.each(['sha256', 'fnv1a32'])('%s 指纹可验证且任一字段变化都会失效', (algorithm) => {
    const hash = buildNoteFormatConversionAnalysisHash(input, algorithm);
    expect(isValidNoteFormatConversionAnalysisHash(hash)).toBe(true);
    expect(verifyNoteFormatConversionAnalysisHash(hash, input)).toBe(true);
    expect(verifyNoteFormatConversionAnalysisHash(hash, { ...input, convertedContent: '# 另一版\n' })).toBe(false);
    expect(verifyNoteFormatConversionAnalysisHash(hash, { ...input, baseRevision: 8 })).toBe(false);
  });

  it('拒绝未知算法和畸形摘要', () => {
    expect(isValidNoteFormatConversionAnalysisHash('md5:abc')).toBe(false);
    expect(verifyNoteFormatConversionAnalysisHash('sha256:1234', input)).toBe(false);
  });
});
