import axios from 'axios';
import { apiBasePost } from '@/http/request';
import { withForegroundActivity } from '@/http/requestActivity';
import type { CloudUploadResult } from '@/api/cloudFileUploadApi';
import { cloudUploadMode } from '@lightnote/shared/cloud-upload';
import { createCloudMultipartUpload, createCloudPutLimiter } from './cloudMultipartUpload';

export const CLOUD_UPLOAD_CONCURRENCY = 3;
export const CLOUD_UPLOAD_BATCH_SIZE = 20;
export const CLOUD_UPLOAD_MOBILE_SELECTION_LIMIT = 100;
const AUTO_RETRIES = 2;
const PREVIEW_SIZE = 8;

export type CloudUploadStatus =
  'queued' | 'preparing' | 'uploading' | 'merging' | 'confirming' | 'retrying' | 'success' | 'error';
type UploadInfo = {
  filename: string;
  objectKey: string;
  uploadUrl: string;
  fileType: string;
  headers?: object;
  expiresAt: number;
  multipartSessionId?: string;
};
type Task = {
  id: number;
  file?: File;
  name: string;
  size: number;
  type: string;
  folderId: string | null;
  status: CloudUploadStatus;
  progress: number;
  info?: UploadInfo;
  uploaded?: boolean;
  multipart?: ReturnType<typeof createCloudMultipartUpload>;
  result?: CloudUploadResult;
};
export type CloudUploadSnapshot = {
  running: boolean;
  total: number;
  success: number;
  failed: number;
  pending: number;
  overall: number;
  speed: number;
  blocked: '' | 'quota' | 'auth';
  preview: Array<{ id: number; name: string; status: CloudUploadStatus; progress: number }>;
};

function failure(response: any, fallback: string) {
  return Object.assign(new Error(fallback), {
    status: ['visitor', 'preview'].includes(response?.status) ? 401 : Number(response?.status),
    retryAfter: Number(response?.data?.retryAfter || 0),
    shortfallMB: Number(response?.data?.shortfallMB || 0),
    code: response?.data?.errorCode,
  });
}
function statusOf(error: any) {
  return Number(error?.status || error?.response?.status || 0);
}
function retryable(error: any) {
  const status = statusOf(error);
  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    ['OFFLINE', 'NETWORK_ERROR', 'REQUEST_TIMEOUT', 'ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'].includes(
      error?.code,
    )
  );
}
function cancelled() {
  return new DOMException('Upload cancelled', 'AbortError');
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(cancelled());
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

/** 当前页面内的普通上传会话。只持有原始 File，签名与确认均有批次上限；确认失败始终重放原对象键。 */
export function createCloudUploadQueue(
  files: File[],
  folderId: string | null,
  changed: (state: CloudUploadSnapshot) => void,
) {
  const tasks: Task[] = files.map((file, id) => ({
    id,
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    folderId,
    status: 'queued',
    progress: 0,
  }));
  let controller: AbortController | undefined;
  let running = false;
  let disposed = false;
  let blocked: CloudUploadSnapshot['blocked'] = '';
  let shortfallMB = 0;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let startedAt = 0;
  let transferred = 0;
  let roundTasks: Task[] | undefined;
  const putSlot = createCloudPutLimiter(CLOUD_UPLOAD_CONCURRENCY);

  function snapshot(): CloudUploadSnapshot {
    let success = 0,
      failed = 0,
      loaded = 0,
      totalBytes = 0;
    const active: Task[] = [],
      errors: Task[] = [],
      waiting: Task[] = [];
    for (const task of tasks) {
      // 给零字节文件保留一个进度单位；只有确认入库才贡献完整进度。
      const weight = Math.max(1, task.size);
      totalBytes += weight;
      loaded += weight * (task.status === 'success' ? 1 : Math.min(task.progress, 99) / 100);
      if (task.status === 'success') success++;
      else if (task.status === 'error') {
        failed++;
        if (errors.length < PREVIEW_SIZE) errors.push(task);
      } else if (task.status === 'queued') {
        if (waiting.length < PREVIEW_SIZE) waiting.push(task);
      } else if (active.length < PREVIEW_SIZE) active.push(task);
    }
    return {
      running,
      total: tasks.length,
      success,
      failed,
      pending: tasks.length - success - failed,
      overall: totalBytes ? (loaded / totalBytes) * 100 : 0,
      speed: running ? transferred / Math.max(1, (Date.now() - startedAt) / 1000) : 0,
      blocked,
      preview: [...active, ...errors, ...waiting].slice(0, PREVIEW_SIZE).map((task) => ({
        id: task.id,
        name: task.name,
        status: task.status,
        progress: task.progress,
      })),
    };
  }
  function emitState() {
    if (progressTimer) clearTimeout(progressTimer);
    progressTimer = undefined;
    if (!disposed) changed(snapshot());
  }
  function notify(immediate = false) {
    if (immediate) emitState();
    else if (!progressTimer && !disposed) progressTimer = setTimeout(emitState, 100);
  }
  function progressChanged() {
    notify();
  }
  function assertActive() {
    if (disposed || controller?.signal.aborted) throw cancelled();
  }
  async function attempt<T>(group: Task[], operation: () => Promise<T>, phase: CloudUploadStatus): Promise<T> {
    for (let retry = 0; ; retry++) {
      assertActive();
      group.forEach((task) => {
        task.status = phase;
      });
      notify();
      try {
        return await operation();
      } catch (error: any) {
        if (!retryable(error) || retry >= AUTO_RETRIES) throw error;
        group.forEach((task) => {
          task.status = 'retrying';
        });
        notify();
        await wait(Math.max(1000 * 2 ** retry, Number(error.retryAfter || 0) * 1000), controller!.signal);
      }
    }
  }
  function markError(group: Task[], error: unknown) {
    if (statusOf(error) === 413) {
      blocked = 'quota';
      shortfallMB = Number((error as any)?.shortfallMB || 0);
    } else if ([401, 403].includes(statusOf(error))) blocked = 'auth';
    group.forEach((task) => {
      task.status = controller?.signal.aborted ? 'queued' : 'error';
    });
    notify();
  }
  async function prepare(input: Task[]) {
    const group = input.filter((task) => cloudUploadMode(task.size) === 'direct');
    if (!group.length) return;
    const response = await attempt(
      group,
      async () => {
        const res = await apiBasePost(
          '/api/file/uploadFiles',
          {
            files: group.map((task) => ({
              fileName: task.name,
              fileSize: task.size,
              fileType: task.type || 'application/octet-stream',
            })),
          },
          { silent: true, signal: controller!.signal },
        );
        if (res.status !== 200) throw failure(res, 'UPLOAD_PREPARE_FAILED');
        if (!Array.isArray(res.data) || res.data.length !== group.length) throw new Error('UPLOAD_RESPONSE_INVALID');
        return res.data;
      },
      'preparing',
    );
    assertActive();
    group.forEach((task, index) => {
      const info = response[index];
      if (!info?.objectKey || !info?.uploadUrl || info.status === '处理失败') {
        task.status = 'error';
        return;
      }
      task.info = { ...info, expiresAt: Date.now() + (Number(info.expiresIn) || 900) * 1000 };
      task.status = 'queued';
    });
    notify();
  }
  async function upload(task: Task) {
    if (cloudUploadMode(task.size) === 'invalid') {
      markError([task], new Error('UPLOAD_SIZE_INVALID'));
      return;
    }
    if (cloudUploadMode(task.size) === 'multipart') {
      task.multipart ||= createCloudMultipartUpload(task.file!, task.folderId, putSlot);
      let lastLoaded = 0;
      try {
        const state = await withForegroundActivity(() =>
          task.multipart!.run(
            controller!.signal,
            (loaded) => {
              if (disposed || controller?.signal.aborted) return;
              transferred += Math.max(0, loaded - lastLoaded);
              lastLoaded = loaded;
              task.progress = Math.min(99, (loaded / Math.max(1, task.size)) * 100);
              notify();
            },
            (phase) => {
              task.status = phase;
              notify();
            },
          ),
        );
        assertActive();
        task.info = {
          filename: state.filename,
          objectKey: state.objectKey,
          fileType: state.fileType,
          multipartSessionId: state.sessionId,
          uploadUrl: '',
          expiresAt: Infinity,
        };
        task.uploaded = true;
        task.progress = 99;
        task.status = 'confirming';
      } catch (error) {
        markError([task], error);
      }
      return;
    }
    try {
      await attempt(
        [task],
        async () => {
          // 排队或退避可能跨过签名有效期，只为尚未传完的文件重新申请。
          if (!task.info || task.info.expiresAt <= Date.now() + 5000) await prepare([task]);
          assertActive();
          if (!task.info || task.status === 'error') throw new Error('UPLOAD_PREPARE_FAILED');
          task.status = 'uploading';
          let lastLoaded = 0;
          try {
            await withForegroundActivity(() =>
              putSlot(controller!.signal, () =>
                axios.put(task.info!.uploadUrl, task.file!, {
                  headers: {
                    ...task.info!.headers,
                    'Content-Type': task.info!.fileType || task.type || 'application/octet-stream',
                  },
                  signal: controller!.signal,
                  timeout: 10 * 60_000,
                  onUploadProgress: (event) => {
                    if (disposed || controller?.signal.aborted) return;
                    transferred += Math.max(0, event.loaded - lastLoaded);
                    lastLoaded = event.loaded;
                    task.progress = Math.min(99, (event.loaded / Math.max(1, event.total || task.size)) * 100);
                    progressChanged();
                  },
                }),
              ),
            );
          } catch (error) {
            // OBS 403 通常表示签名到期；重新签名不会影响已确认或待确认的文件。
            if (statusOf(error) === 403) {
              task.info = undefined;
              throw Object.assign(new Error('UPLOAD_SIGNATURE_EXPIRED'), { status: 408 });
            }
            throw error;
          }
          task.uploaded = true;
          task.progress = 99;
          task.status = 'confirming';
        },
        'uploading',
      );
    } catch (error) {
      markError([task], error);
    }
  }
  async function confirm(group: Task[]) {
    if (!group.length) return;
    try {
      const response = await attempt(
        group,
        async () => {
          // 不取消在途确认：服务端可能已经提交。先读回结果，再停队列，避免误报失败或换对象重传。
          const res = await apiBasePost(
            '/api/file/confirmUpload',
            {
              files: group.map((task) => ({
                fileName: task.info!.filename,
                fileType: task.info!.fileType || task.type,
                fileSize: task.size,
                objectKey: task.info!.objectKey,
                ...(task.info!.multipartSessionId ? { multipartSessionId: task.info!.multipartSessionId } : {}),
              })),
              folderId: group[0].folderId,
            },
            { silent: true },
          );
          if (res.status !== 200) throw failure(res, 'UPLOAD_CONFIRM_FAILED');
          if (!Array.isArray(res.data) || res.data.length !== group.length) throw new Error('UPLOAD_RESPONSE_INVALID');
          return res.data;
        },
        'confirming',
      );
      group.forEach((task, index) => {
        const result = response[index];
        if (result?.fileId && ['已上传', '已覆盖'].includes(result.status)) {
          task.result = { ...result, fileId: String(result.fileId) };
          task.status = 'success';
          task.progress = 100;
          // 已成功项释放 File 与签名，重试始终跳过。
          task.info = undefined;
          task.multipart?.release();
          task.multipart = undefined;
          task.file = undefined;
        } else task.status = 'error';
      });
      notify();
    } catch (error) {
      const sessionExpired = [
        'MULTIPART_SESSION_EXPIRED',
        'MULTIPART_SESSION_INACTIVE',
        'MULTIPART_SESSION_NOT_FOUND',
      ].includes((error as any)?.code);
      if (sessionExpired && group.length === 1)
        group.forEach((task) => {
          if (task.multipart) {
            task.uploaded = false;
            task.info = undefined;
          }
        });
      // 单个无效对象不能拖累同批的其余文件；未知/暂时错误仍保留原键，留待安全重放。
      if (!controller?.signal.aborted && ([400, 409].includes(statusOf(error)) || sessionExpired) && group.length > 1) {
        for (const task of group) {
          if (blocked) break;
          await confirm([task]);
        }
      } else markError(group, error);
    }
  }
  async function run(retryFailed = true) {
    if (running || disposed) return;
    running = true;
    blocked = '';
    shortfallMB = 0;
    startedAt = Date.now();
    transferred = 0;
    controller = new AbortController();
    // 本轮只领取等待项；只有显式重试才重置失败项。上传中追加的批次进入同一轮。
    const remaining = tasks.filter((task) => task.status === 'queued' || (retryFailed && task.status === 'error'));
    roundTasks = remaining;
    remaining.forEach((task) => {
      task.status = 'queued';
      if (task.multipart?.wasCancelled()) {
        task.uploaded = false;
        task.info = undefined;
        task.progress = 0;
      }
    });
    notify(true);
    try {
      for (let offset = 0; offset < remaining.length && !blocked;) {
        assertActive();
        // 不同批次可以选择不同文件夹；一个确认请求只能含同一目标。
        let end = offset + 1;
        while (
          end < remaining.length &&
          end - offset < CLOUD_UPLOAD_BATCH_SIZE &&
          remaining[end].folderId === remaining[offset].folderId
        )
          end++;
        const group = remaining.slice(offset, end);
        offset = end;
        // 先恢复上轮已传完但确认失败的对象，不能再次 PUT 或申请新对象键。
        await confirm(group.filter((task) => task.uploaded));
        if (blocked) break;
        const pending = group.filter((task) => !task.uploaded);
        try {
          await prepare(pending.filter((task) => !task.info || task.info.expiresAt <= Date.now() + 5000));
        } catch (error) {
          markError(pending, error);
          if (controller.signal.aborted) break;
          continue;
        }
        let cursor = 0;
        await Promise.all(
          Array.from({ length: Math.min(CLOUD_UPLOAD_CONCURRENCY, pending.length) }, async () => {
            while (cursor < pending.length && !controller!.signal.aborted && !blocked) {
              const task = pending[cursor++];
              if (task.status !== 'error') await upload(task);
            }
          }),
        );
        if (!controller.signal.aborted) await confirm(pending.filter((task) => task.uploaded));
      }
    } catch (error) {
      if (!controller.signal.aborted)
        markError(
          remaining.filter((task) => task.status !== 'success'),
          error,
        );
    } finally {
      running = false;
      roundTasks = undefined;
      tasks.forEach((task) => {
        if (!['success', 'error'].includes(task.status)) task.status = 'queued';
      });
      notify(true);
    }
  }
  return {
    run,
    append(additions: File[], targetFolderId: string | null) {
      if (disposed) throw new Error('UPLOAD_QUEUE_DISPOSED');
      const start = tasks.length;
      const added: Task[] = additions.map((file, index) => ({
        id: start + index,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        folderId: targetFolderId,
        status: 'queued',
        progress: 0,
      }));
      tasks.push(...added);
      roundTasks?.push(...added);
      notify(true);
    },
    reservedFileNames: () =>
      tasks.filter((task) => task.status !== 'success').map((task) => task.name.normalize('NFC').trim()),
    snapshot,
    cancel: () => {
      controller?.abort();
      tasks.forEach((task) => {
        if (task.status !== 'success') void task.multipart?.cancel();
      });
    },
    dispose: () => {
      disposed = true;
      controller?.abort();
      if (progressTimer) clearTimeout(progressTimer);
      tasks.forEach((task) => task.multipart?.dispose());
    },
    results: () => tasks.flatMap((task) => (task.result ? [{ ...task.result, taskId: task.id }] : [])),
    shortfallMB: () => shortfallMB,
  };
}
