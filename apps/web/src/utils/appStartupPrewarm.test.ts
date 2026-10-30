import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODE_PREWARM_GROUPS, PREWARM_PRIORITY, PREWARM_RUNTIME_ENTRIES } from '@/config/staticPrewarmGroups';
import { scheduleStaticPrewarm } from './staticPrewarm';
import { syncServiceWorkerAssets } from './assetCache';
import { scheduleAppStartupPrewarm } from './appStartupPrewarm';
import { manorPrewarmSelections } from './manorPrewarm';

vi.mock('./staticPrewarm', () => ({ scheduleStaticPrewarm: vi.fn(() => vi.fn()) }));
vi.mock('./assetCache', () => ({ syncServiceWorkerAssets: vi.fn(async () => false) }));
afterEach(() => vi.clearAllMocks());

it('keeps browsing before unopened manor resources and editors regardless of producer registration order', () => {
  const dispose = scheduleAppStartupPrewarm();
  const selections = vi.mocked(scheduleStaticPrewarm).mock.calls.map(([selection]) => selection);
  const ordered = [...manorPrewarmSelections(false), ...selections].sort((a, b) => a.priority - b.priority);
  const groups = ordered.flatMap((selection) => selection.groups || []);
  expect(groups.slice(0, 3)).toEqual(['route.home', 'route.noteLibrary', 'route.inbox']);
  for (const group of ['route.home', 'route.noteLibrary', 'route.inbox', 'route.communityChat', 'route.growth']) {
    expect(groups.indexOf(group)).toBeLessThan(groups.indexOf('manor.critical'));
    expect(groups.indexOf(group)).toBeLessThan(groups.indexOf('editor.html'));
  }
  // 常驻导航入口在移动网络下也预热，其余浏览页与编辑器仍只在不限流量网络下预热。
  expect(selections[0].optional).toBeFalsy();
  expect(selections.slice(1).every((selection) => selection.optional)).toBe(true);
  expect(selections[0].priority).toBeGreaterThan(PREWARM_PRIORITY.current);
  expect(PREWARM_PRIORITY.intent).toBeLessThan(PREWARM_PRIORITY.current);
  dispose();
  for (const result of vi.mocked(scheduleStaticPrewarm).mock.results) expect(result.value).toHaveBeenCalledOnce();
});

it('预热的导航入口覆盖手机底栏与 PC 侧栏，且每个分组都已在构建入口中登记', () => {
  scheduleAppStartupPrewarm();
  const [navigation, ...rest] = vi.mocked(scheduleStaticPrewarm).mock.calls.map(([selection]) => selection);
  for (const group of [
    'route.workbenches',
    'route.home',
    'route.noteLibrary',
    'route.cloudSpace',
    'route.tagMg',
    'route.inbox',
    'route.communityChat',
    'route.searchCenter',
    'route.growth',
  ]) {
    expect(navigation.groups).toContain(group);
  }
  for (const group of [navigation, ...rest].flatMap((selection) => selection.groups || [])) {
    expect(Object.hasOwn(PREWARM_RUNTIME_ENTRIES, group)).toBe(true);
  }
});

describe('Service Worker 接管后补齐全部代码', () => {
  const flush = async () => {
    for (let index = 0; index < 5; index++) await Promise.resolve();
  };
  const codeSelections = () =>
    vi.mocked(scheduleStaticPrewarm).mock.calls.filter(([selection]) => selection.groups?.includes(CODE_PREWARM_GROUPS[0]));

  it('页面已由开启资源缓存的 Service Worker 接管时，以最低优先级、仅在不限流量网络下补齐全部代码分片', async () => {
    vi.mocked(syncServiceWorkerAssets).mockResolvedValueOnce(true);
    const dispose = scheduleAppStartupPrewarm();
    await flush();
    const [[selection]] = codeSelections();
    expect(selection.groups).toEqual([...CODE_PREWARM_GROUPS]);
    expect(selection.priority).toBe(PREWARM_PRIORITY.decorative);
    expect(selection.optional).toBe(true);
    dispose();
    for (const result of vi.mocked(scheduleStaticPrewarm).mock.results) expect(result.value).toHaveBeenCalledOnce();
  });

  it('未被接管或已释放时不补齐，避免只写进容易被挤掉的 HTTP 缓存', async () => {
    scheduleAppStartupPrewarm();
    await flush();
    expect(codeSelections()).toEqual([]);
    vi.mocked(syncServiceWorkerAssets).mockResolvedValueOnce(true);
    scheduleAppStartupPrewarm()();
    await flush();
    expect(codeSelections()).toEqual([]);
  });
});
