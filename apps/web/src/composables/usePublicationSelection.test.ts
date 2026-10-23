import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, reactive } from 'vue';
import type { PublicationWorkspaceItem } from '@lightnote/shared/public-resources';
const mocks = vi.hoisted(() => ({ scope: {} as any }));
vi.mock('@/store/publicResourceScope', () => ({ usePublicResourceScope: () => mocks.scope }));
import { usePublicationSelection, publicationKey } from './usePublicationSelection';
let app: ReturnType<typeof createApp>;
const item = (id: string, status?: string, unavailable = false): PublicationWorkspaceItem => ({
  kind: 'note',
  sourceId: id,
  title: id,
  updatedAt: '',
  sourceUnavailable: unavailable,
  publication: status
    ? ({
        publicId: 'pub-' + id,
        status,
        pendingRevision: status === 'pending_review' ? 2 : null,
        publishedRevision: status === 'published' ? 1 : null,
      } as any)
    : null,
});
function setup() {
  let state!: ReturnType<typeof usePublicationSelection>;
  app = createApp({
    setup() {
      state = usePublicationSelection();
      return () => null;
    },
  });
  app.mount(document.createElement('div'));
  return state;
}
beforeEach(() => {
  mocks.scope = reactive({ identity: 'one' });
});
afterEach(() => app?.unmount());
describe('统一公开管理选择', () => {
  it('一份选择混合未公开、已公开与待审项，撤回目标仅取可撤回子集', () => {
    const state = setup();
    state.toggle(item('a'));
    state.toggle(item('b', 'published'));
    state.toggle(item('c', 'pending_review'));
    state.toggle(item('d', 'withdrawn'));
    expect(state.items.value.size).toBe(4);
    expect(state.withdrawalTargets.value.map((i) => i.publicId)).toEqual(['pub-b', 'pub-c']);
    state.toggle(item('removed', 'removed'));
    state.toggle(item('missing', 'withdrawn', true));
    expect(state.items.value.size).toBe(4);
  });
  it('跨页和筛选保留显式范围，全选只处理本页；类型参与键且超过100不部分选中', () => {
    const state = setup();
    const off = item('same');
    state.toggle(off);
    state.toggle({ ...off, kind: 'bookmark' });
    state.togglePage([item('b'), item('c')]);
    state.togglePage([item('b'), item('c')]);
    expect([...state.items.value.keys()]).toEqual(['note:same', 'bookmark:same']);
    state.togglePage(Array.from({ length: 19 }, (_, i) => item(String(i))));
    expect(state.items.value.size).toBe(21);
    state.togglePage(Array.from({ length: 79 }, (_, i) => item('fill-' + i)));
    expect(state.items.value.size).toBe(100);
    state.togglePage([item('over'), item('over2')]);
    expect(state.items.value.size).toBe(100);
    expect(state.error.value).toBe('PUBLIC_RESOURCE_BATCH_LIMIT');
  });
  it('无需进入批量模式即可选择，已选项状态变化仍可取消，清空或切号结束选择', () => {
    const state = setup();
    const target = item('a');
    state.toggle(target);
    state.toggle({ ...target, sourceUnavailable: true });
    expect(state.items.value.size).toBe(0);
    state.toggle(target);
    state.clear();
    expect(state.items.value.size).toBe(0);
    state.toggle(target);
    mocks.scope.identity = 'other';
    expect(state.items.value.size).toBe(0);
    expect(publicationKey(target)).toBe('note:a');
  });
  it('点击行只预览，勾选同时预览，取消和全选保持合理焦点', () => {
    const state = setup();
    state.focus(item('a'));
    state.focus(item('b'));
    state.focus(item('a'));
    expect(state.items.value.size).toBe(0);
    expect(state.active.value?.sourceId).toBe('a');
    state.toggle(item('a'));
    state.toggle(item('b'));
    expect(state.items.value.size).toBe(2);
    expect(state.active.value?.sourceId).toBe('b');
    state.toggle(item('a'));
    expect(state.items.value.size).toBe(1);
    expect(state.active.value?.sourceId).toBe('a');
    state.focus(item('removed', 'removed'));
    expect(state.items.value.size).toBe(1);
    expect(state.active.value?.sourceId).toBe('removed');
    state.clear();
    expect(state.items.value.size).toBe(0);
    expect(state.active.value?.sourceId).toBe('removed');
    state.togglePage([item('a'), item('b')]);
    expect(state.items.value.size).toBe(2);
    expect(state.active.value?.sourceId).toBe('removed');
    state.focus(item('a'));
    state.togglePage([item('a'), item('b')]);
    expect(state.items.value.size).toBe(0);
    expect(state.active.value?.sourceId).toBe('a');
  });
  it('选择已满100项仍可预览未选资源，超限只限制勾选；切号清空预览和选择', () => {
    const state = setup();
    state.togglePage(Array.from({ length: 100 }, (_, i) => item(String(i))));
    state.focus(item('0'));
    expect(state.active.value?.sourceId).toBe('0');
    state.focus(item('over'));
    expect(state.items.value.size).toBe(100);
    expect(state.active.value?.sourceId).toBe('over');
    expect(state.error.value).toBe('');
    state.toggle(item('over'));
    expect(state.items.value.size).toBe(100);
    expect(state.error.value).toBe('PUBLIC_RESOURCE_BATCH_LIMIT');
    state.focus(item('0'));
    state.items.value.delete('note:0');
    expect(state.active.value?.sourceId).toBe('0');
    mocks.scope.identity = 'other';
    expect(state.active.value).toBeNull();
    expect(state.items.value.size).toBe(0);
  });
});
