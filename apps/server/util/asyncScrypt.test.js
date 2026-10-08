import { beforeEach, describe, expect, it, vi } from 'vitest';

const scrypt = vi.hoisted(() => vi.fn());
vi.mock('node:crypto', () => ({ scrypt }));

describe('bounded scrypt scheduling', () => {
  beforeEach(() => {
    vi.resetModules();
    scrypt.mockReset();
  });

  it('limits active work and hands capacity to queued work after failures', async () => {
    const { deriveScrypt } = await import('./asyncScrypt.js');
    const work = Array.from({ length: 3 }, () => deriveScrypt('synthetic', 'salt', 32));
    const results = Promise.allSettled(work);
    expect(scrypt).toHaveBeenCalledTimes(2);
    scrypt.mock.calls[0][3](new Error('synthetic failure'));
    expect(scrypt).toHaveBeenCalledTimes(3);
    scrypt.mock.calls[1][3](null, Buffer.from('a'));
    scrypt.mock.calls[2][3](null, Buffer.from('b'));
    expect((await results).map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
  });

  it('bounds the waiting queue and recovers from synchronous argument errors', async () => {
    const { deriveScrypt } = await import('./asyncScrypt.js');
    scrypt.mockImplementationOnce(() => {
      throw new TypeError('invalid argument');
    });
    await expect(deriveScrypt(null, 'salt', 32)).rejects.toThrow('invalid argument');
    const work = Array.from({ length: 130 }, () => deriveScrypt('synthetic', 'salt', 32));
    await expect(deriveScrypt('overflow', 'salt', 32)).rejects.toMatchObject({ code: 'SCRYPT_BUSY' });
    for (let i = 1; i <= 130; i += 1) scrypt.mock.calls[i][3](null, Buffer.alloc(32));
    await Promise.all(work);
  });
});
