import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { useNoteLibraryNavigation } from './useNoteLibraryNavigation';
import { noteLibraryPreviewLocation, updateNotePreviewReturnPath } from '@/utils/noteDetailNavigation';

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));

async function setup(path = '/noteLibrary', mobile = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/other', component: {} },
      { path: '/noteLibrary', component: {} },
      { path: '/noteLibrary/:id', name: 'noteDetail', component: {} },
    ],
  });
  await router.push('/other');
  await router.push(path);
  const isMobile = ref(mobile);
  const scope = effectScope();
  scopes.push(scope);
  const navigation = scope.run(() => useNoteLibraryNavigation(router, isMobile))!;
  await nextTick();
  return { router, isMobile, ...navigation };
}

async function go(router: Router, delta: number) {
  await new Promise<void>((resolve) => {
    const remove = router.afterEach(() => { remove(); resolve(); });
    router.go(delta);
  });
  await nextTick();
}

describe('笔记库 URL 导航', () => {
  it('A → B 逐条后退到列表及原模块，并可前进恢复；重复点击不入栈', async () => {
    const { router, previewNoteId, openPreview } = await setup('/noteLibrary?parent=P&tag=T');
    await openPreview('A');
    await openPreview('A');
    await openPreview('B');
    expect(router.currentRoute.value.query).toEqual({ parent: 'P', tag: 'T', preview: 'B' });
    await go(router, -1);
    expect(previewNoteId.value).toBe('A');
    await go(router, -1);
    expect(previewNoteId.value).toBeNull();
    expect(router.currentRoute.value.query).toEqual({ parent: 'P', tag: 'T' });
    await go(router, -1);
    expect(router.currentRoute.value.path).toBe('/other');
    await go(router, 1);
    await go(router, 1);
    expect(previewNoteId.value).toBe('A');
  });

  it('主动关闭进入列表，返回能重新打开刚关闭的预览', async () => {
    const { router, openPreview, closePreview, previewNoteId } = await setup();
    await openPreview('A');
    await closePreview();
    expect(previewNoteId.value).toBeNull();
    await go(router, -1);
    expect(previewNoteId.value).toBe('A');
  });

  it('目录和标签与关闭合为一条历史', async () => {
    const { router, openPreview } = await setup('/noteLibrary?parent=P&tag=T');
    await openPreview('A');
    await router.push(noteLibraryPreviewLocation({ ...router.currentRoute.value.query, parent: 'Q', tag: 'U' }, null));
    expect(router.currentRoute.value.query).toEqual({ parent: 'Q', tag: 'U' });
    await go(router, -1);
    expect(router.currentRoute.value.query).toEqual({ parent: 'P', tag: 'T', preview: 'A' });
  });

  it('刷新初始化只服从 URL，忽略旧账号会话记忆；数组取首项并规范化', async () => {
    sessionStorage.setItem('light-note-note-library-preview', JSON.stringify({ ownerKey: 'old', noteId: 'old' }));
    const plain = await setup();
    expect(plain.previewNoteId.value).toBeNull();
    const restored = await setup('/noteLibrary?preview=%20A%20&preview=B');
    await vi.waitFor(() => expect(restored.router.currentRoute.value.query.preview).toBe('A'));
    expect(restored.previewNoteId.value).toBe('A');
    await go(restored.router, -1);
    expect(restored.router.currentRoute.value.path).toBe('/other');
    const empty = await setup('/noteLibrary?preview=');
    await vi.waitFor(() => expect(empty.router.currentRoute.value.query).toEqual({}));
    const flag = await setup('/noteLibrary?preview');
    await vi.waitFor(() => expect(flag.router.currentRoute.value.query).toEqual({}));
  });

  it.each([false, true])('手机深链或响应式切换仅替换当前入口，不造成返回循环（初始手机 %s）', async (mobile) => {
    const { router, isMobile } = await setup('/noteLibrary?parent=P&tag=T&preview=A', mobile);
    isMobile.value = true;
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('noteDetail'));
    expect(router.currentRoute.value.params.id).toBe('A');
    expect(router.currentRoute.value.query.from).toBe('/noteLibrary?parent=P&tag=T');
    await go(router, -1);
    expect(router.currentRoute.value.path).toBe('/other');
  });

  it('失效预览替换为列表，不保留当前失效记录', async () => {
    const { router, openPreview, closePreview } = await setup();
    await openPreview('A');
    await openPreview('deleted');
    await closePreview(true);
    await go(router, -1);
    expect(router.currentRoute.value.query.preview).toBe('A');
  });

  it('导航被保存守卫取消时保留原状态，离开后 KeepAlive 不导航', async () => {
    const { router, openPreview, closePreview, previewNoteId } = await setup('/noteLibrary?preview=A');
    const remove = router.beforeEach(() => false);
    await openPreview('B');
    await closePreview();
    expect(previewNoteId.value).toBe('A');
    remove();
    await router.push('/other');
    await openPreview('C');
    await closePreview(true);
    expect(router.currentRoute.value.path).toBe('/other');
  });

  it('快速切换以最后成功的路由为准', async () => {
    const { router, previewNoteId, openPreview } = await setup();
    await Promise.all([openPreview('A'), openPreview('B')]);
    expect(previewNoteId.value).toBe('B');
    await go(router, -1);
    expect(router.currentRoute.value.path).toBe('/noteLibrary');
    expect(previewNoteId.value).toBeNull();
  });

  it('编辑内切换仅更新预览来源，其他模块来源保持不变', () => {
    expect(updateNotePreviewReturnPath('/noteLibrary?parent=P&preview=A', 'B')).toBe('/noteLibrary?parent=P&preview=B');
    expect(updateNotePreviewReturnPath('/noteLibrary?parent=P', 'B')).toBe('/noteLibrary?parent=P');
    expect(updateNotePreviewReturnPath('/organize?issue=pending', 'B')).toBe('/organize?issue=pending');
    expect(updateNotePreviewReturnPath('https://example.com', 'B')).toBe('');
  });
});
