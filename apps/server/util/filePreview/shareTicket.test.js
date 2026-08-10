import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMocks = vi.hoisted(() => ({ get: vi.fn(), setEx: vi.fn() }));

vi.mock('../redisClient.js', () => ({ default: redisMocks }));

const { issueFilePreviewShareTicket, readFilePreviewShareTicket } = await import('./shareTicket.js');

describe('file preview share ticket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.setEx.mockResolvedValue('OK');
  });

  it('stores only a digest key and a short-lived scoped payload', async () => {
    const ticket = await issueFilePreviewShareTicket({
      shareId: 'share-1',
      fileId: 42,
      ownerUserId: 'user-1',
    });

    expect(ticket.token).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
    expect(ticket.expiresIn).toBe(15 * 60);
    expect(redisMocks.setEx).toHaveBeenCalledWith(
      expect.stringMatching(/^file-preview:share-ticket:[a-f0-9]{64}$/u),
      15 * 60,
      JSON.stringify({ shareId: 'share-1', fileId: '42', ownerUserId: 'user-1' }),
    );
    expect(redisMocks.setEx.mock.calls[0][0]).not.toContain(ticket.token);
  });

  it('rejects malformed tokens without reading Redis and parses a valid scoped ticket', async () => {
    await expect(readFilePreviewShareTicket('short')).resolves.toBeNull();
    expect(redisMocks.get).not.toHaveBeenCalled();

    redisMocks.get.mockResolvedValueOnce(
      JSON.stringify({ shareId: 'share-1', fileId: '42', ownerUserId: 'user-1' }),
    );
    await expect(readFilePreviewShareTicket('x'.repeat(43))).resolves.toEqual({
      shareId: 'share-1',
      fileId: '42',
      ownerUserId: 'user-1',
    });
  });

  it('treats missing, malformed, or incomplete Redis values as expired tickets', async () => {
    redisMocks.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('{bad json')
      .mockResolvedValueOnce(JSON.stringify({ shareId: 'share-1' }));

    await expect(readFilePreviewShareTicket('a'.repeat(43))).resolves.toBeNull();
    await expect(readFilePreviewShareTicket('b'.repeat(43))).resolves.toBeNull();
    await expect(readFilePreviewShareTicket('c'.repeat(43))).resolves.toBeNull();
  });
});
