import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BMessageContainer.vue', () => ({
  default: {
    render: () => null,
  },
}));

import message from './BMessage';
import { LEAVE_ANIMATION_MS, messageState, removeMessage } from './messageState';

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
    vi.useFakeTimers();
    setMobileViewport(true);
    const onClose = vi.fn();
    message.info('可以点击关闭', 0, onClose);
    const id = messageState.messages[0]?.id;
    expect(id).toBeTypeOf('number');

    removeMessage(id as number);
    removeMessage(id as number);
    // 离场期间节点保留在 state 里,纯 CSS 才有机会播完淡出;重复调用不重复计时
    expect(messageState.messages).toHaveLength(1);
    expect(messageState.messages[0]?.leaving).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(LEAVE_ANIMATION_MS);
    expect(messageState.messages).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not merge a new message into one that is already leaving', () => {
    vi.useFakeTimers();
    setMobileViewport(true);
    message.success('删除成功');
    const first = messageState.messages[0]?.id as number;
    removeMessage(first);

    // 上一条正在淡出时又触发同样的提示,必须真的新建一条,否则这次操作没有反馈
    message.success('删除成功');
    expect(messageState.messages.filter((item) => !item.leaving)).toHaveLength(1);

    vi.advanceTimersByTime(LEAVE_ANIMATION_MS);
    expect(messageState.messages).toHaveLength(1);
    expect(messageState.messages[0]?.leaving).toBeFalsy();
  });
});
