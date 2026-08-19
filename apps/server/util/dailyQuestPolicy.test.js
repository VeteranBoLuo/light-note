import { describe, expect, it } from 'vitest';
import { C6_DAILY_QUESTS, selectC6DailyQuests, selectLegacyDailyQuestKey } from './dailyQuestPolicy.js';

function dayKeyAt(offset) {
  const date = new Date(Date.UTC(2026, 7, 20 + offset));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}

describe('dailyQuestPolicy', () => {
  it('同一账号同一天稳定返回两个不同且无需前置库存的任务', () => {
    const first = selectC6DailyQuests('user-1', '20260820');
    const repeated = selectC6DailyQuests('user-1', '20260820');

    expect(repeated).toEqual(first);
    expect(first).toHaveLength(2);
    expect(C6_DAILY_QUESTS).toContainEqual(first[0]);
    expect(C6_DAILY_QUESTS).toContainEqual(first[1]);
    expect(new Set(first.map((quest) => quest.kind)).size).toBe(2);
    expect(first.every((quest) => !['todo', 'organize'].includes(quest.kind))).toBe(true);
  });

  it('六日内覆盖全部两两组合且相邻日期不重复', () => {
    const days = Array.from({ length: 7 }, (_, index) => selectC6DailyQuests('user-1', dayKeyAt(index)));
    const combinations = days.slice(0, 6).map((quests) => quests.map((quest) => quest.key).join('+'));

    expect(new Set(combinations).size).toBe(6);
    expect(days[6]).toEqual(days[0]);
    for (let index = 1; index < days.length; index += 1) {
      expect(days[index]).not.toEqual(days[index - 1]);
    }
  });

  it('不同账号使用不同的稳定排列，同时覆盖完整任务目录', () => {
    const userOne = Array.from({ length: 6 }, (_, index) => selectC6DailyQuests('user-1', dayKeyAt(index)));
    const userTwo = Array.from({ length: 6 }, (_, index) => selectC6DailyQuests('user-2', dayKeyAt(index)));

    expect(userOne).not.toEqual(userTwo);
    expect(new Set(userOne.flat().map((quest) => quest.key))).toEqual(
      new Set(C6_DAILY_QUESTS.map((quest) => quest.key)),
    );
  });

  it('拒绝非法自然日，并保持 legacy 兼容选择稳定', () => {
    expect(() => selectC6DailyQuests('user-1', '20260230')).toThrow('INVALID_DAILY_QUEST_DAY');
    expect(selectLegacyDailyQuestKey('root-1', '20260806')).toBe('daily_todo');
    expect(selectLegacyDailyQuestKey('compat-1', '20260820')).toBe('daily_note');
    expect(selectLegacyDailyQuestKey('compat-2', '20260820')).toBe('daily_bookmark');
  });
});
