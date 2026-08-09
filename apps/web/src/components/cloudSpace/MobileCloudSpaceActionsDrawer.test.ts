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

let cleanup: (() => void) | undefined;

function mountDrawer(props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: {
      'zh-CN': {
        common: { back: '返回', close: '关闭', cancel: '取消' },
        cloudSpace: {
          mobileActionsTitle: '云空间操作',
          newFolder: '新建文件夹',
          manageFolders: '文件夹管理',
          manageFoldersDescription: '新建、重命名或删除文件夹',
          noFoldersToManage: '还没有文件夹，可以从上方新建',
          batchAction: '批量操作',
          exitBatch: '退出批量',
          batchActionDescription: '选择多个文件后移动、下载或删除',
          folderName: '文件夹名称',
          folderNamePlaceholder: '例如：项目资料',
          folderNameHint: '最多 255 个字符',
          folderNameRequired: '请输入文件夹名称',
          createAndEnterFolder: '创建并进入',
          currentFolder: '当前',
          renameFolder: '重命名文件夹',
          renameFolderAction: '重命名“{name}”',
          saveFolderName: '保存修改',
          deleteFolderAction: '删除“{name}”',
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
    expect(actions).toHaveLength(2);
    expect(host.textContent).toContain('新建、重命名或删除文件夹');

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
    expect(onCreateFolder).toHaveBeenCalledWith('项目资料');
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

    actions[1].click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onBatch).toHaveBeenCalledOnce();
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
    const host = mountDrawer({
      folders: [
        { id: 'folder-1', name: 'iCloud' },
        { id: 'folder-2', name: '项目' },
      ],
      currentFolderId: 'folder-1',
      onRenameFolder,
      onDeleteFolder,
    });
    await nextTick();

    host.querySelectorAll<HTMLButtonElement>('.mobile-cloud-actions__item')[0].click();
    await nextTick();
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('文件夹管理');
    expect(host.querySelector('.mobile-folder-manager__create')).not.toBeNull();
    expect(host.querySelectorAll('.mobile-folder-manager__row')).toHaveLength(2);
    expect(host.querySelector('.mobile-folder-manager__row.is-current')?.textContent).toContain('当前');

    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__action')?.click();
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
    expect(onRenameFolder).toHaveBeenCalledWith({ id: 'folder-1', name: '工作资料' }, expect.any(Function));
    expect(host.querySelector('.drawer-stub')?.getAttribute('data-title')).toBe('文件夹管理');

    host.querySelector<HTMLButtonElement>('.mobile-folder-manager__action--danger')?.click();
    expect(onDeleteFolder).toHaveBeenCalledWith({ id: 'folder-1', name: 'iCloud' });
  });
});
