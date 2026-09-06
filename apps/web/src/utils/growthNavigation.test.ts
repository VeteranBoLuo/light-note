import { describe, expect, it } from 'vitest';
import { growthNextActionCommand, resolveDailyQuestRoute, resolveGrowthActionRoute } from './growthNavigation';

describe('growthNavigation', () => {
  it.each([false, true])('下一步建议在移动模式 %s 下前往动作对应的业务入口', (mobile) => {
    for (const [action, path] of [
      ['create_note', '/noteLibrary'],
      ['upload_file', '/cloudSpace'],
      ['create_bookmark', '/home'],
    ]) {
      expect(resolveGrowthActionRoute(action, mobile)).toBe(path);
    }
    expect(resolveGrowthActionRoute('create_todo', mobile)).toEqual({ path: '/inbox', query: { tab: 'todo' } });
    expect(resolveGrowthActionRoute('open_todos', mobile)).toEqual({ path: '/inbox', query: { tab: 'todo' } });
    expect(resolveGrowthActionRoute('open_inbox', mobile)).toEqual({ path: '/organize', query: { issue: 'pending' } });
    expect(resolveGrowthActionRoute('checkin', mobile)).toEqual({ path: '/growth', query: { section: 'overview' } });
    expect(resolveGrowthActionRoute('open_weekly_report', mobile)).toEqual({
      path: '/growth',
      query: { section: 'overview', report: 'weekly' },
    });
    expect(resolveGrowthActionRoute('profile', mobile)).toBeNull();
    expect(resolveGrowthActionRoute('future_action', mobile)).toBeNull();
  });

  it('区分日常写笔记、上传文件、周挑战和新手路线，避免都落到周挑战', () => {
    expect(growthNextActionCommand({ type: 'daily_quest', key: 'daily_note', action: 'create_note' })).toBe(
      'create_note',
    );
    expect(growthNextActionCommand({ type: 'growth_task', key: 'first_file', action: 'upload_file' })).toBe(
      'upload_file',
    );
    const weeklyAction = growthNextActionCommand({
      type: 'weekly_challenge',
      key: 'todo_5',
      action: 'open_growth_tasks',
    });
    expect(resolveGrowthActionRoute(weeklyAction, false)).toEqual({
      path: '/growth',
      query: { section: 'tasks' },
      hash: '#growth-weekly',
    });
    expect(resolveGrowthActionRoute('open_growth_tasks', false)).toEqual({
      path: '/growth',
      query: { section: 'tasks' },
      hash: '#growth-tasks',
    });
  });
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
