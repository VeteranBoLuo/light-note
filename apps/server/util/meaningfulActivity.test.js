import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: { query: vi.fn() } }));

import {
  c5DailyQuestsFromFacts,
  c6DailyQuestsFromFacts,
  getMeaningfulActiveDays,
  getMeaningfulActivityFacts,
} from './meaningfulActivity.js';

describe('meaningfulActivity', () => {
  it('同一事件只占一个行动槽，两个不同笔记可以完成两个槽', () => {
    const one = c5DailyQuestsFromFacts({
      checkedInToday: true,
      facts: { events: [{ eventId: 1, kind: 'note' }] },
    });
    expect(one.map((item) => item.done)).toEqual([true, true, false]);
    const two = c5DailyQuestsFromFacts({
      checkedInToday: false,
      facts: {
        events: [
          { eventId: 1, kind: 'note' },
          { eventId: 2, kind: 'note' },
        ],
      },
    });
    expect(two.map((item) => item.done)).toEqual([false, true, true]);
    expect(two[1].countedEvent?.type).toBe('note');
    expect(two[2].countedEvent?.type).toBe('note');
  });

  it('按账号时区从不可变事件账本一次聚合，不读取业务表', async () => {
    const db = {
      query: vi.fn().mockResolvedValueOnce([
        [
          { id: 1, source: 'activity_bookmark', refId: 'a', day: '20260814' },
          { id: 2, source: 'todo_complete', refId: 'b', day: '20260814' },
        ],
      ]),
    };
    const facts = await getMeaningfulActivityFacts('u1', {
      db,
      calendar: { shiftMinutes: 60 },
      dayKey: '20260814',
    });
    expect(facts).toMatchObject({ total: 2, activeDays: 1, variety: 2, byType: { bookmark: 1, todo: 1 } });
    expect(db.query.mock.calls[0][0]).toContain('FROM growth_events');
    expect(db.query.mock.calls[0][0]).not.toContain('FROM bookmark');
  });

  it('C6 两个具体任务只读取各自事实，一个事件不会同时完成两项', () => {
    const empty = c6DailyQuestsFromFacts({
      userId: 'user-1',
      dayKey: '20260820',
      checkedInToday: true,
      facts: { byType: {}, events: [] },
    });
    const firstKind = empty[1].key.replace('daily_', '');
    const quests = c6DailyQuestsFromFacts({
      userId: 'user-1',
      dayKey: '20260820',
      checkedInToday: true,
      facts: { byType: { [firstKind]: 1 }, events: [{ eventId: 1, kind: firstKind }] },
    });

    expect(quests.map((quest) => quest.done)).toEqual([true, true, false]);
    expect(quests.slice(1).every((quest) => quest.random && quest.target === 1)).toBe(true);
    expect(quests[1].key).not.toBe(quests[2].key);
  });

  it('创建待办只参与 C6 每日任务，不改变 C5 有效活跃日与成就口径', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([[{ activeDays: 3 }]]) };
    await expect(getMeaningfulActiveDays('u1', { db, calendar: { shiftMinutes: 0 } })).resolves.toBe(3);
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('todo_complete');
    expect(params).not.toContain('todo_create');
  });

  it('显式传入空任务类型时直接返回空事实，不生成非法 IN 查询', async () => {
    const db = { query: vi.fn() };
    await expect(
      getMeaningfulActivityFacts('u1', {
        db,
        calendar: { shiftMinutes: 0 },
        dayKey: '20260820',
        activityKinds: [],
      }),
    ).resolves.toEqual({ total: 0, byType: {}, activeDays: 0, variety: 0, events: [] });
    expect(db.query).not.toHaveBeenCalled();
  });
});
