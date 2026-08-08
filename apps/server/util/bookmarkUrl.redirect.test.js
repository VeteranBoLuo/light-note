import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkUrlLiveness: vi.fn(),
}));

vi.mock('./fetchWebMeta.js', () => ({
  checkUrlLiveness: mocks.checkUrlLiveness,
}));

const { resolveBookmarkUrlForClient } = await import('./bookmarkUrl.js');

describe('resolveBookmarkUrlForClient redirect target', () => {
  beforeEach(() => {
    mocks.checkUrlLiveness.mockReset();
  });

  it('直接保存短链时使用探活阶段解析出的真实地址', async () => {
    const resolvedUrl =
      'https://www.xiaohongshu.com/explore/6a753a7c00000000050305b0?xsec_token=token&xsec_source=app_share';
    mocks.checkUrlLiveness.mockResolvedValue({ status: 'alive', code: 200, resolvedUrl });

    await expect(
      resolveBookmarkUrlForClient('http://xhslink.cn/o/7rNw5RKnE8e', { checkLiveness: true }),
    ).resolves.toMatchObject({
      state: 'normalized',
      canonicalUrl: resolvedUrl,
      redirectedFrom: 'https://xhslink.cn/o/7rNw5RKnE8e',
      liveness: { status: 'alive', code: 200, resolvedUrl },
    });
  });
});
