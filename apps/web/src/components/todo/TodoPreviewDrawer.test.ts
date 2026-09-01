import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import type { TodoItem } from '@/api/todoApi';
import zhCN from '@/i18n/locales/zh-CN';
import TodoPreviewDrawer from './TodoPreviewDrawer.vue';

const routerPush = vi.fn();
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: routerPush }),
}));

const editorModalSource = readFileSync(resolve(process.cwd(), 'src/components/todo/TodoEditorModal.vue'), 'utf8');
const previewSource = readFileSync(resolve(process.cwd(), 'src/components/todo/TodoPreviewDrawer.vue'), 'utf8');
let cleanup: (() => void) | undefined;

const todo: TodoItem = {
  id: 'todo-preview-1',
  title: '发布待办详情预览',
  description: '先查看完整信息，再决定是否编辑。',
  checklist: [{ id: 'check-1', text: '检查关联资料', done: false }],
  priority: 2,
  status: 'pending',
  startAt: '2026-08-20 09:00:00',
  dueAt: '2026-08-20 18:00:00',
  reminder: { mode: 'once_per_instance', channels: ['in_app'], nextAt: '2026-08-20 17:00:00' },
  createdAt: '2026-08-19 08:00:00',
  updatedAt: '2026-08-20 07:30:00',
  resourceRefs: [
    {
      type: 'note',
      id: 'note-preview-1',
      title: '开发文档',
      snapshotTitle: '开发文档',
      available: true,
    },
  ],
};

function mountPreview() {
  const visible = ref(true);
  const deleting = ref(false);
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onClosed = vi.fn();
  const onUpdateChecklist = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(TodoPreviewDrawer, {
          item: todo,
          visible: visible.value,
          deleting: deleting.value,
          'onUpdate:visible': (value: boolean) => (visible.value = value),
          onEdit,
          onDelete,
          onClosed,
          onUpdateChecklist,
        });
    },
  });
  app.component('OriginalIcon', { render: () => h('span', { 'aria-hidden': 'true' }) });
  app.directive('auto-scrollbar', {});
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
    document.querySelectorAll('.b-drawer-wrapper').forEach((element) => element.remove());
  };
  return { visible, deleting, onEdit, onDelete, onClosed, onUpdateChecklist };
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  routerPush.mockReset();
});

describe('TodoPreviewDrawer', () => {
  it('用独立详情布局展示说明、清单、时间提醒和关联资料', async () => {
    mountPreview();
    await nextTick();

    const drawer = document.querySelector('.todo-preview')!;
    expect(drawer.querySelector('h2')?.textContent).toBe(todo.title);
    expect(drawer.querySelector('.todo-preview__description')?.textContent).toContain(todo.description);
    expect(drawer.querySelector('.todo-preview__checklist')?.textContent).toContain('检查关联资料');
    expect(drawer.querySelector('.todo-preview__schedule')?.textContent).toContain('下一次提醒');
    expect(drawer.querySelector('.todo-resource-link__title')?.textContent).toBe('开发文档');
  });

  it('预览内清单可快速勾选，删除与编辑使用带无障碍名称的纯图标按钮', async () => {
    const { visible, onEdit, onDelete, onUpdateChecklist } = mountPreview();
    await nextTick();

    document.querySelector<HTMLElement>('.todo-preview__checklist-items .b-checkbox')!.click();
    expect(onUpdateChecklist).toHaveBeenCalledWith(todo, [{ ...todo.checklist[0], done: true }]);

    const deleteButton = document.querySelector<HTMLButtonElement>('.todo-preview__delete')!;
    const editButton = document.querySelector<HTMLButtonElement>('.todo-preview__edit')!;
    expect(deleteButton.getAttribute('aria-label')).toBe('删除待办');
    expect(editButton.getAttribute('aria-label')).toBe('编辑待办');
    expect(deleteButton.textContent?.trim()).toBe('');
    expect(editButton.textContent?.trim()).toBe('');
    expect(previewSource).toContain('mobile-header-side-width="96px"');

    deleteButton.click();
    expect(onDelete).toHaveBeenCalledWith(todo);
    expect(visible.value).toBe(true);

    editButton.click();
    await vi.waitFor(() => expect(onEdit).toHaveBeenCalledWith(todo));
    const editedItem = onEdit.mock.calls[0]?.[0] as TodoItem;
    expect(editedItem).not.toBe(todo);
    expect(editedItem.checklist).not.toBe(todo.checklist);
    expect(visible.value).toBe(false);
  });

  it('删除进行中只在删除按钮显示 loading，并禁用两个写操作', async () => {
    const { deleting } = mountPreview();
    await nextTick();

    deleting.value = true;
    await nextTick();

    const deleteButton = document.querySelector<HTMLButtonElement>('.todo-preview__delete')!;
    const editButton = document.querySelector<HTMLButtonElement>('.todo-preview__edit')!;
    expect(deleteButton.disabled).toBe(true);
    expect(deleteButton.querySelector('.btn-spinner')).not.toBeNull();
    expect(editButton.disabled).toBe(true);
  });

  it('点击详情抽屉外的遮罩会直接关闭预览', async () => {
    const { visible, onClosed } = mountPreview();
    await nextTick();

    document.querySelector<HTMLElement>('.b-drawer-mask')!.click();
    await nextTick();

    expect(visible.value).toBe(false);
    expect(onClosed).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledOnce());
  });

  it('预览与编辑器内的关联资料都接入统一路由，并先安全关闭当前抽屉', async () => {
    mountPreview();
    await nextTick();

    document.querySelector<HTMLButtonElement>('.todo-resource-link__open')!.click();
    await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith({ path: '/noteLibrary/note-preview-1' }));

    expect(editorModalSource).toContain('@open-resource="openResourceRef"');
    expect(editorModalSource).toContain('closeCurrentMobileOverlayThen');
    expect(editorModalSource).toContain('resolveResourceRoute(resource)');
  });
});
