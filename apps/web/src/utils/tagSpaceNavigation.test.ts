// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTagSpace, fetchTagSpaces } from '@/api/tagSpace';
import {
  readLastTagSpaceId,
  rememberTagSpaceId,
  resolveRememberedTagSpaceId,
  resolveTagSpaceEntryId,
} from './tagSpaceNavigation';

vi.mock('@/api/tagSpace', () => ({
  fetchTagSpace: vi.fn(),
  fetchTagSpaces: vi.fn(),
}));

const fetchTagSpaceMock = vi.mocked(fetchTagSpace);
const fetchTagSpacesMock = vi.mocked(fetchTagSpaces);

describe('标签空间入口导航', () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchTagSpaceMock.mockReset();
    fetchTagSpacesMock.mockReset();
  });

  it('有效的上次标签在入口组件挂载前即可解析', async () => {
    rememberTagSpaceId('tag-1');
    fetchTagSpaceMock.mockResolvedValue({} as Awaited<ReturnType<typeof fetchTagSpace>>);

    await expect(resolveRememberedTagSpaceId()).resolves.toBe('tag-1');
    expect(fetchTagSpaceMock).toHaveBeenCalledWith('tag-1', 1);
  });

  it('失效的上次标签会被清除并交给最近标签回退', async () => {
    rememberTagSpaceId('missing-tag');
    fetchTagSpaceMock.mockRejectedValue(new Error('not found'));

    await expect(resolveRememberedTagSpaceId()).resolves.toBe('');
    expect(readLastTagSpaceId()).toBe('');
  });

  it('没有浏览历史时不产生详情验证请求', async () => {
    await expect(resolveRememberedTagSpaceId()).resolves.toBe('');
    expect(fetchTagSpaceMock).not.toHaveBeenCalled();
  });

  it('没有有效浏览历史时在路由提交前回退到最近标签', async () => {
    fetchTagSpacesMock.mockResolvedValue({ items: [{ id: 'recent-tag' }] } as Awaited<
      ReturnType<typeof fetchTagSpaces>
    >);

    await expect(resolveTagSpaceEntryId()).resolves.toBe('recent-tag');
    expect(fetchTagSpacesMock).toHaveBeenCalledWith({ sort: 'recent', includeEmpty: true, page: 1, pageSize: 1 });
  });

  it('存在有效浏览历史时不重复请求最近标签', async () => {
    rememberTagSpaceId('tag-1');
    fetchTagSpaceMock.mockResolvedValue({} as Awaited<ReturnType<typeof fetchTagSpace>>);

    await expect(resolveTagSpaceEntryId()).resolves.toBe('tag-1');
    expect(fetchTagSpacesMock).not.toHaveBeenCalled();
  });
});
