import { computed, createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';

vi.mock('@/store', () => ({
  bookmarkStore: () => ({ isMobile: false }),
  useUserStore: () => ({ id: 'test-user', role: 'user', visitorWorkspace: false, adminContext: null }),
}));
vi.mock('@/router', () => ({ default: { push: vi.fn() } }));
vi.mock('@/composables/useNoteSummary', () => ({ useNoteSummary: () => computed(() => '摘要') }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i aria-hidden="true" />' },
}));
vi.mock('@/components/inbox/InboxPendingBadge.vue', () => ({ default: { template: '<i />' } }));
vi.mock('@/components/base/PinBadge.vue', () => ({ default: { template: '<i />' } }));
vi.mock('@/components/noteLibrary/library/NoteFormatBadge.vue', () => ({ default: { template: '<i />' } }));
vi.mock('@/components/tag/ResourceTagChip.vue', () => ({ default: { template: '<i />' } }));

const [{ default: NoteCard }, { default: NoteListItem }] = await Promise.all([
  import('./NoteCard.vue'),
  import('./NoteListItem.vue'),
]);

describe.each([
  ['卡片', NoteCard, '.note-card'],
  ['列表', NoteListItem, '.note-list-item'],
] as const)('%s视图父级页面入口', (_label, Component, rootSelector) => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('点击父级胶囊只打开直接父页面，不触发当前笔记打开', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const open = vi.fn();
    const openParent = vi.fn();
    const note = {
      id: 'current',
      parentId: 'direct-parent',
      title: '开发修复计划',
      type: 'html',
      tags: [],
      path: [
        { id: 'root', title: '笔记库' },
        { id: 'direct-parent', title: '开发文档' },
        { id: 'current', title: '开发修复计划' },
      ],
    };
    const app = createApp({
      render: () => h(Component, { note, onOpen: open, onOpenParent: openParent }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.directive('click-log', {});
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    host.querySelector<HTMLButtonElement>('.note-parent-path')!.click();
    expect(openParent).toHaveBeenCalledWith('direct-parent');
    expect(open).not.toHaveBeenCalled();

    host.querySelector<HTMLElement>(rootSelector)!.click();
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('笔记卡片缩略图', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('独立懒加载缩略图，加载失败时无布局阻塞地退化为纯文本卡片', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const previewImageUrl = '/api/note/image-thumbnail/hash.webp?source=note';
    const app = createApp({
      render: () =>
        h(NoteCard, {
          note: {
            id: 'note-with-cover',
            title: '带封面的笔记',
            type: 'html',
            tags: [],
            previewImageUrl,
          },
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.directive('click-log', {});
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    const image = host.querySelector<HTMLImageElement>('.note-preview-image');
    expect(image?.getAttribute('src')).toBe(previewImageUrl);
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('decoding')).toBe('async');
    expect(image?.getAttribute('fetchpriority')).toBe('low');

    image?.dispatchEvent(new Event('load'));
    await nextTick();
    expect(image?.classList.contains('is-loaded')).toBe(true);

    image?.dispatchEvent(new Event('error'));
    await nextTick();
    expect(host.querySelector('.note-preview-media')).toBeNull();
    expect(host.querySelector('.note-content')?.textContent).toBe('摘要');
  });
});
