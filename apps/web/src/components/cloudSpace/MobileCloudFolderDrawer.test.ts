import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import MobileCloudFolderDrawer from './MobileCloudFolderDrawer.vue';
import type { CloudFolderNode } from '@/types/cloudFolder';

vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    name: 'BDrawerStub',
    props: ['open', 'title'],
    emits: ['close'],
    setup(props: { open: boolean }, { slots }: { slots: Record<string, () => unknown> }) {
      return () => (props.open ? h('section', { class: 'drawer-stub' }, slots.default?.()) : null);
    },
  },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub' }) },
}));

const folders: CloudFolderNode[] = [
  {
    id: 'work',
    name: '工作',
    parentId: null,
    depth: 1,
    sort: 0,
    childCount: 1,
    directFileCount: 2,
    hasChildren: true,
    path: ['工作'],
    fullPath: '工作',
  },
  {
    id: 'weekly',
    name: '周报',
    parentId: 'work',
    depth: 2,
    sort: 0,
    childCount: 0,
    directFileCount: 1,
    hasChildren: false,
    path: ['工作', '周报'],
    fullPath: '工作 / 周报',
  },
  {
    id: 'life',
    name: '生活',
    parentId: null,
    depth: 1,
    sort: 1,
    childCount: 0,
    directFileCount: 0,
    hasChildren: false,
    path: ['生活'],
    fullPath: '生活',
  },
];

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('MobileCloudFolderDrawer', () => {
  it('固定显示全部文件，目录树不渲染根节点并按展开状态展示子级', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const selected = vi.fn();
    const openChanged = vi.fn();
    const expandedIds = ref<string[]>([]);
    const app = createApp({
      render: () =>
        h(MobileCloudFolderDrawer, {
          open: true,
          folders,
          currentFolderId: 'all',
          allFileCount: 4,
          expandedIds: expandedIds.value,
          onToggle: (id: string) => {
            expandedIds.value = expandedIds.value.includes(id) ? [] : [id];
          },
          onSelect: selected,
          'onUpdate:open': openChanged,
        }),
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: {
          'zh-CN': {
            common: { loading: '加载中' },
            cloudSpace: {
              folderTree: '文件夹目录',
              allFile: '全部文件',
              expandFolder: '展开“{name}”',
              collapseFolder: '收起“{name}”',
              noFoldersToManage: '还没有文件夹',
            },
          },
        },
      }),
    );
    app.directive('auto-scrollbar', {});
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    expect(host.textContent).toContain('全部文件');
    expect(host.textContent).toContain('工作');
    expect(host.textContent).toContain('生活');
    expect(host.textContent).not.toContain('周报');
    expect(host.textContent).not.toContain('根目录');
    expect(
      [...host.querySelectorAll<HTMLElement>('.mobile-cloud-folder-drawer__count')].map((node) => node.textContent),
    ).toEqual(['4', '2', '—']);

    host.querySelector<HTMLButtonElement>('.mobile-cloud-folder-drawer__toggle')?.click();
    await nextTick();
    expect(host.textContent).toContain('周报');
    expect(selected).not.toHaveBeenCalled();
    expect(
      [...host.querySelectorAll<HTMLElement>('.mobile-cloud-folder-drawer__count')].map((node) => node.textContent),
    ).toEqual(['4', '2', '1', '—']);

    [...host.querySelectorAll<HTMLElement>('.mobile-cloud-folder-drawer__row')]
      .find((row) => row.textContent?.includes('周报'))
      ?.click();
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 'weekly', fullPath: '工作 / 周报' }));
    expect(openChanged).not.toHaveBeenCalled();

    host.querySelector<HTMLButtonElement>('.mobile-cloud-folder-drawer__all')?.click();
    expect(selected).toHaveBeenLastCalledWith(null);
    expect(openChanged).not.toHaveBeenCalled();
  });
});
