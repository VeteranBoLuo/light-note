import { describe, expect, it } from 'vitest';
import { getNoteShareState, normalizeNoteShareInput } from './noteSharePolicy.js';

describe('note share policy', () => {
  it('默认单篇分享 7 天，并校验范围、访问码与访问次数', () => {
    expect(normalizeNoteShareInput({})).toEqual({
      scopeType: 'single',
      description: '',
      accessCode: '',
      expiresInDays: 7,
      maxAccessCount: null,
    });
    expect(normalizeNoteShareInput({ scopeType: 'subtree', expiresInDays: 30, maxAccessCount: 8 })).toMatchObject({
      scopeType: 'subtree',
      expiresInDays: 30,
      maxAccessCount: 8,
    });
    expect(() => normalizeNoteShareInput({ scopeType: 'workspace' })).toThrow('NOTE_SHARE_SCOPE_INVALID');
    expect(() => normalizeNoteShareInput({ accessCode: '12' })).toThrow('SHARE_ACCESS_CODE_INVALID');
    expect(() => normalizeNoteShareInput({ maxAccessCount: 0 })).toThrow('SHARE_ACCESS_LIMIT_INVALID');
  });

  it('区分撤销、过期、根页面删除和次数耗尽，已签发会话不重复消耗次数', () => {
    const active = {
      status: 'active',
      revoked_at: null,
      root_del_flag: 0,
      expires_at: new Date(Date.now() + 60_000),
      access_count: 0,
      max_access_count: null,
    };
    expect(getNoteShareState(active)).toBe('active');
    expect(getNoteShareState({ ...active, status: 'revoked' })).toBe('revoked');
    expect(getNoteShareState({ ...active, expires_at: new Date(Date.now() - 1) })).toBe('expired');
    expect(getNoteShareState({ ...active, root_del_flag: 1 })).toBe('note_unavailable');
    expect(getNoteShareState({ ...active, max_access_count: 1, access_count: 1 })).toBe('access_limit_reached');
    expect(getNoteShareState({ ...active, max_access_count: 1, access_count: 1 }, Date.now(), 'session')).toBe(
      'active',
    );
  });
});
