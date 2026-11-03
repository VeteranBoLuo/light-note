import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { apiBasePost } from '@/http/request';
import {
  CLOUD_DIRECT_MAX_BYTES,
  CLOUD_UPLOAD_MAX_BYTES,
  CLOUD_UPLOAD_PART_BYTES,
  cloudUploadMode,
} from '@lightnote/shared/cloud-upload';
import { createCloudUploadQueue } from './cloudUploadQueue';
import { createCloudMultipartUpload, createCloudPutLimiter } from './cloudMultipartUpload';

vi.mock('axios', () => ({ default: { put: vi.fn() } }));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
const post = vi.mocked(apiBasePost),
  put = vi.mocked(axios.put);
const ok = (data: unknown) => ({ status: 200, data, msg: '' });
let sessions: Map<string, any>, initCount: number, mode: string;
let queue: ReturnType<typeof createCloudUploadQueue> | undefined;
function large(size = CLOUD_DIRECT_MAX_BYTES + 1) {
  const file = new File(['original'], 'backup.zip', { type: 'application/zip' });
  Object.defineProperty(file, 'size', { value: size });
  const slice = vi.spyOn(file, 'slice').mockImplementation((start = 0, end = size) => {
    const blob = new Blob(['chunk']);
    Object.defineProperty(blob, 'size', { value: Math.min(end, size) - start });
    return blob;
  });
  return { file, slice, read: vi.spyOn(file, 'arrayBuffer') };
}
beforeEach(() => {
  vi.useFakeTimers();
  sessions = new Map();
  initCount = 0;
  mode = '';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}));
  post.mockReset().mockImplementation(async (url, body: any) => {
    if (url.endsWith('/initMultipartUpload')) {
      initCount++;
      const s = {
        sessionId: 'session-' + initCount,
        objectKey: 'multipart-' + initCount,
        filename: body.fileName,
        fileSize: body.fileSize,
        fileType: body.fileType,
        state: 'uploading',
        partSize: CLOUD_UPLOAD_PART_BYTES,
        partCount: Math.ceil(body.fileSize / CLOUD_UPLOAD_PART_BYTES),
        uploaded: new Map(),
      };
      sessions.set(s.sessionId, s);
      return ok(s);
    }
    const s = sessions.get(body.sessionId);
    if (url.endsWith('/multipartUploadStatus'))
      return ok({ ...s, parts: [...s.uploaded].map(([partNumber, size]) => ({ partNumber, size, etag: 'tag' })) });
    if (url.endsWith('/signMultipartParts'))
      return ok(
        body.partNumbers.map((partNumber: number) => ({
          partNumber,
          uploadUrl: `https://parts.test/${s.sessionId}/${partNumber}`,
          headers: { 'Content-Type': s.fileType },
          expiresIn: 900,
        })),
      );
    if (url.endsWith('/completeMultipartUpload')) {
      s.state = 'ready';
      return ok(s);
    }
    if (url.endsWith('/abortMultipartUpload')) {
      s.state = 'aborted';
      return ok({ cancelled: true });
    }
    if (url.endsWith('/uploadFiles'))
      return ok(
        body.files.map((file: any) => ({
          filename: file.fileName,
          fileType: file.fileType,
          objectKey: 'direct-' + file.fileName,
          uploadUrl: 'https://direct.test/' + file.fileName,
          expiresIn: 900,
        })),
      );
    if (url.endsWith('/confirmUpload')) {
      if (mode === 'mixed-expired' && body.files.some((f: any) => f.multipartSessionId)) {
        const id = body.files.find((f: any) => f.multipartSessionId).multipartSessionId;
        sessions.get(id).state = 'expired';
        return { status: 410, data: { errorCode: 'MULTIPART_SESSION_EXPIRED' }, msg: '' };
      }
      if (mode === 'confirm-fail') return { status: 503, data: null, msg: '' };
      return ok(body.files.map((file: any) => ({ filename: file.fileName, fileId: file.objectKey, status: '已上传' })));
    }
    throw new Error('Unexpected ' + url);
  });
  put.mockReset().mockImplementation(async (url, blob, config) => {
    if (String(url).startsWith('https://parts.test/')) {
      const [, session, number] = new URL(String(url)).pathname.split('/');
      sessions.get(session).uploaded.set(Number(number), (blob as Blob).size);
    }
    config?.onUploadProgress?.({ loaded: (blob as Blob).size, total: (blob as Blob).size } as any);
    return {} as any;
  });
});
afterEach(() => {
  queue?.dispose();
  queue = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function finish() {
  const running = queue!.run();
  await vi.runAllTimersAsync();
  await running;
}
describe('保守分流与普通上传兼容', () => {
  it('5GiB 边界仍然整文件直传，10GiB 边界分片，超过上限不会请求网络', async () => {
    expect(cloudUploadMode(CLOUD_DIRECT_MAX_BYTES)).toBe('direct');
    expect(cloudUploadMode(CLOUD_DIRECT_MAX_BYTES + 1)).toBe('multipart');
    expect(cloudUploadMode(CLOUD_UPLOAD_MAX_BYTES)).toBe('multipart');
    expect(cloudUploadMode(CLOUD_UPLOAD_MAX_BYTES + 1)).toBe('invalid');
    const { file, slice } = large(CLOUD_DIRECT_MAX_BYTES);
    queue = createCloudUploadQueue([file], null, () => {});
    await finish();
    expect(initCount).toBe(0);
    expect(slice).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('direct.test'), file, expect.anything());
    expect(queue.snapshot().success).toBe(1);
  });
  it('只读取分片，确认时带会话回执，不使用整文件读取；混合上传共用三个网络名额', async () => {
    const { file, slice, read } = large();
    let active = 0,
      peak = 0;
    const basic = put.getMockImplementation()!;
    put.mockImplementation(async (...args) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 1));
      const result = await basic(...args);
      active--;
      return result;
    });
    queue = createCloudUploadQueue([file, new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')], '7', () => {});
    await finish();
    expect(peak).toBe(3);
    expect(queue.snapshot().success).toBe(3);
    expect(read).not.toHaveBeenCalled();
    expect(slice).toHaveBeenCalledTimes(Math.ceil(file.size / CLOUD_UPLOAD_PART_BYTES));
    expect(slice.mock.calls.every(([start, end]) => end! - start! <= CLOUD_UPLOAD_PART_BYTES)).toBe(true);
    expect(
      post.mock.calls
        .filter(([u]) => u.endsWith('/uploadFiles'))
        .flatMap(([, b]: any) => b.files)
        .every((f) => f.fileSize <= CLOUD_DIRECT_MAX_BYTES),
    ).toBe(true);
    expect(
      post.mock.calls
        .filter(([u]) => u.endsWith('/confirmUpload'))
        .flatMap(([, b]: any) => b.files)
        .find((f) => f.multipartSessionId),
    ).toBeTruthy();
  });
  it('分片失败重试只补该片；确认失败只重放保存，不重传任何分片', async () => {
    const basic = put.getMockImplementation()!;
    let failures = 0;
    put.mockImplementation(async (...args) => {
      if (String(args[0]).endsWith('/2') && failures++ < 1) throw Object.assign(new Error(), { code: 'ERR_NETWORK' });
      return basic(...args);
    });
    mode = 'confirm-fail';
    queue = createCloudUploadQueue([large().file], null, () => {});
    await finish();
    expect(queue.snapshot().failed).toBe(1);
    const count = put.mock.calls.length;
    expect(put.mock.calls.filter(([u]) => String(u).endsWith('/2'))).toHaveLength(2);
    mode = '';
    await finish();
    expect(queue.snapshot().success).toBe(1);
    expect(put).toHaveBeenCalledTimes(count);
    expect(initCount).toBe(1);
  });
  it('失败耗尽后手动重试按服务端分片列表恢复，已成功片不再传', async () => {
    const basic = put.getMockImplementation()!;
    put.mockImplementation(async (...args) => {
      if (String(args[0]).endsWith('/2')) throw Object.assign(new Error(), { code: 'ERR_NETWORK' });
      return basic(...args);
    });
    queue = createCloudUploadQueue([large().file], null, () => {});
    await finish();
    expect(queue.snapshot().failed).toBe(1);
    const first = put.mock.calls.filter(([u]) => String(u).endsWith('/1')).length;
    put.mockImplementation(basic);
    await finish();
    expect(queue.snapshot().success).toBe(1);
    expect(put.mock.calls.filter(([u]) => String(u).endsWith('/1'))).toHaveLength(first);
    expect(initCount).toBe(1);
  });
  it('混合批次中的分片会话过期不阻塞普通照片保存，重试不再传已保存照片', async () => {
    mode = 'mixed-expired';
    queue = createCloudUploadQueue([large().file, new File(['photo'], 'photo.jpg')], null, () => {});
    await finish();
    expect(queue.snapshot()).toMatchObject({ success: 1, failed: 1 });
    const count = put.mock.calls.filter(([url]) => String(url).includes('direct.test')).length;
    mode = '';
    await finish();
    expect(queue.snapshot().success).toBe(2);
    expect(put.mock.calls.filter(([url]) => String(url).includes('direct.test'))).toHaveLength(count);
  });
  it('取消停止所有在途片，重试创建新会话；成功文件不受影响', async () => {
    put.mockImplementation(
      (_url, _blob, config) =>
        new Promise((_r, reject) =>
          config?.signal?.addEventListener?.('abort', () => reject(new DOMException('cancelled', 'AbortError'))),
        ),
    );
    queue = createCloudUploadQueue([large().file], null, () => {});
    const running = queue.run();
    await vi.advanceTimersByTimeAsync(10);
    expect(put).toHaveBeenCalledTimes(3);
    queue.cancel();
    await running;
    expect(queue.snapshot().running).toBe(false);
    expect([...sessions.values()][0].state).toBe('aborted');
    put.mockResolvedValue({} as never);
    await finish();
    expect(initCount).toBe(2);
    expect(queue.snapshot().success).toBe(1);
  });
  it('页面结束释放来源并取消会话，不再签发后续分片', async () => {
    put.mockImplementation(
      (_u, _b, c) =>
        new Promise((_r, reject) =>
          c?.signal?.addEventListener?.('abort', () => reject(new DOMException('cancelled', 'AbortError'))),
        ),
    );
    queue = createCloudUploadQueue([large().file], null, () => {});
    const running = queue.run();
    await vi.advanceTimersByTimeAsync(10);
    queue.dispose();
    await running;
    expect(fetch).toHaveBeenCalledWith('/api/file/abortMultipartUpload', expect.objectContaining({ keepalive: true }));
    expect(put).toHaveBeenCalledTimes(3);
  });
  it('初始化回执晚于取消返回时立即终止会话，不传任何分片', async () => {
    const basic = post.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    post.mockImplementation(async (...args) => {
      const response = await basic(...args);
      if (args[0].endsWith('/initMultipartUpload')) await gate;
      return response;
    });
    queue = createCloudUploadQueue([large().file], null, () => {});
    const running = queue.run();
    await vi.advanceTimersByTimeAsync(10);
    queue.cancel();
    release();
    await running;
    expect(put).not.toHaveBeenCalled();
    expect([...sessions.values()][0].state).toBe('aborted');
  });
  it('初始化回执丢失且会话已过期时更换请求ID，手动重试不会永久卡住', async () => {
    const basic = post.getMockImplementation()!;
    let expired = true;
    post.mockImplementation(async (...args) => {
      if (args[0].endsWith('/initMultipartUpload') && expired) {
        expired = false;
        return { status: 410, data: { errorCode: 'MULTIPART_SESSION_EXPIRED' }, msg: '' };
      }
      return basic(...args);
    });
    queue = createCloudUploadQueue([large().file], null, () => {});
    await finish();
    const requests = post.mock.calls.filter(([u]) => u.endsWith('/initMultipartUpload'));
    expect(requests).toHaveLength(2);
    expect((requests[0][1] as any).requestId).not.toBe((requests[1][1] as any).requestId);
    expect(queue.snapshot().success).toBe(1);
  });
  it('全局名额等待跨过签名有效期时，在获得名额后重新签名再发送', async () => {
    let delayed = false;
    const beforePut: number[] = [];
    const basic = put.getMockImplementation()!;
    put.mockImplementation(async (...args) => {
      beforePut.push(post.mock.calls.filter(([u]) => u.endsWith('/signMultipartParts')).length);
      return basic(...args);
    });
    const slot = createCloudPutLimiter(3);
    const task = createCloudMultipartUpload(large().file, null, (signal, work) =>
      slot(signal, async () => {
        if (!delayed) {
          delayed = true;
          vi.setSystemTime(Date.now() + 16 * 60_000);
        }
        return work();
      }),
    );
    const result = await task.run(
      new AbortController().signal,
      () => {},
      () => {},
    );
    expect(result.state).toBe('ready');
    expect(beforePut[0]).toBeGreaterThan(1);
    task.release();
  });
});
