import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import TodoListAssociations from './TodoListAssociations.vue';
import useUserStore from '@/store/useUser';
import zhCN from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('@/api/todoApi', async (original) => ({
  ...(await original<typeof import('@/api/todoApi')>()),
  getTodoWorkspace: mocks.read,
  organizeTodos: mocks.write,
}));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    setup:
      (_: unknown, { slots }: any) =>
      () =>
        slots.default?.(),
  },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { error: vi.fn() } }));
let cleanup: () => void;
const row = { id: 'one', title: '本次任务', status: 'pending', listId: 'target', checklist: [], priority: 1 };
const result = (items: any[]) => ({ status: 200, data: { items, nextCursor: null } });
const settle = async () => {
  for (let i = 0; i < 5; i++) await nextTick();
};
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const list = ref({ id: 'target', name: '开发', color: '#6554ed', pendingTotal: 1, completedTotal: 0 });
  const changed = vi.fn();
  const app = createApp({
    render: () => h(TodoListAssociations, { open: true, list: list.value, onChanged: changed }),
  });
  const pinia = createPinia();
  app.use(pinia);
  const user = useUserStore(pinia);
  user.id = 'owner';
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, list, user, changed };
}
afterEach(() => {
  cleanup?.();
  mocks.read.mockReset();
  mocks.write.mockReset();
});
describe('清单关联管理', () => {
  it('取消只更新显式实例归属，不删除待办，成功后移出已关联页', async () => {
    mocks.read.mockResolvedValue(result([row]));
    mocks.write.mockResolvedValue({ status: 200 });
    const { host, changed } = mount();
    await settle();
    expect(mocks.read).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', listId: 'target', limit: 30 }),
    );
    host.querySelector<HTMLButtonElement>('.todo-list-associations__row button')!.click();
    await settle();
    expect(mocks.write).toHaveBeenCalledWith({ ids: ['one'], scope: 'current', listId: null }, { silent: true });
    expect(host.textContent).not.toContain('本次任务');
    expect(changed).toHaveBeenCalledOnce();
  });
  it('关联将单次任务移入当前清单，失败保留内容供重试', async () => {
    mocks.read.mockResolvedValue(result([{ ...row, listId: null }]));
    mocks.write.mockResolvedValueOnce({ status: 500 }).mockResolvedValueOnce({ status: 200 });
    const { host, changed } = mount();
    await settle();
    host.querySelector<HTMLButtonElement>('.todo-list-associations__row button')!.click();
    await settle();
    expect(host.textContent).toContain('本次任务');
    expect(changed).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('.todo-list-associations__row button')!.click();
    await settle();
    expect(mocks.write).toHaveBeenLastCalledWith(
      { ids: ['one'], scope: 'current', listId: 'target' },
      { silent: true },
    );
    expect(host.querySelector('.todo-list-associations__row button')?.textContent).toContain('取消关联');
  });
  it('切换账号后忽略旧的关联查询响应', async () => {
    let old!: (value: any) => void;
    mocks.read.mockImplementationOnce(() => new Promise((resolve) => (old = resolve))).mockResolvedValue(result([]));
    const { host, user } = mount();
    user.id = 'another';
    await settle();
    old(result([row]));
    await settle();
    expect(host.textContent).not.toContain('本次任务');
  });
});
