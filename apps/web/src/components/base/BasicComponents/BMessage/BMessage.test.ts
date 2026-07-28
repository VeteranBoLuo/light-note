import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BMessageContainer.vue', () => ({
  default: {
    render: () => null,
  },
}));

import message from './BMessage';
import { messageState, removeMessage } from './messageState';

const originalMatchMedia = window.matchMedia;

function setMobileViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

afterEach(() => {
  message.destroy();
  vi.useRealTimers();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  });
  vi.restoreAllMocks();
});

describe('BMessage mobile behavior', () => {
  it('uses compact mobile durations without changing desktop defaults', () => {
    setMobileViewport(true);
    message.success('保存成功');
    expect(messageState.messages[0]?.duration).toBe(1.8);
    message.destroy();

    setMobileViewport(false);
    message.success('保存成功');
    expect(messageState.messages[0]?.duration).toBe(3);
  });

  it('merges repeated mobile messages while keeping desktop messages independent', () => {
    setMobileViewport(true);
    message.success('删除成功');
    message.success('删除成功');
    expect(messageState.messages).toHaveLength(1);
    message.destroy();

    setMobileViewport(false);
    message.success('删除成功');
    message.success('删除成功');
    expect(messageState.messages).toHaveLength(2);
  });

  it('supports dismissing a message and only invokes onClose once', () => {
    setMobileViewport(true);
    const onClose = vi.fn();
    message.info('可以点击关闭', 0, onClose);
    const id = messageState.messages[0]?.id;
    expect(id).toBeTypeOf('number');

    removeMessage(id as number);
    removeMessage(id as number);
    expect(messageState.messages).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
