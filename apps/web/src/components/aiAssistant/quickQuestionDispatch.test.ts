import { describe, expect, it, vi } from 'vitest';
import { createQuickQuestionDispatcher } from './quickQuestionDispatch';

describe('createQuickQuestionDispatcher', () => {
  it('推荐问题写入输入区后立即发送', async () => {
    const order: string[] = [];
    const setInput = vi.fn((value: string) => order.push(`input:${value}`));
    const send = vi.fn(() => order.push('send'));
    const dispatch = createQuickQuestionDispatcher({
      isBusy: () => false,
      setInput,
      afterInputChange: async () => {
        order.push('render');
      },
      send,
    });

    await expect(dispatch('  最近加了哪些书签？  ')).resolves.toBe(true);
    expect(setInput).toHaveBeenCalledWith('最近加了哪些书签？');
    expect(send).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['input:最近加了哪些书签？', 'render', 'send']);
  });

  it('正在回答或问题为空时不发送', async () => {
    const setInput = vi.fn();
    const send = vi.fn();
    const busyDispatch = createQuickQuestionDispatcher({
      isBusy: () => true,
      setInput,
      afterInputChange: async () => {},
      send,
    });

    await expect(busyDispatch('我有哪些笔记？')).resolves.toBe(false);
    await expect(busyDispatch('   ')).resolves.toBe(false);
    expect(setInput).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('快速重复点击同一推荐问题只发送一次', async () => {
    let releaseRender: (() => void) | undefined;
    const renderGate = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    const send = vi.fn();
    const dispatch = createQuickQuestionDispatcher({
      isBusy: () => false,
      setInput: vi.fn(),
      afterInputChange: () => renderGate,
      send,
    });

    const first = dispatch('生成我的本周回顾');
    await expect(dispatch('生成我的本周回顾')).resolves.toBe(false);
    releaseRender?.();
    await expect(first).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
