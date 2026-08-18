import { describe, expect, it } from 'vitest';
import { runOrderedBatch } from './orderedBatch';

describe('runOrderedBatch', () => {
  it('限制并发数并让结果保持输入顺序', async () => {
    let active = 0;
    let maxActive = 0;
    const results = await runOrderedBatch(
      [30, 5, 20, 1],
      async (delay, index) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, delay));
        active -= 1;
        return `image-${index}`;
      },
      2,
    );

    expect(maxActive).toBe(2);
    expect(results).toEqual([
      { status: 'fulfilled', value: 'image-0' },
      { status: 'fulfilled', value: 'image-1' },
      { status: 'fulfilled', value: 'image-2' },
      { status: 'fulfilled', value: 'image-3' },
    ]);
  });

  it('保留单项失败并继续处理同批次的其他任务', async () => {
    const results = await runOrderedBatch([1, 2, 3], async (value) => {
      if (value === 2) throw new Error('upload failed');
      return value * 10;
    });

    expect(results[0]).toEqual({ status: 'fulfilled', value: 10 });
    expect(results[1]?.status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 30 });
  });
});
