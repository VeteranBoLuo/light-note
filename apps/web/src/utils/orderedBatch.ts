export type OrderedBatchResult<T> = { status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown };

/**
 * 以固定并发数执行异步任务，同时让结果数组保持输入顺序。
 * 单项失败不会中断剩余任务，调用方可决定是否保留已成功的结果。
 */
export async function runOrderedBatch<TInput, TOutput>(
  items: readonly TInput[],
  worker: (item: TInput, index: number) => Promise<TOutput>,
  concurrency = 3,
): Promise<Array<OrderedBatchResult<TOutput>>> {
  if (!items.length) return [];

  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1));
  const results = new Array<OrderedBatchResult<TOutput>>(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}
