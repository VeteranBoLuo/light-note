import { describe, expect, it } from 'vitest';
import {
  createShareToken,
  getFileShareState,
  hashShareAccessCode,
  hashShareToken,
  normalizeFileShareInput,
  verifyShareAccessCode,
} from './fileSharePolicy.js';

describe('file share policy', () => {
  it('creates URL-safe opaque tokens and only exposes their hash for storage', () => {
    const token = createShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(hashShareToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken(token)).not.toContain(token);
  });

  it('hashes and verifies access codes without storing the original code', () => {
    const encoded = hashShareAccessCode('A12345');
    expect(encoded).not.toContain('A12345');
    expect(verifyShareAccessCode('A12345', encoded)).toBe(true);
    expect(verifyShareAccessCode('A12346', encoded)).toBe(false);
  });

  it('defaults to seven days and validates limits and access code shape', () => {
    expect(normalizeFileShareInput({})).toMatchObject({
      expiresInDays: 7,
      maxAccessCount: null,
      maxDownloadCount: null,
    });
    expect(() => normalizeFileShareInput({ expiresInDays: 365 })).toThrow('SHARE_EXPIRY_INVALID');
    expect(() => normalizeFileShareInput({ accessCode: '12' })).toThrow('SHARE_ACCESS_CODE_INVALID');
    expect(() => normalizeFileShareInput({ maxDownloadCount: 0 })).toThrow('SHARE_DOWNLOAD_LIMIT_INVALID');
  });

  it('distinguishes revoked, expired, deleted and exhausted shares', () => {
    const active = {
      status: 'active',
      revoked_at: null,
      file_del_flag: 0,
      expires_at: new Date(Date.now() + 60_000),
      access_count: 0,
      max_access_count: null,
      download_count: 0,
      max_download_count: null,
    };
    expect(getFileShareState(active)).toBe('active');
    expect(getFileShareState({ ...active, status: 'revoked' })).toBe('revoked');
    expect(getFileShareState({ ...active, expires_at: new Date(Date.now() - 1) })).toBe('expired');
    expect(getFileShareState({ ...active, file_del_flag: 1 })).toBe('file_unavailable');
    expect(getFileShareState({ ...active, max_access_count: 1, access_count: 1 })).toBe('access_limit_reached');
    expect(getFileShareState({ ...active, max_download_count: 2, download_count: 2 })).toBe(
      'download_limit_reached',
    );
  });
});
