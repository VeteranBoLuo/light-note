import { describe, expect, it } from 'vitest';
import { acquireTopLayerEscapeLock, hasTopLayerEscapeLock, shouldIgnoreBackgroundEscape } from './topLayerEscape';

function escapeEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    defaultPrevented: false,
    isComposing: false,
    keyCode: 27,
    repeat: false,
    ...overrides,
  } as KeyboardEvent;
}

describe('topLayerEscape', () => {
  it('顶层预览存在时阻止背景抽屉响应，释放后恢复', () => {
    const release = acquireTopLayerEscapeLock();
    try {
      expect(hasTopLayerEscapeLock()).toBe(true);
      expect(shouldIgnoreBackgroundEscape(escapeEvent())).toBe(true);
    } finally {
      release();
    }

    expect(hasTopLayerEscapeLock()).toBe(false);
    expect(shouldIgnoreBackgroundEscape(escapeEvent())).toBe(false);
  });

  it('多层预览逐层释放，清理函数重复调用也不会误解锁', () => {
    const releaseFirst = acquireTopLayerEscapeLock();
    const releaseSecond = acquireTopLayerEscapeLock();

    releaseFirst();
    releaseFirst();
    expect(hasTopLayerEscapeLock()).toBe(true);

    releaseSecond();
    expect(hasTopLayerEscapeLock()).toBe(false);
  });

  it.each([{ defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { repeat: true }])(
    '忽略已处理、输入法或长按重复事件 %#',
    (overrides) => {
      expect(shouldIgnoreBackgroundEscape(escapeEvent(overrides))).toBe(true);
    },
  );
});
