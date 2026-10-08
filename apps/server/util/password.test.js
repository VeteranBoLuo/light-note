import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';
import { hashShareAccessCode, verifyShareAccessCode } from './sharePolicy.js';

describe('asynchronous credential derivation', () => {
  it('reads historical scrypt hashes and preserves the stored format', async () => {
    const salt = Buffer.alloc(16, 7);
    const legacy = `${salt.toString('hex')}:${crypto.scryptSync('synthetic-password', salt, 64).toString('hex')}`;
    expect(await verifyPassword('synthetic-password', legacy)).toBe(true);
    expect(await verifyPassword('wrong', legacy)).toBe(false);
    const next = await hashPassword('synthetic-password');
    expect(next).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(await verifyPassword('synthetic-password', next)).toBe(true);
    expect(await verifyPassword('old-plain', 'old-plain')).toBe(true);
    expect(await verifyPassword('wrong', 'old-plain')).toBe(false);
    expect(await verifyPassword('', '')).toBe(false);
  });

  it('keeps share code compatibility, including absent and invalid codes', async () => {
    const salt = Buffer.alloc(16, 9);
    const legacy = `scrypt$${salt.toString('base64url')}$${crypto.scryptSync('A12345', salt, 32).toString('base64url')}`;
    expect(await verifyShareAccessCode(' A12345 ', legacy)).toBe(true);
    expect(await verifyShareAccessCode('wrong', legacy)).toBe(false);
    expect(await verifyShareAccessCode('', null)).toBe(true);
    expect(await verifyShareAccessCode('A12345', 'invalid')).toBe(false);
    expect(await hashShareAccessCode('')).toBeNull();
  });

  it('allows event-loop work while hashes are pending', async () => {
    let completed = false;
    const work = Promise.all(Array.from({ length: 8 }, () => hashPassword('synthetic-password'))).then(() => {
      completed = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(completed).toBe(false);
    await work;
  });
});
