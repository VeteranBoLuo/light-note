import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import ResourceBacklinks from './ResourceBacklinks.vue';
import zhCN from '@/i18n/locales/zh-CN';

const { routerPush, fetchResourceBacklinks } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  fetchResourceBacklinks: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/api/noteReferences', () => ({
  fetchResourceBacklinks,
}));

let cleanup: (() => void) | undefined;

const populatedResult = {
  available: true,
  items: [
    { sourceType: 'note', id: 'note-1', title: '引用笔记', updateTime: '2026-09-01 08:00:00' },
    {
      sourceType: 'todo',
      id: 'todo-1',
      title: '引用待办',
      updateTime: '2026-09-02 08:00:00',
      status: 'completed',
    },
  ],
  hasMore: false,
  hasMoreByType: { note: false, todo: false },
} as const;

async function mountBacklinks(result: unknown = populatedResult) {
  if (result instanceof Error) fetchResourceBacklinks.mockRejectedValue(result);
  else fetchResourceBacklinks.mockResolvedValue(result);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () =>
      h(ResourceBacklinks, {
        targetType: 'file',
        targetId: 'file-1',
        placement: 'header',
        compact: true,
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await vi.waitFor(() => expect(fetchResourceBacklinks).toHaveBeenCalled());
  await nextTick();
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  routerPush.mockReset();
  fetchResourceBacklinks.mockReset();
});

describe('ResourceBacklinks', () => {
  it('把笔记与待办按来源分组，紧凑入口使用合计数量', async () => {
    await mountBacklinks();

    await vi.waitFor(() => expect(document.querySelector('.resource-backlinks__trigger')).not.toBeNull());
    const trigger = document.querySelector<HTMLButtonElement>('.resource-backlinks__trigger')!;
    expect(trigger.textContent).toContain('引用');
    expect(trigger.textContent).toContain('2');
    trigger.click();
    await nextTick();

    const groups = [...document.querySelectorAll('.resource-backlinks__group')];
    expect(groups.map((group) => group.querySelector('h3')?.textContent)).toEqual(['笔记（1）', '待办（1）']);
    expect(groups[1]?.textContent).toContain('已完成');
  });

  it('笔记与待办分别使用带 focusRef 的标准深链', async () => {
    await mountBacklinks();
    await vi.waitFor(() => expect(document.querySelector('.resource-backlinks__trigger')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('.resource-backlinks__trigger')!.click();
    await nextTick();
    const items = document.querySelectorAll<HTMLButtonElement>('.resource-backlinks__item');

    items[0].click();
    expect(routerPush).toHaveBeenLastCalledWith({
      path: '/noteLibrary/note-1',
      query: { focusRef: 'file:file-1' },
    });

    items[1].click();
    expect(routerPush).toHaveBeenLastCalledWith({
      path: '/inbox',
      query: { tab: 'todo', todoId: 'todo-1', focusRef: 'file:file-1' },
    });
  });

  it('空结果或读取失败时不占据文件标题栏空间', async () => {
    await mountBacklinks({
      available: true,
      items: [],
      hasMore: false,
      hasMoreByType: { note: false, todo: false },
    });
    expect(document.querySelector('.resource-backlinks')).toBeNull();
    cleanup?.();
    cleanup = undefined;

    await mountBacklinks(new Error('network'));
    expect(document.querySelector('.resource-backlinks')).toBeNull();
  });
});
