import { describe, expect, it } from 'vitest';
import { extractStudyCards } from './studyCards.js';
describe('versioned study cards', () => {
  it('keeps historical prose readable without inventing interactive data', () => {
    expect(extractStudyCards('旧版学习材料\n问题：什么是事务？\n答案：原子操作。').cards).toEqual([]);
  });
  it('uses stable content IDs, excludes headers and deduplicates repeated rows', () => {
    const source =
      '## 记忆卡\n| 问题 | 答案 |\n| --- | --- |\n| 什么是事务？ | 原子操作 |\n| 什么是事务？ | 原子操作 |\n## 自测\n| 问题 | 答案 |\n| 是否原子？ | 是 |';
    const result = extractStudyCards(source);
    expect(result.cards).toHaveLength(2);
    expect(result.cards.map((card) => card.kind)).toEqual(['flashcard', 'quiz']);
    expect(extractStudyCards(source).cards[0].id).toBe(result.cards[0].id);
    expect(extractStudyCards(source.replace('原子操作', '全部成功或全部失败')).cards[0].id).not.toBe(
      result.cards[0].id,
    );
  });
});
