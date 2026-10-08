import { describe, expect, it, vi } from 'vitest';

const { deriveScrypt } = vi.hoisted(() => ({ deriveScrypt: vi.fn() }));
vi.mock('./asyncScrypt.js', () => ({ deriveScrypt }));
const { verifyShareAccessCode } = await import('./sharePolicy.js');

describe('share code calculation failures', () => {
  it('does not report a full hash queue as an incorrect access code', async () => {
    const busy = Object.assign(new Error('busy'), { code: 'SCRYPT_BUSY' });
    deriveScrypt.mockRejectedValueOnce(busy);
    await expect(verifyShareAccessCode('1234', 'scrypt$c2FsdA$aGFzaA')).rejects.toBe(busy);
  });

  it('continues rejecting malformed stored hashes', async () => {
    deriveScrypt.mockRejectedValueOnce(new RangeError('invalid hash'));
    await expect(verifyShareAccessCode('1234', 'scrypt$c2FsdA$aGFzaA')).resolves.toBe(false);
  });
});
