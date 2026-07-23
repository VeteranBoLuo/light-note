import { describe, expect, it, vi } from 'vitest';
import { createQuickQuestionDispatcher } from './quickQuestionDispatch';

describe('createQuickQuestionDispatcher', () => {
  it('推荐问题不经过输入框，直接把规范化文本交给发送流程', async () => {
    const send = vi.fn();
    const dispatch = createQuickQuestionDispatcher({
      isBusy: () => false,
      send,
    });

    await expect(dispatch('  最近加了哪些书签？  ')).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith('最近加了哪些书签？');
  });

  it('正在回答或问题为空时不发送', async () => {
    const send = vi.fn();
    const busyDispatch = createQuickQuestionDispatcher({
      isBusy: () => true,
      send,
    });

    await expect(busyDispatch('我有哪些笔记？')).resolves.toBe(false);
    await expect(busyDispatch('   ')).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('快速重复点击同一推荐问题只发送一次', async () => {
    let releaseSend: (() => void) | undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const send = vi.fn();
    const dispatch = createQuickQuestionDispatcher({
      isBusy: () => false,
      send: async () => {
        await sendGate;
        send();
      },
    });

    const first = dispatch('生成我的本周回顾');
    await expect(dispatch('生成我的本周回顾')).resolves.toBe(false);
    releaseSend?.();
    await expect(first).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
