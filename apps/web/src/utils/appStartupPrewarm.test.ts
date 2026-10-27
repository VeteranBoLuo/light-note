import { afterEach, expect, it, vi } from 'vitest';
import { PREWARM_PRIORITY } from '@/config/staticPrewarmGroups';
import { scheduleStaticPrewarm } from './staticPrewarm';
import { scheduleAppStartupPrewarm } from './appStartupPrewarm';
import { manorPrewarmSelections } from './manorPrewarm';

vi.mock('./staticPrewarm', () => ({ scheduleStaticPrewarm: vi.fn(() => vi.fn()) }));
afterEach(() => vi.clearAllMocks());

it('keeps browsing before unopened manor resources and editors regardless of producer registration order', () => {
  const dispose = scheduleAppStartupPrewarm();
  const selections = vi.mocked(scheduleStaticPrewarm).mock.calls.map(([selection]) => selection);
  const ordered = [...manorPrewarmSelections(false), ...selections].sort((a, b) => a.priority - b.priority);
  const groups = ordered.flatMap((selection) => selection.groups || []);
  expect(groups.slice(0, 3)).toEqual(['route.home', 'route.noteLibrary', 'route.cloudSpace']);
  for (const group of ['route.home', 'route.noteLibrary', 'route.cloudSpace', 'route.tagMg', 'route.searchCenter']) {
    expect(groups.indexOf(group)).toBeLessThan(groups.indexOf('manor.critical'));
    expect(groups.indexOf(group)).toBeLessThan(groups.indexOf('editor.html'));
  }
  expect(selections.every((selection) => selection.optional)).toBe(true);
  expect(selections[0].priority).toBeGreaterThan(PREWARM_PRIORITY.current);
  expect(PREWARM_PRIORITY.intent).toBeLessThan(PREWARM_PRIORITY.current);
  dispose();
  for (const result of vi.mocked(scheduleStaticPrewarm).mock.results) expect(result.value).toHaveBeenCalledOnce();
});
