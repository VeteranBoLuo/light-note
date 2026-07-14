import { beforeEach, describe, expect, it, vi } from 'vitest';

const createBookmarkService = vi.fn();
vi.mock('../../services/bookmarkService.js', () => ({ createBookmark: createBookmarkService }));

const { default: createBookmarkTool } = await import('./create_bookmark.js');

describe('Agent create_bookmark', () => {
  beforeEach(() => vi.clearAllMocks());

  it('把确认后的参数和请求上下文交给共享业务 Service', async () => {
    createBookmarkService.mockResolvedValue({
      id: 'bookmark-1',
      name: 'Example',
      url: 'https://example.com',
      tags: ['资料'],
    });
    const request = { headers: { fingerprint: 'fp' } };
    const result = await createBookmarkTool.execute(
      { url: 'example.com', name: 'Example', description: 'desc', tags: ['资料'] },
      { userId: 'user-1', userRole: 'user', request, suppressUserRewards: false },
    );

    expect(createBookmarkService).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        userRole: 'user',
        tagNames: ['资料'],
        tagSource: 'agent',
        fillMetadata: true,
        request,
      }),
    );
    expect(result).toMatchObject({ id: 'bookmark-1', tags: ['资料'] });
  });

  it('共享 Service 失败时不吞掉错误', async () => {
    createBookmarkService.mockRejectedValueOnce(new Error('tag insert failed'));
    await expect(
      createBookmarkTool.execute({ url: 'https://example.com', tags: ['资料'] }, { userId: 'user-1' }),
    ).rejects.toThrow('tag insert failed');
  });
});
