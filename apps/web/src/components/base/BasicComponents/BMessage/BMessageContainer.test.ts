import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import BMessageContainer from './BMessageContainer.vue';
import { clearMessages, messageState } from './messageState';

vi.mock('@/i18n', () => ({ default: { global: { t: (key: string) => (key === 'common.close' ? '关闭' : key) } } }));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  clearMessages();
});

it('只有 closable 的消息显示关闭按钮，点击后进入离场', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(BMessageContainer) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  messageState.messages.push(
    { id: 1, type: 'info', content: '普通提示', duration: 3 },
    { id: 2, type: 'info', content: '需要读完的提示', duration: 10, closable: true },
  );
  await nextTick();
  const buttons = document.querySelectorAll<HTMLButtonElement>('.b-message-close');
  expect(buttons).toHaveLength(1);
  expect(buttons[0].getAttribute('aria-label')).toBe('关闭');
  buttons[0].click();
  expect(messageState.messages.find((item) => item.id === 2)?.leaving).toBe(true);
  expect(messageState.messages.find((item) => item.id === 1)?.leaving).toBeFalsy();
});
