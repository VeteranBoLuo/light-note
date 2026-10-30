import { describe, expect, it } from 'vitest';
import { preserveDataBackupPreference } from './preferences.js';

describe('preserveDataBackupPreference', () => {
  const saved = { theme: 'night', dataBackup: { at: '2026-10-30T06:20:00.000Z', total: 312, count: 2 } };

  it('keeps the server-recorded backup when an older client saves its whole preference object', () => {
    const next = JSON.parse(preserveDataBackupPreference(JSON.stringify({ theme: 'day' }), JSON.stringify(saved)));
    expect(next).toEqual({ theme: 'day', dataBackup: saved.dataBackup });
  });

  it('does not let a client invent or rewrite the backup record', () => {
    const forged = { theme: 'day', dataBackup: { at: '2099-01-01T00:00:00.000Z', count: 99 } };
    expect(JSON.parse(preserveDataBackupPreference(forged, { theme: 'day' }))).toEqual({ theme: 'day' });
    expect(JSON.parse(preserveDataBackupPreference(forged, saved)).dataBackup).toEqual(saved.dataBackup);
  });

  it('tolerates malformed stored preferences', () => {
    expect(JSON.parse(preserveDataBackupPreference('{"lang":"en-US"}', 'not json'))).toEqual({ lang: 'en-US' });
  });
});
