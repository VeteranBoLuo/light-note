import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { apiBasePost } from '@/http/request';
import { CLOUD_UPLOAD_BATCH_SIZE, CLOUD_UPLOAD_CONCURRENCY, createCloudUploadQueue } from './cloudUploadQueue';

vi.mock('axios', () => ({ default: { put: vi.fn() } }));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
const post = vi.mocked(apiBasePost);
const put = vi.mocked(axios.put);
const photos = (count: number) =>
  Array.from({ length: count }, (_, i) => new File(['photo'], `photo-${i}.jpg`, { type: 'image/jpeg' }));
const ok = (data: any) => ({ status: 200, data, msg: '' });
const network = () => Object.assign(new Error('network'), { code: 'ERR_NETWORK' });
let serial = 0;
let confirmed: string[];
function fixture(url: string, data: any) {
  if (url.endsWith('/uploadFiles'))
    return ok(
      data.files.map((file: any) => ({
        filename: file.fileName,
        fileType: file.fileType,
        uploadUrl: `https://obs.test/${++serial}`,
        objectKey: `object-${serial}`,
        expiresIn: 900,
      })),
    );
  if (url.endsWith('/confirmUpload'))
    return ok(
      data.files.map((file: any) => {
        confirmed.push(file.objectKey);
        return { filename: file.fileName, fileId: file.objectKey, status: '已上传' };
      }),
    );
  throw new Error('Unexpected API');
}
beforeEach(() => {
  vi.useFakeTimers();
  serial = 0;
  confirmed = [];
  post.mockReset().mockImplementation(async (url, data) => fixture(url, data));
  put.mockReset().mockResolvedValue({} as never);
});
afterEach(() => vi.useRealTimers());

async function finish(queue: ReturnType<typeof createCloudUploadQueue>) {
  const running = queue.run();
  await vi.runAllTimersAsync();
  await running;
}

describe('云空间批量上传队列', () => {
  it('3000 张照片的传输并发始终不超过 3，元信息和确认按 20 项分批，进度预览有界', async () => {
    let active = 0,
      peak = 0,
      previewPeak = 0;
    put.mockImplementation(async (_url, _file, options) => {
      peak = Math.max(peak, ++active);
      options?.onUploadProgress?.({ loaded: 3, total: 5 } as any);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return {} as any;
    });
    const queue = createCloudUploadQueue(photos(3000), 'album-a', (state) => {
      previewPeak = Math.max(previewPeak, state.preview.length);
    });
    await finish(queue);
    expect(peak).toBe(CLOUD_UPLOAD_CONCURRENCY);
    expect(previewPeak).toBeLessThanOrEqual(8);
    expect(queue.snapshot()).toMatchObject({
      total: 3000,
      success: 3000,
      failed: 0,
      pending: 0,
      overall: 100,
      running: false,
    });
    expect(confirmed).toHaveLength(3000);
    expect(put).toHaveBeenCalledTimes(3000);
    for (const [url, data] of post.mock.calls) {
      expect(data.files.length).toBeLessThanOrEqual(CLOUD_UPLOAD_BATCH_SIZE);
      expect(data.files.every((file: any) => !('file' in file))).toBe(true);
      if (url.endsWith('/confirmUpload')) expect(data.folderId).toBe('album-a');
    }
    expect(post).toHaveBeenCalledTimes(300);
  });

  it('短暂传输失败自动退避重试，只在确认入库后报告成功', async () => {
    let state = '';
    put.mockRejectedValueOnce(network()).mockImplementation(async () => {
      expect(queue.snapshot().success).toBe(0);
      return {} as any;
    });
    const queue = createCloudUploadQueue(photos(1), null, (snapshot) => {
      if (snapshot.preview[0]?.status === 'retrying') state = 'retrying';
    });
    await finish(queue);
    expect(put).toHaveBeenCalledTimes(2);
    expect(state).toBe('retrying');
    expect(queue.snapshot().success).toBe(1);
  });

  it('自动重试耗尽后保留失败项，手动重试不重传已保存项', async () => {
    let failing = true;
    put.mockImplementation(async (_url, file) => {
      if ((file as File).name === 'photo-1.jpg' && failing) throw network();
      return {} as any;
    });
    const queue = createCloudUploadQueue(photos(3), 'original-folder', () => {});
    await finish(queue);
    expect(queue.snapshot()).toMatchObject({ success: 2, failed: 1 });
    expect(put).toHaveBeenCalledTimes(5);
    failing = false;
    await finish(queue);
    expect(queue.snapshot()).toMatchObject({ success: 3, failed: 0 });
    expect(put).toHaveBeenCalledTimes(6);
    expect(confirmed).toHaveLength(3);
  });

  it('确认响应丢失且重试耗尽，手动重试只确认相同对象、不重新签名或 PUT', async () => {
    let fail = true;
    post.mockImplementation(async (url, data) => {
      if (url.endsWith('/confirmUpload') && fail) throw network();
      return fixture(url, data);
    });
    const queue = createCloudUploadQueue(photos(2), 'bound-folder', () => {});
    await finish(queue);
    expect(queue.snapshot()).toMatchObject({ success: 0, failed: 2 });
    const firstKeys = post.mock.calls
      .find(([url]) => url.endsWith('/confirmUpload'))![1]
      .files.map((file: any) => file.objectKey);
    fail = false;
    await finish(queue);
    expect(put).toHaveBeenCalledTimes(2);
    expect(post.mock.calls.filter(([url]) => url.endsWith('/uploadFiles'))).toHaveLength(1);
    expect(confirmed).toEqual(firstKeys);
    expect(queue.snapshot().success).toBe(2);
  });

  it('429 遵守服务端 retryAfter，等待期间不继续发送请求', async () => {
    post.mockRejectedValueOnce({ status: 429, retryAfter: 30 });
    const queue = createCloudUploadQueue(photos(1), null, () => {});
    const run = queue.run();
    await vi.advanceTimersByTimeAsync(29000);
    expect(post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await run;
    expect(queue.snapshot().success).toBe(1);
  });

  it('容量不足停止后续批次，保留等待项，扩容后可重试', async () => {
    post.mockResolvedValueOnce({ status: 413, data: { shortfallMB: 12 }, msg: '' });
    const queue = createCloudUploadQueue(photos(65), null, () => {});
    await finish(queue);
    expect(post).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(queue.snapshot()).toMatchObject({ success: 0, failed: 20, pending: 45, blocked: 'quota' });
    expect(queue.shortfallMB()).toBe(12);
    await finish(queue);
    expect(queue.snapshot()).toMatchObject({ success: 65, blocked: '' });
  });

  it('取消会停止领取，已传完但未确认的对象保留供重试确认', async () => {
    let count = 0;
    const queue = createCloudUploadQueue(photos(25), null, () => {});
    put.mockImplementation(async () => {
      if (++count === 1) queue.cancel();
      return {} as any;
    });
    await finish(queue);
    expect(put.mock.calls.length).toBeLessThanOrEqual(3);
    expect(confirmed).toHaveLength(0);
    expect(queue.snapshot().pending).toBe(25);
    put.mockResolvedValue({} as never);
    await finish(queue);
    expect(queue.snapshot().success).toBe(25);
    expect(put).toHaveBeenCalledTimes(25);
  });

  it('取消时已提交的确认仍按真实结果计成功，其余批次不再启动', async () => {
    const queue = createCloudUploadQueue(photos(25), null, () => {});
    post.mockImplementation(async (url, data) => {
      const result = fixture(url, data);
      if (url.endsWith('/confirmUpload')) queue.cancel();
      return result;
    });
    await finish(queue);
    expect(queue.snapshot()).toMatchObject({ success: 20, pending: 5, failed: 0 });
    expect(put).toHaveBeenCalledTimes(20);
  });

  it('同批确认中的单个业务冲突隔离处理，不阻塞其余对象', async () => {
    post.mockImplementation(async (url, data) => {
      if (url.endsWith('/confirmUpload') && data.files.some((file: any) => file.fileName === 'photo-1.jpg')) {
        return { status: 409, msg: '', data: null };
      }
      return fixture(url, data);
    });
    const queue = createCloudUploadQueue(photos(3), null, () => {});
    await finish(queue);
    expect(queue.snapshot()).toMatchObject({ success: 2, failed: 1 });
    expect(put).toHaveBeenCalledTimes(3);
  });

  it('重试等待中的取消立即收口，不继续自动重试或领取后续文件', async () => {
    post.mockRejectedValueOnce(network());
    const queue = createCloudUploadQueue(photos(50), null, () => {});
    const run = queue.run();
    await vi.advanceTimersByTimeAsync(100);
    queue.cancel();
    await run;
    await vi.advanceTimersByTimeAsync(10000);
    expect(post).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(queue.snapshot()).toMatchObject({ running: false, success: 0, failed: 0, pending: 50 });
  });

  it('等待重试超过签名有效期时仅为未传完的文件换签名', async () => {
    let fail = true;
    put.mockImplementation(async (_url, file) => {
      if ((file as File).name === 'photo-1.jpg' && fail) throw network();
      return {} as any;
    });
    const queue = createCloudUploadQueue(photos(2), null, () => {});
    await finish(queue);
    expect(queue.snapshot()).toMatchObject({ success: 1, failed: 1 });
    await vi.advanceTimersByTimeAsync(901000);
    fail = false;
    await finish(queue);
    const prepares = post.mock.calls.filter(([url]) => url.endsWith('/uploadFiles'));
    expect(prepares).toHaveLength(2);
    expect(prepares[1][1].files.map((file: any) => file.fileName)).toEqual(['photo-1.jpg']);
    expect(put.mock.calls.at(-1)![0]).toBe('https://obs.test/3');
    expect(queue.snapshot().success).toBe(2);
  });

  it('鉴权失败停止后续批次，不把整个相册继续提交到失效会话', async () => {
    post.mockResolvedValueOnce({ status: 403, data: null, msg: '' });
    const queue = createCloudUploadQueue(photos(65), null, () => {});
    await finish(queue);
    expect(post).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(queue.snapshot()).toMatchObject({ running: false, blocked: 'auth', failed: 20, pending: 45 });
  });

  it('销毁会话后忽略迟到结果并停止后续上传', async () => {
    let resolve: ((value: any) => void) | undefined;
    post.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const changed = vi.fn();
    const queue = createCloudUploadQueue(photos(30), null, changed);
    const run = queue.run();
    await vi.advanceTimersByTimeAsync(0);
    queue.dispose();
    changed.mockClear();
    resolve!(fixture('/uploadFiles', { files: photos(20).map((file) => ({ fileName: file.name })) }));
    await run;
    expect(put).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});
