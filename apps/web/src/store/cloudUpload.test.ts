import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createApp, h, reactive } from 'vue';
import axios from 'axios';
import { apiBasePost } from '@/http/request';
import useCloudUpload from './cloudUpload';
import { CLOUD_UPLOAD_MAX_FILE_BYTES } from '@/utils/cloudUploadSelection';

const fixture = vi.hoisted(() => ({
  user: null as any,
  cloud: null as any,
  bookmark: null as any,
  alert: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('./useUser', () => ({ default: () => fixture.user }));
vi.mock('./cloudSpace', () => ({ default: () => fixture.cloud }));
vi.mock('./bookmark', () => ({ default: () => fixture.bookmark }));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
vi.mock('axios', () => ({ default: { put: vi.fn() } }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/utils/androidBridge', () => ({ isLightNoteAndroidApp: () => false }));
vi.mock('@/i18n', () => ({
  default: { global: { t: (key: string, values: object) => `${key} ${JSON.stringify(values)}` } },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({
  default: { alert: fixture.alert, destroy: fixture.destroy },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { warning: vi.fn() } }));

const photos = (count: number, prefix = 'photo') =>
  Array.from({ length: count }, (_, index) => new File(['photo'], `${prefix}-${index}.jpg`, { type: 'image/jpeg' }));
const post = vi.mocked(apiBasePost),
  put = vi.mocked(axios.put);
let store: ReturnType<typeof useCloudUpload>;
let serial = 0;
let detach: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  serial = 0;
  setActivePinia(createPinia());
  fixture.user = reactive({ id: 'owner', role: 'user', adminContext: null });
  fixture.bookmark = reactive({ isMobileDevice: false });
  fixture.cloud = { cacheImgArr: [], refreshAfterFileMutation: vi.fn().mockResolvedValue(true) };
  fixture.alert.mockReset();
  fixture.destroy.mockReset();
  post.mockReset().mockImplementation(async (url, data: any) => {
    const result = url.endsWith('/checkFileNames')
      ? { allNames: [], check: data.fileNames.map((fileName: string) => ({ fileName, exists: false })) }
      : data.files.map((file: any) =>
          url.endsWith('/uploadFiles')
            ? {
                filename: file.fileName,
                fileType: file.fileType,
                objectKey: `key-${++serial}`,
                uploadUrl: 'https://upload.invalid/test',
                expiresIn: 900,
              }
            : { filename: file.fileName, fileId: file.objectKey, status: '已上传' },
        );
    return { status: 200, data: result, msg: '' };
  });
  put.mockReset().mockResolvedValue({} as never);
  store = useCloudUpload();
});
afterEach(() => {
  detach?.();
  detach = undefined;
  store.$dispose();
  vi.useRealTimers();
});
async function finish(promise: Promise<unknown>) {
  await vi.runAllTimersAsync();
  await promise;
}
function holdPuts() {
  put.mockImplementation(
    (_url, _body, config) =>
      new Promise((_resolve, reject) => {
        config?.signal?.addEventListener?.('abort', () => reject(new DOMException('cancelled', 'AbortError')), {
          once: true,
        });
      }),
  );
}

describe('全局上传会话', () => {
  it('入口组件卸载后仍可追加到同一队列，保持折叠状态和每一批目标目录', async () => {
    store.$dispose();
    const pinia = createPinia();
    put.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({} as never), 50)));
    const host = document.createElement('div');
    document.body.append(host);
    let fromEntry: typeof store;
    const app = createApp({
      setup() {
        fromEntry = useCloudUpload();
        return () => h('div');
      },
    });
    app.use(pinia).mount(host);
    store = fromEntry!;
    const firstRun = store.enqueue(photos(30), 'folder-a');
    await vi.advanceTimersByTimeAsync(20);
    expect(put).toHaveBeenCalledTimes(3);
    expect(store.progress?.running).toBe(true);
    store.collapsed = true;
    app.unmount();
    host.remove();
    const fromOtherPage = useCloudUpload(pinia);
    expect(fromOtherPage).toBe(store);
    const appended = fromOtherPage.enqueue(photos(3, 'next'), 'folder-b');
    await finish(Promise.all([firstRun, appended]));
    expect(store.progress).toMatchObject({ total: 33, success: 33 });
    expect(store.collapsed).toBe(true);
    const targets = post.mock.calls
      .filter(([url]) => url.endsWith('/confirmUpload'))
      .map(([, data]) => (data as any).folderId);
    expect(targets).toEqual(['folder-a', 'folder-a', 'folder-b']);
  });

  it('超过 5GB 时整个批次不入队、不请求签名，错误保留文件名称', async () => {
    const large = photos(1)[0];
    Object.defineProperty(large, 'size', { value: CLOUD_UPLOAD_MAX_FILE_BYTES + 1 });
    await finish(store.enqueue([photos(1, 'valid')[0], large]));
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(store.progress).toBeNull();
    expect(store.selectionError).toContain('photo-0.jpg');
    expect(store.selectionError).toContain('uploadFileTooLarge');
  });

  it('手机超 100 项在元信息检查之前拒绝，并允许下一批继续添加', async () => {
    fixture.bookmark.isMobileDevice = true;
    await store.enqueue(photos(101));
    expect(post).not.toHaveBeenCalled();
    expect(store.selectionError).toContain('uploadSelectionLimit');
    await finish(store.enqueue(photos(100)));
    expect(store.progress?.success).toBe(100);
  });

  it('准备文件时可以取消，取消后不会进入查重和上传', async () => {
    const pending = store.enqueue(photos(3100));
    expect(store.checking).toBe(true);
    store.cancel();
    await finish(pending);
    expect(post).not.toHaveBeenCalled();
    expect(store.checking).toBe(false);
    expect(store.selectionError).toBe('');
  });

  it('主动取消停止传输，剩余项可以在同一会话手动重试', async () => {
    holdPuts();
    const pending = store.enqueue(photos(30), 'folder-a');
    await vi.advanceTimersByTimeAsync(50);
    expect(put).toHaveBeenCalledTimes(3);
    store.cancel();
    await finish(pending);
    expect(store.progress).toMatchObject({ running: false, success: 0, pending: 30 });
    put.mockResolvedValue({} as never);
    await finish(store.retry());
    expect(store.progress?.success).toBe(30);
  });

  it.each(['pagehide', 'light-note:app-exit'])('%s 清理未完成会话，并停止后续请求', async (eventName) => {
    detach = store.attachLifecycle();
    holdPuts();
    const pending = store.enqueue(photos(30));
    await vi.advanceTimersByTimeAsync(50);
    expect(put).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new Event(eventName));
    await finish(pending);
    expect(store.progress).toBeNull();
    expect(store.remaining).toBe(0);
    expect(store.checking).toBe(false);
    expect(post.mock.calls.filter(([url]) => url.endsWith('/confirmUpload'))).toHaveLength(0);
  });

  it('退出提醒仅在有未完成文件时生效，取消提醒不丢失队列', async () => {
    detach = store.attachLifecycle();
    const pending = store.enqueue(photos(1));
    const blocked = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    expect(store.checking).toBe(true);
    await finish(pending);
    const complete = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(complete);
    expect(complete.defaultPrevented).toBe(false);
    expect(store.progress?.success).toBe(1);
  });

  it('检查名称期间切换账号，忽略旧响应并清除折叠与错误状态', async () => {
    let resolve: (value: any) => void = () => {};
    post.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = store.enqueue(photos(1));
    await vi.advanceTimersByTimeAsync(50);
    store.collapsed = true;
    fixture.user.id = 'different-owner';
    resolve({ status: 200, data: { check: [], allNames: [] }, msg: '' });
    await finish(pending);
    expect(store.progress).toBeNull();
    expect(store.collapsed).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });
});
