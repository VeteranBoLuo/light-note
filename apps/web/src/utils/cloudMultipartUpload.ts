import axios from 'axios';
import { apiBasePost } from '@/http/request';
import {
  CLOUD_UPLOAD_PART_BYTES,
  CLOUD_UPLOAD_PART_CONCURRENCY,
  CLOUD_UPLOAD_SIGN_BATCH,
} from '@lightnote/shared/cloud-upload';

type State = {
  sessionId: string;
  objectKey: string;
  filename: string;
  fileType: string;
  fileSize: number;
  state: string;
  partSize: number;
  partCount: number;
  parts?: Array<{ partNumber: number; size: number; etag: string }>;
};
type Ticket = { partNumber: number; uploadUrl: string; headers: Record<string, string>; expiresIn: number };
export type PutSlot = <T>(signal: AbortSignal, work: () => Promise<T>) => Promise<T>;
const cancelled = () => new DOMException('Upload cancelled', 'AbortError');
const active = (signal: AbortSignal) => {
  if (signal.aborted) throw cancelled();
};
function requestUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // 局域网 HTTP Debug WebView 没有 randomUUID，但支持 getRandomValues。
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const errorStatus = (e: any) => Number(e?.status || e?.response?.status || 0);
const retryable = (e: any) =>
  [408, 423, 429].includes(errorStatus(e)) ||
  errorStatus(e) >= 500 ||
  ['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'OFFLINE', 'ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(e?.code);
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    active(signal);
    const abort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** 普通 PUT 与分片共享名额；等待者取消后不能领取或占住名额。 */
export function createCloudPutLimiter(limit: number): PutSlot {
  let count = 0;
  const waiting: Array<() => void> = [];
  return async (signal, work) => {
    active(signal);
    await new Promise<void>((resolve, reject) => {
      let queued = false;
      const abort = () => {
        if (!queued) return;
        const index = waiting.indexOf(take);
        if (index >= 0) waiting.splice(index, 1);
        signal.removeEventListener('abort', abort);
        reject(cancelled());
      };
      const take = () => {
        queued = false;
        signal.removeEventListener('abort', abort);
        count++;
        resolve();
      };
      if (count < limit) take();
      else {
        queued = true;
        waiting.push(take);
        signal.addEventListener('abort', abort, { once: true });
      }
    });
    try {
      active(signal);
      return await work();
    } finally {
      count--;
      waiting.shift()?.();
    }
  };
}

/** 当前文档内保留会话回执；只将 File.slice 的一片交给 XHR，从不读取整文件或持久化原件。 */
export function createCloudMultipartUpload(source: File, folderId: string | null, slot: PutSlot) {
  let file: File | undefined = source;
  let requestId = requestUuid();
  let state: State | undefined;
  let cancelRequested = false;
  let abortPromise: Promise<unknown> | undefined;
  let inFlight: AbortController | undefined;
  let disposed = false;
  const completed = new Set<number>();
  const exitNotified = new Set<string>();
  async function call(operation: string, payload: object, signal?: AbortSignal) {
    const response = await apiBasePost(`/api/file/${operation}`, payload, { silent: true, signal });
    if (response.status !== 200)
      throw Object.assign(new Error('MULTIPART_REQUEST_FAILED'), {
        status: ['visitor', 'preview'].includes(response.status as any) ? 401 : Number(response.status),
        code: response.data?.errorCode,
        retryAfter: response.data?.retryAfter,
        shortfallMB: response.data?.shortfallMB,
      });
    return response.data;
  }
  async function attempt<T>(operation: () => Promise<T>, signal: AbortSignal, retrying: () => void) {
    for (let n = 0; ; n++) {
      active(signal);
      try {
        return await operation();
      } catch (error) {
        if (signal.aborted || !retryable(error) || n >= 2) throw error;
        retrying();
        await pause(Math.max(1000 * 2 ** n, Number((error as any).retryAfter || 0) * 1000), signal);
      }
    }
  }
  async function cancel(exit = false) {
    cancelRequested = true;
    inFlight?.abort();
    if (!state) return;
    const sessionId = state.sessionId;
    if (exit && typeof fetch === 'function' && !exitNotified.has(sessionId)) {
      exitNotified.add(sessionId);
      // unload 不保证交付；服务端会话过期回收是最终兜底。只发取消，不在后台续传。
      void fetch('/api/file/abortMultipartUpload', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
    abortPromise ||= call('abortMultipartUpload', { sessionId }).catch(() => undefined);
    await abortPromise;
  }
  async function run(
    signal: AbortSignal,
    progress: (loaded: number) => void,
    phase: (state: 'uploading' | 'merging' | 'retrying') => void,
  ): Promise<State> {
    active(signal);
    if (disposed || !file) throw cancelled();
    const controller = new AbortController();
    inFlight = controller;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const local = controller.signal;
    let accepted = state;
    try {
      if (cancelRequested && state) {
        await abortPromise;
        const result = await attempt(
          () => call('abortMultipartUpload', { sessionId: state!.sessionId }, local),
          local,
          () => phase('retrying'),
        );
        if (result.alreadyConfirmed) return state;
        state = undefined;
        completed.clear();
        requestId = requestUuid();
      }
      cancelRequested = false;
      abortPromise = undefined;
      if (!state) {
        // 初始化不能随取消请求一起丢弃回执：若已创建，拿到 sessionId 后立即终止，避免孤儿任务。
        const initialize = () =>
          attempt(
            () =>
              call('initMultipartUpload', {
                requestId,
                fileName: file!.name,
                fileType: file!.type,
                fileSize: file!.size,
                folderId,
              }),
            local,
            () => phase('retrying'),
          );
        let receipt: State;
        try {
          receipt = await initialize();
        } catch (error) {
          if (!['MULTIPART_SESSION_EXPIRED', 'MULTIPART_SESSION_INACTIVE'].includes((error as any)?.code)) throw error;
          requestId = requestUuid();
          receipt = await initialize();
        }
        state = receipt;
        accepted = state;
        if (local.aborted || disposed || cancelRequested) {
          void cancel(disposed);
          throw cancelled();
        }
        if (
          state.fileSize !== file.size ||
          state.partSize !== CLOUD_UPLOAD_PART_BYTES ||
          state.partCount !== Math.ceil(file.size / CLOUD_UPLOAD_PART_BYTES)
        )
          throw new Error('MULTIPART_RESPONSE_INVALID');
      } else {
        const latest: State = await attempt(
          () => call('multipartUploadStatus', { sessionId: state!.sessionId }, local),
          local,
          () => phase('retrying'),
        );
        if (['aborted', 'aborting', 'expired'].includes(latest.state)) {
          void call('abortMultipartUpload', { sessionId: state.sessionId }).catch(() => {});
          state = undefined;
          completed.clear();
          requestId = requestUuid();
          return await run(signal, progress, phase);
        }
        state = latest;
        completed.clear();
        for (const part of latest.parts || []) {
          const expected = Math.min(
            CLOUD_UPLOAD_PART_BYTES,
            file.size - (part.partNumber - 1) * CLOUD_UPLOAD_PART_BYTES,
          );
          if (
            Number.isInteger(part.partNumber) &&
            part.partNumber >= 1 &&
            part.partNumber <= state.partCount &&
            part.size === expected &&
            part.etag
          )
            completed.add(part.partNumber);
        }
      }
      active(local);
      if (['ready', 'confirmed'].includes(state.state)) return state;
      if (state.state === 'completed') {
        phase('merging');
        return await attempt(
          () => call('completeMultipartUpload', { sessionId: state!.sessionId }, local),
          local,
          () => phase('retrying'),
        );
      }
      const current = state;
      const size = file.size;
      const loaded = new Map<number, number>();
      const report = () =>
        progress(
          [...completed].reduce(
            (sum, n) => sum + Math.min(CLOUD_UPLOAD_PART_BYTES, size - (n - 1) * CLOUD_UPLOAD_PART_BYTES),
            0,
          ) + [...loaded.values()].reduce((a, b) => a + b, 0),
        );
      report();
      const remaining = Array.from({ length: current.partCount }, (_, i) => i + 1).filter((n) => !completed.has(n));
      for (let offset = 0; offset < remaining.length; offset += CLOUD_UPLOAD_SIGN_BATCH) {
        active(local);
        const numbers = remaining.slice(offset, offset + CLOUD_UPLOAD_SIGN_BATCH);
        const tickets: Ticket[] = await attempt(
          () => call('signMultipartParts', { sessionId: current.sessionId, partNumbers: numbers }, local),
          local,
          () => phase('retrying'),
        );
        if (
          !Array.isArray(tickets) ||
          tickets.length !== numbers.length ||
          tickets.some((t, i) => t.partNumber !== numbers[i] || !t.uploadUrl)
        )
          throw new Error('MULTIPART_RESPONSE_INVALID');
        let cursor = 0;
        const signedAt = Date.now();
        // 失败先 abort 同文件其他分片，再等待这些请求收尾；不会遗漏在途失败或提前开启下一轮。
        let firstError: unknown;
        await Promise.allSettled(
          Array.from({ length: Math.min(CLOUD_UPLOAD_PART_CONCURRENCY, numbers.length) }, async () => {
            try {
              while (cursor < tickets.length && !local.aborted) {
                let ticket = tickets[cursor++];
                const number = ticket.partNumber;
                let refresh = false;
                let expiresAt = signedAt + Number(ticket.expiresIn || 900) * 1000;
                await attempt(
                  async () => {
                    phase('uploading');
                    await slot(local, async () => {
                      active(local);
                      // 等待全局名额也可能耗尽签名有效期；真正发出 PUT 前再刷新。
                      if (refresh || Date.now() + 30000 >= expiresAt) {
                        [ticket] = await call(
                          'signMultipartParts',
                          { sessionId: current.sessionId, partNumbers: [number] },
                          local,
                        );
                        expiresAt = Date.now() + Number(ticket.expiresIn || 900) * 1000;
                        refresh = false;
                      }
                      const body = file!.slice(
                        (number - 1) * CLOUD_UPLOAD_PART_BYTES,
                        Math.min(number * CLOUD_UPLOAD_PART_BYTES, size),
                      );
                      try {
                        await axios.put(ticket.uploadUrl, body, {
                          headers: ticket.headers,
                          signal: local,
                          timeout: 10 * 60_000,
                          onUploadProgress: (event) => {
                            if (!local.aborted) {
                              loaded.set(number, Math.min(body.size, event.loaded));
                              report();
                            }
                          },
                        });
                      } catch (error) {
                        loaded.delete(number);
                        report();
                        if (errorStatus(error) === 403) {
                          refresh = true;
                          throw Object.assign(new Error('MULTIPART_SIGNATURE_EXPIRED'), { status: 408 });
                        }
                        throw error;
                      }
                    });
                  },
                  local,
                  () => phase('retrying'),
                );
                loaded.delete(number);
                completed.add(number);
                report();
              }
            } catch (error) {
              firstError ||= error;
              controller.abort();
              throw error;
            }
          }),
        );
        if (firstError) throw firstError;
      }
      phase('merging');
      return await attempt(
        () => call('completeMultipartUpload', { sessionId: current.sessionId }, local),
        local,
        () => phase('retrying'),
      );
    } finally {
      signal.removeEventListener('abort', abort);
      if (inFlight === controller) inFlight = undefined;
      // accepted 用于初始化回执被晚到取消标记捕获的场景。
      if ((disposed || cancelRequested) && (state || accepted)) void cancel(disposed);
    }
  }
  return {
    run,
    cancel,
    wasCancelled: () => cancelRequested,
    release: () => {
      file = undefined;
      state = undefined;
      completed.clear();
      exitNotified.clear();
    },
    dispose: () => {
      disposed = true;
      void cancel(true);
      file = undefined;
    },
  };
}
