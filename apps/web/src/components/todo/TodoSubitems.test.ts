import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import useTodoStore from '@/store/todo';
import useUserStore from '@/store/useUser';
import TodoSubitems from './TodoSubitems.vue';
import TodoSubitemsHint from './TodoSubitemsHint.vue';
import type { TodoItem } from '@/api/todoApi';
const push = vi.fn();
vi.mock('vue-router', async (original) => ({
  ...(await original<typeof import('vue-router')>()),
  useRouter: () => ({ push }),
}));
const disposals: Array<() => void> = [];
const item = {
  id: 'test',
  status: 'pending',
  checklist: Array.from({ length: 7 }, (_, i) => ({ id: String(i), text: `Step ${i}`, done: false })),
} as TodoItem;
function mount(hint = false, detail = false) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const user = useUserStore();
  user.id = 'owner-a';
  const store = useTodoStore();
  const hasSubitems = ref(true);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => (hint ? h(TodoSubitemsHint, { hasSubitems: hasSubitems.value }) : h(TodoSubitems, { item, detail })),
  });
  app.use(pinia).use(
    createI18n({
      legacy: false,
      locale: 'en',
      missingWarn: false,
      fallbackWarn: false,
      messages: {
        en: {
          common: { close: 'Close' },
          todoWorkspace: {
            subitems: 'Subitems',
            subitemsHint: 'Tip',
            subitemsSettings: 'Settings',
            dismissSubitemsHint: 'Dismiss',
            moreSubitems: 'More {count}',
            lessSubitems: 'Less',
            editSubitems: 'Edit',
          },
        },
      },
    }),
  );
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, user, store, hasSubitems };
}
beforeEach(() => {
  localStorage.clear();
  push.mockClear();
});
afterEach(() => {
  disposals.splice(0).forEach((fn) => fn());
  vi.restoreAllMocks();
});
describe('Subitem default and session override', () => {
  it('defaults closed, follows account preference and retains an explicit collapse across data changes', async () => {
    const { host, user, store } = mount();
    expect(host.querySelector('[role="group"]')).toBeNull();
    user.preferences.todoSubitemsExpanded = true;
    await nextTick();
    expect(host.querySelectorAll('.todo-subitems__row')).toHaveLength(5);
    host.querySelector<HTMLButtonElement>('.todo-subitems__toggle')!.click();
    await nextTick();
    expect(store.expandedSubitems.test).toBe(false);
    user.preferences = { ...user.preferences };
    await nextTick();
    expect(host.querySelector('[role="group"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('.todo-subitems__toggle')!.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('footer button')!.click();
    await nextTick();
    expect(host.querySelectorAll('.todo-subitems__row')).toHaveLength(7);
  });
  it('detail shows all subitems regardless of default', () => {
    const { host } = mount(false, true);
    expect(host.querySelectorAll('.todo-subitems__row')).toHaveLength(7);
    expect(host.querySelector('.todo-subitems__toggle')).toBeNull();
  });
});
describe('Subitem settings tip', () => {
  it('requires subitems and a disabled default; navigation does not enable or dismiss it', async () => {
    const { host, user, hasSubitems } = mount(true);
    host.querySelector<HTMLButtonElement>('.todo-subitems-hint__settings')!.click();
    expect(push).toHaveBeenCalledWith({ path: '/settings', query: { section: 'general' } });
    expect(user.preferences.todoSubitemsExpanded).toBe(false);
    expect(localStorage.length).toBe(0);
    user.preferences.todoSubitemsExpanded = true;
    await nextTick();
    expect(host.querySelector('aside')).toBeNull();
    user.preferences.todoSubitemsExpanded = false;
    hasSubitems.value = false;
    await nextTick();
    expect(host.querySelector('aside')).toBeNull();
  });
  it('dismisses per account and survives remount without changing the default', async () => {
    const { host, user } = mount(true);
    host.querySelector<HTMLButtonElement>('.todo-subitems-hint__close')!.click();
    await nextTick();
    expect(host.querySelector('aside')).toBeNull();
    expect(user.preferences.todoSubitemsExpanded).toBe(false);
    user.id = 'owner-b';
    await nextTick();
    expect(host.querySelector('aside')).not.toBeNull();
    user.id = 'owner-a';
    await nextTick();
    expect(host.querySelector('aside')).toBeNull();
    expect(mount(true).host.querySelector('aside')).toBeNull();
  });
  it('still dismisses when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { host } = mount(true);
    host.querySelector<HTMLButtonElement>('.todo-subitems-hint__close')!.click();
    await nextTick();
    expect(host.querySelector('aside')).toBeNull();
  });
});
