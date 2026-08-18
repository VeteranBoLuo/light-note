import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMocks = vi.hoisted(() => ({ get: vi.fn(), setEx: vi.fn() }));
vi.mock('./redisClient.js', () => ({ default: redisMocks }));

const { issueNoteShareTicket, readNoteShareTicket } = await import('./noteShareTicket.js');

describe('note share ticket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.setEx.mockResolvedValue('OK');
  });

  it('Redis 键只保存随机票据摘要，值绑定分享、根页面、owner 与范围', async () => {
    const ticket = await issueNoteShareTicket({
      shareId: 'share-1',
      rootNoteId: 'root-1',
      ownerUserId: 'user-1',
      scopeType: 'subtree',
    });

    expect(ticket.token).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
    expect(ticket.expiresIn).toBe(30 * 60);
    expect(redisMocks.setEx).toHaveBeenCalledWith(
      expect.stringMatching(/^note-share:session:[a-f0-9]{64}$/u),
      30 * 60,
      JSON.stringify({ shareId: 'share-1', rootNoteId: 'root-1', ownerUserId: 'user-1', scopeType: 'subtree' }),
    );
    expect(redisMocks.setEx.mock.calls[0][0]).not.toContain(ticket.token);
  });

  it('拒绝畸形、不完整与未知范围票据', async () => {
    await expect(readNoteShareTicket('short')).resolves.toBeNull();
    expect(redisMocks.get).not.toHaveBeenCalled();

    redisMocks.get
      .mockResolvedValueOnce('{bad json')
      .mockResolvedValueOnce(JSON.stringify({ shareId: 'share-1', rootNoteId: 'root-1' }))
      .mockResolvedValueOnce(
        JSON.stringify({ shareId: 'share-1', rootNoteId: 'root-1', ownerUserId: 'user-1', scopeType: 'all' }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ shareId: 'share-1', rootNoteId: 'root-1', ownerUserId: 'user-1', scopeType: 'single' }),
      );

    await expect(readNoteShareTicket('a'.repeat(43))).resolves.toBeNull();
    await expect(readNoteShareTicket('b'.repeat(43))).resolves.toBeNull();
    await expect(readNoteShareTicket('c'.repeat(43))).resolves.toBeNull();
    await expect(readNoteShareTicket('d'.repeat(43))).resolves.toEqual({
      shareId: 'share-1',
      rootNoteId: 'root-1',
      ownerUserId: 'user-1',
      scopeType: 'single',
    });
  });
});
