import { describe, expect, it, vi } from 'vitest';
import { canReadAdminNoteImage, canReadNoteImage, noteImageFileName } from './noteImageAccess.js';

describe('managed note original access', () => {
  it('honors upload registrations and falls back to an owned historical asset', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ allowed: 1 }]]) };
    const fileName = 'note-history.png';
    expect(await canReadNoteImage({ db, userId: 'owner', fileName })).toBe(true);
    expect(db.query).toHaveBeenLastCalledWith(expect.stringContaining('image_assets'), ['owner', fileName]);
  });

  it('denies an original when the stored owner is distinct or ambiguous', async () => {
    const db = { query: vi.fn() };
    for (const rows of [[{ owner: 'other' }], [{ owner: 'owner' }, { owner: 'other' }]]) {
      db.query.mockResolvedValueOnce([rows]);
      expect(await canReadNoteImage({ db, userId: 'owner', fileName: 'note-fixture.png' })).toBe(false);
    }
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('maps only the supported same-site note originals', () => {
    expect(noteImageFileName('/uploads/note-sample.webp')).toBe('note-sample.webp');
    expect(noteImageFileName('/uploads/bookmark-fixture.png')).toBe('');
    expect(noteImageFileName('https://example.com/uploads/note-sample.webp')).toBe('');
  });

  it('rechecks that a native preview image grant belongs to the current root session', async () => {
    const id = '3f63a2e4-fcc2-4094-b2bf-198c7ca533a1';
    const req = {
      user: { id: 'actor', role: 'root', sessionId: 'sid-now' },
      headers: { cookie: `ln-note-preview-${id}=${'a'.repeat(64)}` },
      get: (name) => name === 'Sec-Fetch-Site' ? 'same-origin' : 'image',
    };
    const context = { id, actorUserId: 'actor', actorSessionId: 'sid-now', subjectUserId: 'subject', expiresAt: '2100-01-01' };
    const readContext = vi.fn();
    const db = { query: vi.fn() };
    const args = { db, req, fileName: 'note-preview.png', readContext };
    for (const revoked of [null, { ...context, expiresAt: '2000-01-01' }, { ...context, actorSessionId: 'sid-old' }]) {
      readContext.mockResolvedValueOnce(revoked);
      expect(await canReadAdminNoteImage(args)).toBe(false);
    }
    expect(db.query).not.toHaveBeenCalled();
    readContext.mockResolvedValueOnce(context);
    db.query.mockResolvedValueOnce([[{ id: 'subject' }]]).mockResolvedValueOnce([[{ owner: 'subject' }]]);
    expect(await canReadAdminNoteImage(args)).toBe(true);
    req.get = () => 'document';
    expect(await canReadAdminNoteImage(args)).toBe(false);
  });
});
