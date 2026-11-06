import { describe, expect, it } from 'vitest';
import { buildNewUserSeedContent, newUserSeedResourceId } from './newUserSeedService.js';
import { isUnchangedOnboardingTodo } from './initialTodoPlanUpgradeService.js';

function sample(lang = 'zh-CN', index = 1) {
  const seed = buildNewUserSeedContent({ lang });
  const todo = seed.todos[index];
  return {
    row: {
      id: 'sample',
      user_id: 'owner',
      title: todo.title,
      description: todo.description,
      priority: todo.priority,
      status: 'pending',
      del_flag: 0,
      plan_version: 1,
      checklist: '[]',
      due_at: null,
      start_at: null,
      completed_at: null,
      sort_order: (index + 1) * 1000,
      list_id: todo.listKey ? 'list' : null,
    },
    organization: {
      userId: 'owner',
      list: todo.listKey ? { id: 'list', name: seed.todoLists[0].name } : null,
      tagIds: todo.tagKeys.map((key) => newUserSeedResourceId('owner', `tag:${key}`)),
      references: [],
    },
  };
}

describe('original onboarding sample eligibility', () => {
  it.each(['zh-CN', 'en-US'])('recognizes all three original %s samples', (lang) => {
    for (let index = 0; index < 3; index++) {
      const { row, organization } = sample(lang, index);
      expect(isUnchangedOnboardingTodo(row, organization)).toBe(true);
    }
  });
  it.each([
    { title: '我的任务' },
    { description: '改过说明' },
    { priority: 0 },
    { checklist: '[{"text":"步骤"}]' },
    { sort_order: 50 },
    { due_at: '2026-11-07 18:00:00' },
    { start_at: '2026-11-07 17:00:00' },
    { status: 'completed' },
    { del_flag: 1 },
    { plan_version: 2 },
    { user_id: 'other' },
    { recurrence_rule: '{}' },
    { series_id: 'series' },
    { generated_by_todo_id: 'parent' },
  ])('skips edited or historical sample: %o', (changed) => {
    const { row, organization } = sample();
    expect(isUnchangedOnboardingTodo({ ...row, ...changed }, organization)).toBe(false);
  });
  it.each([
    { list: { id: 'other', name: '轻笺入门' } },
    { list: { id: 'list', name: '改过清单' } },
    { tagIds: [] },
    { tagIds: ['custom-tag'] },
    { references: [{ target_id: 'note' }] },
  ])('keeps edited list, tags and references: %o', (changed) => {
    const { row, organization } = sample();
    expect(isUnchangedOnboardingTodo(row, { ...organization, ...changed })).toBe(false);
  });
});
