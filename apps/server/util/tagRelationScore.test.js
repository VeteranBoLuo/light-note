import { describe, expect, it } from 'vitest';
import {
  compareRelatedTags,
  computeTagSimilarity,
  isRelatedTagQualified,
  rankRelatedTags,
} from './tagRelationScore.js';

describe('tagRelationScore', () => {
  it('相似度按共现数与两侧体量归一化', () => {
    expect(computeTagSimilarity({ sharedCount: 4, sourceResourceCount: 4, targetResourceCount: 4 })).toBe(1);
    expect(computeTagSimilarity({ sharedCount: 2, sourceResourceCount: 4, targetResourceCount: 4 })).toBe(0.5);
  });

  it('缺任一维度时相似度为 0,不产生 NaN', () => {
    expect(computeTagSimilarity({ sharedCount: 0, sourceResourceCount: 5, targetResourceCount: 5 })).toBe(0);
    expect(computeTagSimilarity({ sharedCount: 3, sourceResourceCount: 0, targetResourceCount: 5 })).toBe(0);
  });

  it('共现次数相同时,紧密的小标签排在大而泛的标签前面', () => {
    const ranked = rankRelatedTags(
      [
        { id: 'big', name: '收藏', sharedCount: 3, targetResourceCount: 200 },
        { id: 'small', name: '备案', sharedCount: 3, targetResourceCount: 4 },
      ],
      { sourceResourceCount: 5 },
    );
    expect(ranked.map((item) => item.id)).toEqual(['small', 'big']);
  });

  it('共现 1 次需相似度足够高才入选', () => {
    expect(
      isRelatedTagQualified({ sharedCount: 1, similarity: 0.5 }),
    ).toBe(true);
    expect(
      isRelatedTagQualified({ sharedCount: 1, similarity: 0.2 }),
    ).toBe(false);
    // 共现 2 次即便相似度偏低也保留,稀疏知识库不宜过严
    expect(isRelatedTagQualified({ sharedCount: 2, similarity: 0.2 })).toBe(true);
  });

  it('按 minSimilarity 过滤并截断到 limit', () => {
    const ranked = rankRelatedTags(
      [
        { id: 'a', name: 'A', sharedCount: 5, targetResourceCount: 5 },
        { id: 'b', name: 'B', sharedCount: 4, targetResourceCount: 6 },
        { id: 'c', name: 'C', sharedCount: 2, targetResourceCount: 400 },
      ],
      { sourceResourceCount: 5, limit: 2, minSimilarity: 0.3 },
    );
    expect(ranked.map((item) => item.id)).toEqual(['a', 'b']);
    expect(ranked[0].reason).toBe('co_occurrence');
  });

  it('无共现的候选一律不入选', () => {
    expect(rankRelatedTags([{ id: 'x', name: 'X', sharedCount: 0, targetResourceCount: 9 }], {
      sourceResourceCount: 5,
    })).toEqual([]);
  });

  it('排序在各项相同时按 id 稳定,不随查询顺序抖动', () => {
    const left = { id: 'a', similarity: 0.5, sharedCount: 2, targetResourceCount: 4 };
    const right = { id: 'b', similarity: 0.5, sharedCount: 2, targetResourceCount: 4 };
    expect(compareRelatedTags(left, right)).toBeLessThan(0);
    expect(compareRelatedTags(right, left)).toBeGreaterThan(0);
  });
});
