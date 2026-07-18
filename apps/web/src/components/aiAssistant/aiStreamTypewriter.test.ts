import { describe, expect, it } from 'vitest';
import { createAiStreamTypewriter, getAiStreamTypingBatchSize, splitAiStreamTypingBatch } from './aiStreamTypewriter';

function createManualFrameScheduler() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  return {
    schedule(callback: () => void) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id: number) {
      callbacks.delete(id);
    },
    runNext() {
      const next = callbacks.entries().next().value as [number, () => void] | undefined;
      if (!next) return false;
      callbacks.delete(next[0]);
      next[1]();
      return true;
    },
  };
}

describe('aiStreamTypewriter', () => {
  it('积压越多时逐帧追赶，但保留可见的打字过程', () => {
    expect(getAiStreamTypingBatchSize(0)).toBe(0);
    expect(getAiStreamTypingBatchSize(3)).toBe(1);
    expect(getAiStreamTypingBatchSize(24)).toBe(2);
    expect(getAiStreamTypingBatchSize(240)).toBe(5);
    expect(getAiStreamTypingBatchSize(5000)).toBe(12);
  });

  it('不会拆坏 emoji 等 Unicode 字符', () => {
    expect(splitAiStreamTypingBatch('你🙂好', 2)).toEqual(['你🙂', '好']);
  });

  it('把整段网络分片分多帧显示，并在完全显示后完成 drain', async () => {
    const scheduler = createManualFrameScheduler();
    let visible = '';
    const typewriter = createAiStreamTypewriter({
      onText: (text) => {
        visible += text;
      },
      scheduleFrame: scheduler.schedule,
      cancelFrame: scheduler.cancel,
    });

    typewriter.enqueue('这是一个需要平滑显示的网络分片');
    const drained = typewriter.drain();
    expect(scheduler.runNext()).toBe(true);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible).not.toBe('这是一个需要平滑显示的网络分片');
    while (scheduler.runNext()) {
      // 手动推进所有绘制帧。
    }
    await drained;
    expect(visible).toBe('这是一个需要平滑显示的网络分片');
  });

  it('取消后丢弃尚未显示的缓冲并立即结束 drain', async () => {
    const scheduler = createManualFrameScheduler();
    let visible = '';
    const typewriter = createAiStreamTypewriter({
      onText: (text) => {
        visible += text;
      },
      scheduleFrame: scheduler.schedule,
      cancelFrame: scheduler.cancel,
    });

    typewriter.enqueue('尚未显示的内容');
    const drained = typewriter.drain();
    typewriter.cancel();
    await drained;
    expect(visible).toBe('');
    expect(scheduler.runNext()).toBe(false);
  });

  it('页面不可见时直接排空，不依赖可能被暂停的动画帧', async () => {
    const scheduler = createManualFrameScheduler();
    let visible = '';
    const typewriter = createAiStreamTypewriter({
      onText: (text) => {
        visible += text;
      },
      scheduleFrame: scheduler.schedule,
      cancelFrame: scheduler.cancel,
      shouldFlushImmediately: () => true,
    });

    typewriter.enqueue('后台页直接完整显示');
    await typewriter.drain();
    expect(visible).toBe('后台页直接完整显示');
    expect(scheduler.runNext()).toBe(false);
  });
});
