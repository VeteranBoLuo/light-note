import { describe, expect, it } from 'vitest';
import { resolveDailyQuestRoute } from './growthNavigation';

describe('growthNavigation', () => {
  it('把每日任务映射到可直接完成任务的标准入口', () => {
    expect(resolveDailyQuestRoute('create', false)).toBe('/noteLibrary');
    expect(resolveDailyQuestRoute('daily_note', true)).toBe('/noteLibrary');
    expect(resolveDailyQuestRoute('daily_bookmark', false)).toBe('/home');
    expect(resolveDailyQuestRoute('daily_file', true)).toBe('/cloudSpace');
    expect(resolveDailyQuestRoute('daily_todo_create', false)).toEqual({ path: '/inbox', query: { tab: 'todo' } });
    expect(resolveDailyQuestRoute('daily_todo', true)).toEqual({ path: '/inbox', query: { tab: 'todo' } });
  });

  it('待整理任务统一进入整理中心，未知任务留给调用页兜底', () => {
    expect(resolveDailyQuestRoute('daily_organize', false)).toEqual({ path: '/organize', query: { issue: 'pending' } });
    expect(resolveDailyQuestRoute('daily_organize', true)).toEqual({ path: '/organize', query: { issue: 'pending' } });
    expect(resolveDailyQuestRoute('future_quest', false)).toBeNull();
    expect(resolveDailyQuestRoute('checkin', true)).toBeNull();
  });
});
