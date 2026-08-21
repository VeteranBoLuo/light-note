import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import MobileCloudSpaceActionsDrawer from './MobileCloudSpaceActionsDrawer.vue';

vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    name: 'BDrawerStub',
    props: ['open', 'title'],
    emits: ['close'],
    setup(
      props: { open: boolean; title: string },
      { slots, emit }: { slots: Record<string, () => unknown>; emit: (event: string) => void },
    ) {
      return () =>
        props.open
          ? h('section', { class: 'drawer-stub', 'data-title': props.title }, [
              h('button', { class: 'drawer-close-control', onClick: () => emit('close') }, 'drawer close'),
              slots['header-leading']?.(),
              slots['header-actions']?.(),
              slots.default?.(),
            ])
          : null;
    },
  },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub', 'aria-hidden': 'true' }) },
}));

vi.mock('@/components/base/BasicComponents/BActionMenu.vue', () => ({
  default: {
    name: 'BActionMenuStub',
    props: ['items', 'disabled', 'zIndex'],
    emits: ['select'],
    setup(
      props: {
        items: Array<{ key: string; label?: string; divider?: boolean; disabled?: boolean }>;
        disabled?: boolean;
      },
      { slots, emit }: { slots: Record<string, () => unknown>; emit: (event: string, key: string) => void },
    ) {
      return () =>
        h('div', { class: 'action-menu-stub', 'data-z-index': props.zIndex }, [
          slots.default?.(),
          ...props.items
            .filter((item) => !item.divider)
            .map((item) =>
              h(
                'button',
                {
                  class: 'b-action-menu__item',
                  disabled: props.disabled || item.disabled,
                  onClick: () => emit('select', item.key),
                },
                item.label,
              ),
            ),
        ]);
    },
  },
}));

let cleanup: (() => void) | undefined;

function mountDrawer(props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: {
      'zh-CN': {
        common: { back: '返回', close: '关闭', cancel: '取消', delete: '删除' },
        cloudSpace: {
          mobileActionsTitle: '云空间操作',
          newFolder: '新建文件夹',
          manageFolders: '文件夹管理',
          newSubfolder: '新建子文件夹',
          manageFoldersDescription: '新建子级、移动、重命名或删除文件夹',
          sort: '文件排序',
          sortDescription: '排序会作用于全部文件',
          sortLatest: '最近上传',
          sortEarliest: '最早上传',
          noFoldersToManage: '还没有文件夹，可以从上方新建',
          batchAction: '批量操作',
          exitBatch: '退出批量',
          batchActionDescription: '选择多个文件后移动、下载或删除',
          folderName: '文件夹名称',
          folderNamePlaceholder: '例如：项目资料',
          folderNameHint: '最多 255 个字符',
          folderNameRequired: '请输入文件夹名称',
          createAndEnterFolder: '创建并进入',
          createSubfolderUnder: '将在“{path}”下创建子文件夹',
          currentFolder: '当前',
          folderActionsFor: '“{name}”的文件夹操作',
          moveFolder: '移动文件夹',
          renameFolder: '重命名文件夹',
          renameFolderAction: '重命名“{name}”',
          saveFolderName: '保存修改',
          deleteFolderAction: '删除“{name}”',
          clearFolderFilesAction: '删除目录内全部文件…',
        },
      },
    },
  });
  const app = createApp({
    render: () => h(MobileCloudSpaceActionsDrawer, { open: true, ...props }),
  });
  app.use(i18n);
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('MobileCloudSpaceActionsDrawer', () => {
  it('在同一个抽屉内切换到命名表单并校验后提交去空格名称', async () => {
    const onCreateFolder = vi.fn();
    const host = mountDrawer({ onCreateFolder });
    await nextTick();

    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('云空间操作');
    const actions = host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-actions__item');
    expect(actions).toHaveLength(3);
    expect(host.textContent).toContain('新建子级、移动、重命名或删除文件夹');

    actions[0].click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('文件夹管理');
    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__create')?.click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('新建文件夹');
    expect(document.activeElement?.classList.contains('b-input')).toBe(true);

    host.querySelector<HTMLButtonElement>('.mobile-folder-form__button.primary_btn')?.click();
    await nextTick();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('请输入文件夹名称');
    expect(onCreateFolder).not.toHaveBeenCalled();

    const input = host.querySelector<HTMLInputElement>('.b-input');
    if (!input) throw new Error('folder input not found');
    input.value = '  项目资料  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    host.querySelector<HTMLButtonElement>('.mobile-folder-form__button.primary_btn')?.click();
    expect(onCreateFolder).toHaveBeenCalledWith('项目资料', null);
  });

  it('游客守卫可阻止进入表单，批量操作仍关闭抽屉并发出动作', async () => {
    const beforeManageFolders = vi.fn(() => false);
    const onOpenChange = vi.fn();
    const onBatch = vi.fn();
    const host = mountDrawer({
      beforeManageFolders,
      'onUpdate:open': onOpenChange,
      onBatch,
    });
    await nextTick();

    const actions = host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-actions__item');
    actions[0].click();
    await nextTick();
    expect(beforeManageFolders).toHaveBeenCalledOnce();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('云空间操作');

    actions[2].click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onBatch).toHaveBeenCalledOnce();
  });

  it('在独立子视图中选择排序并关闭抽屉', async () => {
    const onSort = vi.fn();
    const onOpenChange = vi.fn();
    const host = mountDrawer({
      sortValue: 'fileName:asc',
      sortOptions: [
        { value: 'createTime:desc', label: '最近上传' },
        { value: 'createTime:asc', label: '最早上传' },
        { value: 'fileName:asc', label: '名称 A–Z' },
      ],
      onSort,
      'onUpdate:open': onOpenChange,
    });
    await nextTick();

    host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-actions__item')[1].click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('文件排序');
    expect(host.querySelector('.mobile-cloud-sort__option.is-selected')?.textContent).toContain('名称 A–Z');

    host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-sort__option')[1].click();
    expect(onSort).toHaveBeenCalledWith('createTime:asc');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('新建页先返回文件夹管理，再返回操作列表；抽屉关闭动作直接关闭', async () => {
    const onOpenChange = vi.fn();
    const host = mountDrawer({ 'onUpdate:open': onOpenChange });
    await nextTick();

    host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-actions__item')[0].click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__create')?.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.mobile-cloud-actions__back')?.click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('文件夹管理');
    host.querySelector<HTMLButtonElement>('.mobile-cloud-actions__back')?.click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('云空间操作');
    expect(onOpenChange).not.toHaveBeenCalled();

    host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-actions__item')[0].click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__create')?.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.drawer-close-control')?.click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('没有已有文件夹时仍可进入文件夹管理并新建', async () => {
    const host = mountDrawer();
    await nextTick();

    host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-actions__item')[0].click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('文件夹管理');
    expect(host.querySelector('.mobile-folder-manager__empty')?.textContent).toContain('还没有文件夹');

    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__create')?.click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('新建文件夹');
  });

  it('管理文件夹页标记当前目录，并在同一抽屉内完成重命名入口和删除请求', async () => {
    const onRenameFolder = vi.fn((_folder: { id: string; name: string }, done: (success: boolean) => void) =>
      done(true),
    );
    const onDeleteFolder = vi.fn();
    const onClearFolderFiles = vi.fn();
    const host = mountDrawer({
      folders: [
        { id: 'folder-1', name: 'iCloud' },
        { id: 'folder-2', name: '项目' },
      ],
      currentFolderId: 'folder-1',
      onRenameFolder,
      onDeleteFolder,
      onClearFolderFiles,
    });
    await nextTick();

    host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-actions__item')[0].click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('文件夹管理');
    expect(host.querySelector('.mobile-folder-manager__create')).not.toBeNull();
    expect(host.querySelectorAll('.mobile-folder-manager__row')).toHaveLength(2);
    expect(host.querySelector('.mobile-folder-manager__row.is-current')?.textContent).toContain('当前');
    expect(host.querySelector('.action-menu-stub')?.getAttribute('data-z-index')).toBe('800');

    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__action')?.click();
    await nextTick();
    [...document.querySelectorAll<HTMLButtonElement>('.b-action-menu__item')]
      .find((button) => button.textContent?.includes('重命名'))
      ?.click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('重命名文件夹');
    const input = host.querySelector<HTMLInputElement>('.b-input');
    if (!input) throw new Error('rename input not found');
    expect(input.value).toBe('iCloud');
    input.value = '工作资料';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    host.querySelector<HTMLButtonElement>('.mobile-folder-form__button.primary_btn')?.click();
    await nextTick();
    expect(onRenameFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'folder-1', name: '工作资料', parentId: null, depth: 1 }),
      expect.any(Function),
    );
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('文件夹管理');

    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__action')?.click();
    await nextTick();
    [...document.querySelectorAll<HTMLButtonElement>('.b-action-menu__item')]
      .find((button) => button.textContent?.includes('删除目录内全部文件'))
      ?.click();
    expect(onClearFolderFiles).toHaveBeenCalledWith(expect.objectContaining({ id: 'folder-1', name: 'iCloud' }));

    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__action')?.click();
    await nextTick();
    [...document.querySelectorAll<HTMLButtonElement>('.b-action-menu__item')]
      .find((button) => button.textContent === '删除')
      ?.click();
    expect(onDeleteFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'folder-1', name: 'iCloud' }));
  });

  it('在文件夹操作中创建子级并发出移动请求', async () => {
    const onCreateFolder = vi.fn();
    const onMoveFolder = vi.fn();
    const host = mountDrawer({
      folders: [
        { id: 'folder-1', name: '工作', parentId: null, depth: 1, sort: 0 },
        { id: 'folder-2', name: '周报', parentId: 'folder-1', depth: 2, sort: 0 },
      ],
      onCreateFolder,
      onMoveFolder,
    });
    await nextTick();
    host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-actions__item')[0].click();
    await nextTick();

    expect(host.querySelectorAll('.mobile-folder-manager__row')).toHaveLength(2);
    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__action')?.click();
    await nextTick();
    await nextTick();
    const createChildAction = [...document.querySelectorAll<HTMLButtonElement>('.b-action-menu__item')].find((button) =>
      button.textContent?.includes('新建子文件夹'),
    );
    expect(createChildAction).toBeTruthy();
    expect(createChildAction?.disabled).toBe(false);
    createChildAction?.click();
    await nextTick();
    expect(host.textContent).toContain('将在“工作”下创建子文件夹');

    const input = host.querySelector<HTMLInputElement>('.b-input');
    if (!input) throw new Error('child folder input not found');
    input.value = '季度';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    host.querySelector<HTMLButtonElement>('.mobile-folder-form__button.primary_btn')?.click();
    expect(onCreateFolder).toHaveBeenCalledWith('季度', 'folder-1');

    host.querySelector<HTMLButtonElement>('.mobile-cloud-actions__back')?.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__action')?.click();
    await nextTick();
    [...document.querySelectorAll<HTMLButtonElement>('.b-action-menu__item')]
      .find((button) => button.textContent?.includes('移动文件夹'))
      ?.click();
    expect(onMoveFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'folder-1', fullPath: '工作' }));
  });
});
