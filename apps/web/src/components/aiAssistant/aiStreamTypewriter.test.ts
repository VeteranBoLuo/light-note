import { describe, expect, it } from 'vitest';
import { nextTick, ref, watchEffect } from 'vue';
import {
  appendAiStreamMessageContent,
  createAiStreamTypewriter,
  getAiStreamTypingBatchSize,
  splitAiStreamTypingBatch,
} from './aiStreamTypewriter';

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
  it('逐帧修改响应式数组中的消息并触发每次视图更新', async () => {
    const rawMessage = { role: 'assistant', content: '' };
    const messages = ref([rawMessage]);
    const rendered: string[] = [];
    const stop = watchEffect(() => rendered.push(messages.value[0].content));

    expect(appendAiStreamMessageContent(messages.value, 0, '你')).toBe(true);
    await nextTick();
    expect(appendAiStreamMessageContent(messages.value, 0, '好')).toBe(true);
    await nextTick();

    expect(rendered).toEqual(['', '你', '你好']);
    stop();
  });

  it('不会把流式正文写入用户消息或无效位置', () => {
    expect(appendAiStreamMessageContent([{ role: 'user', content: '' }], 0, '误写')).toBe(false);
    expect(appendAiStreamMessageContent([], 0, '误写')).toBe(false);
  });

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

  it('即使网络一次返回整段正文，Vue 也会跨多帧连续渲染而不是结束时整段出现', async () => {
    const scheduler = createManualFrameScheduler();
    const messages = ref([{ role: 'assistant', content: '' }]);
    const rendered: string[] = [];
    const stop = watchEffect(() => rendered.push(messages.value[0].content));
    const typewriter = createAiStreamTypewriter({
      onText: (text) => appendAiStreamMessageContent(messages.value, 0, text),
      scheduleFrame: scheduler.schedule,
      cancelFrame: scheduler.cancel,
    });

    const completeText = '一次返回的完整答案也必须呈现为连续增长的打字过程';
    typewriter.enqueue(completeText);
    const drained = typewriter.drain();
    while (scheduler.runNext()) await nextTick();
    await drained;

    expect(rendered.length).toBeGreaterThan(4);
    expect(rendered[1]).not.toBe(completeText);
    expect(rendered.at(-1)).toBe(completeText);
    expect(rendered.every((content, index) => index === 0 || content.startsWith(rendered[index - 1]))).toBe(true);
    stop();
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
