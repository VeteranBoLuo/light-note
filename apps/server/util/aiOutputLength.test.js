import { describe, expect, it } from 'vitest';
import { extractMinimumOutputCharacters } from './aiOutputLength.js';

describe('AI 输出长度约束', () => {
  it('供所有 Skill 确定性识别中英文最低字数要求', () => {
    expect(extractMinimumOutputCharacters('至少 2000 字')).toBe(2000);
    expect(extractMinimumOutputCharacters('不得少于 2 千字符')).toBe(2000);
    expect(extractMinimumOutputCharacters('at least 1.5k characters')).toBe(1500);
    expect(extractMinimumOutputCharacters('至少 800 字，最终不得少于 2 千字')).toBe(2000);
  });

  it('没有明确下限时不臆测', () => {
    expect(extractMinimumOutputCharacters('写得详细一些')).toBeNull();
  });
});
