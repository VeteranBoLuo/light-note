import { describe, expect, it } from 'vitest';
import { runConcurrentExtensionQueue, summarizeExtensionUploads } from './uploadQueue';

describe('浏览器插件文件队列', () => {
  it('最多并发三个任务且不会漏掉后续任务', async () => {
    const items = Array.from({ length: 8 }, (_, index) => index);
    let active = 0;
    let maxActive = 0;
    const completed: number[] = [];
    await runConcurrentExtensionQueue(items, 3, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      completed.push(item);
      active -= 1;
    });
    expect(maxActive).toBe(3);
    expect(completed.sort((a, b) => a - b)).toEqual(items);
  });

  it('区分完整成功、部分失败与仍在上传的状态', () => {
    expect(summarizeExtensionUploads([{ status: 'success' }, { status: 'success' }])).toEqual({
      success: 2,
      failed: 0,
      pending: 0,
      complete: true,
    });
    expect(
      summarizeExtensionUploads([{ status: 'success' }, { status: 'error' }, { status: 'uploading' }]),
    ).toEqual({ success: 1, failed: 1, pending: 1, complete: false });
  });
});
