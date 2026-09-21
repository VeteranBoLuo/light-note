import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import Toast from './TodoUndoToast.vue';
import zh from '@/i18n/locales/zh-CN';
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});
function mount() {
  vi.useFakeTimers();
  const action = ref({ kind: 'complete' as const, ids: ['one'] });
  const loading = ref(false);
  const dismiss = vi.fn();
  const undo = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(Toast, { action: action.value, loading: loading.value, mobile: false, onDismiss: dismiss, onUndo: undo }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.component('OriginalIcon', { render: () => h('span') });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, action, loading, dismiss, undo };
}
it('悬停暂停倒计时，离开后沿用剩余时间', async () => {
  const { host, dismiss } = mount();
  vi.advanceTimersByTime(4000);
  host.firstElementChild!.dispatchEvent(new MouseEvent('mouseenter'));
  await nextTick();
  vi.advanceTimersByTime(20000);
  expect(dismiss).not.toHaveBeenCalled();
  host.firstElementChild!.dispatchEvent(new MouseEvent('mouseleave'));
  await nextTick();
  vi.advanceTimersByTime(5999);
  expect(dismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(dismiss).toHaveBeenCalledTimes(1);
});
it('新一组操作更新数量并重置时限，撤销请求期间不消失', async () => {
  const { host, action, loading, dismiss, undo } = mount();
  vi.advanceTimersByTime(9000);
  action.value = { kind: 'complete', ids: ['one', 'two'] };
  await nextTick();
  expect(host.textContent).toContain('已完成 2 项待办');
  vi.advanceTimersByTime(2000);
  expect(dismiss).not.toHaveBeenCalled();
  host.querySelector<HTMLButtonElement>('.todo-undo-toast__undo')!.click();
  expect(undo).toHaveBeenCalledOnce();
  loading.value = true;
  await nextTick();
  vi.advanceTimersByTime(20000);
  expect(dismiss).not.toHaveBeenCalled();
  loading.value = false;
  await nextTick();
  vi.advanceTimersByTime(8000);
  expect(dismiss).toHaveBeenCalledOnce();
});
it('键盘聚焦暂停，到关闭按钮时仍暂停，关闭可立即消失', async () => {
  const { host, dismiss } = mount();
  host.querySelector<HTMLButtonElement>('.todo-undo-toast__undo')!.focus();
  await nextTick();
  vi.advanceTimersByTime(11000);
  expect(dismiss).not.toHaveBeenCalled();
  const close = host.querySelector<HTMLButtonElement>('.todo-undo-toast__close')!;
  close.focus();
  await nextTick();
  vi.advanceTimersByTime(11000);
  expect(dismiss).not.toHaveBeenCalled();
  close.click();
  expect(dismiss).toHaveBeenCalledOnce();
});
