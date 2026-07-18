export const AI_STREAM_TYPING_FRAME_MS = 16;

export type AiStreamFrameScheduler = (callback: () => void) => number;
export type AiStreamFrameCanceller = (frameId: number) => void;

export interface AiStreamTypewriter {
  enqueue: (text: string) => void;
  drain: () => Promise<void>;
  cancel: () => void;
}

interface CreateAiStreamTypewriterOptions {
  onText: (text: string) => void;
  scheduleFrame?: AiStreamFrameScheduler;
  cancelFrame?: AiStreamFrameCanceller;
  shouldFlushImmediately?: () => boolean;
}

export function getAiStreamTypingBatchSize(pendingLength: number): number {
  if (pendingLength <= 0) return 0;
  if (pendingLength <= 6) return 1;
  return Math.min(32, Math.max(2, Math.ceil(pendingLength / 24)));
}

/** 按 Unicode 字符截取，避免把 emoji 的代理对拆成两个损坏字符。 */
export function splitAiStreamTypingBatch(value: string, count: number): [string, string] {
  if (!value || count <= 0) return ['', value];
  let end = 0;
  let consumed = 0;
  for (const character of value) {
    end += character.length;
    consumed += 1;
    if (consumed >= count) break;
  }
  return [value.slice(0, end), value.slice(end)];
}

const defaultScheduleFrame: AiStreamFrameScheduler = (callback) => {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }
  return setTimeout(callback, AI_STREAM_TYPING_FRAME_MS) as unknown as number;
};

const defaultCancelFrame: AiStreamFrameCanceller = (frameId) => {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }
  clearTimeout(frameId);
};

/**
 * 将不规则的 SSE 网络分片缓冲成稳定的逐帧吐字。
 * 网络已经结束时 drain() 会等待屏幕把缓冲内容显示完整，避免结尾突然整段跳出。
 */
export function createAiStreamTypewriter(options: CreateAiStreamTypewriterOptions): AiStreamTypewriter {
  const scheduleFrame = options.scheduleFrame || defaultScheduleFrame;
  const cancelFrame = options.cancelFrame || defaultCancelFrame;
  let pending = '';
  let frameId: number | null = null;
  let cancelled = false;
  let drainResolvers: Array<() => void> = [];

  const resolveDrain = () => {
    if (pending || frameId !== null) return;
    const resolvers = drainResolvers;
    drainResolvers = [];
    resolvers.forEach((resolve) => resolve());
  };

  const schedule = () => {
    if (cancelled || frameId !== null || !pending) return;
    if (options.shouldFlushImmediately?.() === true) {
      tick();
      return;
    }
    frameId = scheduleFrame(tick);
  };

  const tick = () => {
    frameId = null;
    if (cancelled) {
      resolveDrain();
      return;
    }

    const flushImmediately = options.shouldFlushImmediately?.() === true;
    const batchSize = flushImmediately ? Number.MAX_SAFE_INTEGER : getAiStreamTypingBatchSize(pending.length);
    const [visible, remaining] = splitAiStreamTypingBatch(pending, batchSize);
    pending = remaining;
    if (visible) options.onText(visible);

    if (pending) schedule();
    else resolveDrain();
  };

  return {
    enqueue(text: string) {
      if (cancelled || !text) return;
      pending += text;
      schedule();
    },
    drain() {
      if (!pending && frameId === null) return Promise.resolve();
      return new Promise<void>((resolve) => {
        drainResolvers.push(resolve);
        schedule();
      });
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      pending = '';
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }
      resolveDrain();
    },
  };
}
