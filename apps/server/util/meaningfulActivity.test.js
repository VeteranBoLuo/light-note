import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: { query: vi.fn() } }));

import { c5DailyQuestsFromFacts, getMeaningfulActivityFacts } from './meaningfulActivity.js';

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
});
