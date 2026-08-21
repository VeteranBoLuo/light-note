import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '../sqlPatterns.js';

describe('Agent SQL LIKE pattern', () => {
  it('统一把反斜杠、百分号和下划线按字面量转义', () => {
    expect(escapeLikePattern(String.raw`100%_done\path`)).toBe(String.raw`100\%\_done\\path`);
    expect(`%${escapeLikePattern('%_')}%`).toBe(String.raw`%\%\_%`);
  });
});
