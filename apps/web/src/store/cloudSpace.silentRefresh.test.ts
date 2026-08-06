import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const apiQueryPost = vi.fn();
const apiBasePost = vi.fn();

vi.mock('@/http/request.ts', () => ({
  apiQueryPost: (...args: unknown[]) => apiQueryPost(...args),
  apiBasePost: (...args: unknown[]) => apiBasePost(...args),
}));

import cloudSpaceStore from './cloudSpace';

const file = (id: string) => ({ id, fileName: `${id}.txt` });

beforeEach(() => {
  setActivePinia(createPinia());
  apiQueryPost.mockReset();
  apiBasePost.mockReset();
  apiBasePost.mockResolvedValue({ status: 200, data: { totalSizeMB: 10, quotaMB: 100 } });
});

describe('queryFieldList 的静默模式', () => {
  it('静默刷新不进 loading，页面因此不闪骨架屏', async () => {
    const cloud = cloudSpaceStore();
    let loadingDuringRequest: boolean | null = null;
    apiQueryPost.mockImplementation(() => {
      loadingDuringRequest = cloud.loading;
      return Promise.resolve({ status: 200, data: { items: [file('a')], page: 1, total: 1, hasMore: false } });
    });

    await cloud.queryFieldList({ silent: true });

    expect(loadingDuringRequest).toBe(false);
    expect(cloud.fileList).toEqual([file('a')]);
  });

  it('不传 silent 时仍走 loading，保持原有骨架行为', async () => {
    const cloud = cloudSpaceStore();
    let loadingDuringRequest: boolean | null = null;
    apiQueryPost.mockImplementation(() => {
      loadingDuringRequest = cloud.loading;
      return Promise.resolve({ status: 200, data: { items: [], page: 1, total: 0, hasMore: false } });
    });

    await cloud.queryFieldList();

    expect(loadingDuringRequest).toBe(true);
    expect(cloud.loading).toBe(false);
  });

  it('静默刷新失败时保留旧文件列表', async () => {
    const cloud = cloudSpaceStore();
    apiQueryPost.mockResolvedValueOnce({ status: 200, data: { items: [file('a'), file('b')], page: 1, total: 2 } });
    await cloud.queryFieldList();
    expect(cloud.fileList).toHaveLength(2);

    apiQueryPost.mockResolvedValueOnce({ status: 500, data: null });
    const ok = await cloud.queryFieldList({ silent: true });

    expect(ok).toBe(false);
    expect(cloud.fileList).toHaveLength(2);
  });
});

describe('getUsedSpace / queryFolder 可等待且失败不清空', () => {
  it('成功时返回 true 并写入用量', async () => {
    const cloud = cloudSpaceStore();
    apiBasePost.mockResolvedValueOnce({ status: 200, data: { totalSizeMB: 42, quotaMB: 512 } });

    await expect(cloud.getUsedSpace()).resolves.toBe(true);
    expect(cloud.usedSpace).toBe(42);
    expect(cloud.maxSpace).toBe(512);
  });

  it('用量请求失败时保留上一次的值，不写成 0', async () => {
    const cloud = cloudSpaceStore();
    apiBasePost.mockResolvedValueOnce({ status: 200, data: { totalSizeMB: 42 } });
    await cloud.getUsedSpace();

    apiBasePost.mockRejectedValueOnce(new Error('network'));
    await expect(cloud.getUsedSpace()).resolves.toBe(false);
    expect(cloud.usedSpace).toBe(42);
  });

  it('文件夹成功时返回 true，失败时保留旧文件夹', async () => {
    const cloud = cloudSpaceStore();
    apiQueryPost.mockResolvedValueOnce({ status: 200, data: { items: [{ id: 'f1', folderName: '文档' }] } });
    await expect(cloud.queryFolder()).resolves.toBe(true);
    expect(cloud.folderList).toHaveLength(1);

    apiQueryPost.mockResolvedValueOnce({ status: 500, data: null });
    await expect(cloud.queryFolder()).resolves.toBe(false);
    expect(cloud.folderList).toHaveLength(1);
  });
});

describe('账号身份切换', () => {
  it('立即清空账号归属数据并进入加载态', () => {
    const cloud = cloudSpaceStore();
    cloud.fileList = [file('guest')] as any;
    cloud.folderList = [{ id: 'guest-folder', name: '游客文件夹' }];
    cloud.usedSpace = 42;
    cloud.fileTotal = 1;

    cloud.reset({ showLoading: true });

    expect(cloud.fileList).toEqual([]);
    expect(cloud.folderList).toEqual([]);
    expect(cloud.usedSpace).toBe(0);
    expect(cloud.fileTotal).toBe(0);
    expect(cloud.folder?.id).toBe('all');
    expect(cloud.loading).toBe(true);
    expect(cloud.folderLoading).toBe(true);
  });

  it('忽略身份切换前尚未返回的文件夹和空间用量响应', async () => {
    const cloud = cloudSpaceStore();
    let resolveFolder!: (value: any) => void;
    let resolveSpace!: (value: any) => void;
    apiQueryPost.mockReturnValueOnce(new Promise((resolve) => (resolveFolder = resolve)));
    apiBasePost.mockReturnValueOnce(new Promise((resolve) => (resolveSpace = resolve)));

    const folderRequest = cloud.queryFolder();
    const spaceRequest = cloud.getUsedSpace();
    cloud.reset({ showLoading: true });
    resolveFolder({ status: 200, data: { items: [{ id: 'guest-folder', name: '游客文件夹' }] } });
    resolveSpace({ status: 200, data: { totalSizeMB: 42, quotaMB: 100 } });

    await expect(folderRequest).resolves.toBe(false);
    await expect(spaceRequest).resolves.toBe(false);
    expect(cloud.folderList).toEqual([]);
    expect(cloud.usedSpace).toBe(0);
    expect(cloud.folderLoading).toBe(true);
  });

  it('忽略身份切换前尚未返回的文件列表响应', async () => {
    const cloud = cloudSpaceStore();
    let resolveFiles!: (value: any) => void;
    apiQueryPost.mockReturnValueOnce(new Promise((resolve) => (resolveFiles = resolve)));

    const fileRequest = cloud.queryFieldList();
    cloud.reset({ showLoading: true });
    resolveFiles({
      status: 200,
      data: { items: [file('guest')], page: 1, total: 1, hasMore: false },
    });

    await expect(fileRequest).resolves.toBe(false);
    expect(cloud.fileList).toEqual([]);
    expect(cloud.loading).toBe(true);
  });
});
