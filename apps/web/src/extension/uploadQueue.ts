export type ExtensionUploadTaskStatus = 'queued' | 'uploading' | 'success' | 'error' | 'cancelled';

export interface ExtensionUploadTaskLike {
  status: ExtensionUploadTaskStatus;
}

export interface ExtensionUploadSummary {
  success: number;
  failed: number;
  pending: number;
  complete: boolean;
}

export async function runConcurrentExtensionQueue<T>(
  queue: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), queue.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      if (item !== undefined) await worker(item);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}

export function summarizeExtensionUploads(tasks: ExtensionUploadTaskLike[]): ExtensionUploadSummary {
  const success = tasks.filter((task) => task.status === 'success').length;
  const failed = tasks.filter((task) => task.status === 'error' || task.status === 'cancelled').length;
  const pending = tasks.length - success - failed;
  return {
    success,
    failed,
    pending,
    complete: tasks.length > 0 && success === tasks.length,
  };
}
