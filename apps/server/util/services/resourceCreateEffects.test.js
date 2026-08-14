import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordFirstOwnResource = vi.fn();
const awardCreate = vi.fn();
const hashRef = vi.fn((value) => `hash:${value}`);
const ensureMeaningfulCreateEvent = vi.fn();
const invalidatePersonalKnowledgeCache = vi.fn();

vi.mock('../conversion.js', () => ({ recordFirstOwnResource }));
vi.mock('../growth.js', () => ({ awardCreate, hashRef }));
vi.mock('../meaningfulActivity.js', () => ({ ensureMeaningfulCreateEvent }));
vi.mock('../personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache }));

const { triggerResourceCreateEffects } = await import('./resourceCreateEffects.js');

describe('资源创建成长旁路隔离', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordFirstOwnResource.mockResolvedValue(undefined);
    awardCreate.mockResolvedValue(undefined);
    ensureMeaningfulCreateEvent.mockResolvedValue({ recorded: true });
    invalidatePersonalKnowledgeCache.mockResolvedValue(undefined);
  });

  it('有意义行为事实写入失败时仍执行既有 EXP 与成就旁路', async () => {
    ensureMeaningfulCreateEvent.mockRejectedValueOnce(new Error('fact unavailable'));

    await expect(
      triggerResourceCreateEffects({
        request: { user: { id: 'user-1' } },
        userId: 'user-1',
        userRole: 'user',
        resourceType: 'note',
        resourceId: 'note-1',
      }),
    ).resolves.toBeUndefined();

    await vi.waitFor(() => expect(awardCreate).toHaveBeenCalledOnce());
    expect(awardCreate).toHaveBeenCalledWith('user-1', 'note', 'note-1', { userRole: 'user' });
  });

  it('缓存与转化旁路同步抛错也不会阻断事实和奖励', async () => {
    invalidatePersonalKnowledgeCache.mockImplementationOnce(() => {
      throw new Error('cache failed');
    });
    recordFirstOwnResource.mockImplementationOnce(() => {
      throw new Error('conversion failed');
    });

    await triggerResourceCreateEffects({
      request: { user: { id: 'user-1' } },
      userId: 'user-1',
      userRole: 'user',
      resourceType: 'bookmark',
      resourceId: 'bookmark-1',
      url: 'https://example.com',
    });

    expect(ensureMeaningfulCreateEvent).toHaveBeenCalledWith('user-1', 'bookmark', 'hash:https://example.com');
    await vi.waitFor(() => expect(awardCreate).toHaveBeenCalledOnce());
  });

  it('管理员上下文和 suppressed 创建只失效奖励，不跳过知识缓存失效', async () => {
    await triggerResourceCreateEffects({
      request: { adminContext: { actor: 'root' } },
      userId: 'user-1',
      resourceType: 'file',
      resourceId: 'file-1',
    });
    await triggerResourceCreateEffects({
      request: {},
      userId: 'user-2',
      resourceType: 'note',
      resourceId: 'note-2',
      suppressUserRewards: true,
    });

    await vi.waitFor(() => expect(invalidatePersonalKnowledgeCache).toHaveBeenCalledTimes(2));
    expect(ensureMeaningfulCreateEvent).not.toHaveBeenCalled();
    expect(awardCreate).not.toHaveBeenCalled();
  });
});
