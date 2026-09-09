import { describe, it, expect, vi } from 'vitest';
import { assertNoteImportSchema, waitForNoteImportSchema } from './runtime.js';

const missing = (code) => Object.assign(new Error('private SQL details'), { code });

describe('note import startup schema gate', () => {
  it('checks both tables without reading task data', async () => {
    const db = { query: vi.fn().mockResolvedValue([[]]) };
    await assertNoteImportSchema(db);
    expect(db.query).toHaveBeenCalledTimes(2);
    for (const [sql] of db.query.mock.calls) expect(sql).toMatch(/^SELECT .+ LIMIT 0$/);
  });

  it.each(['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'])(
    'waits locally for %s and resumes after migration',
    async (code) => {
      const db = { query: vi.fn().mockRejectedValueOnce(missing(code)).mockResolvedValue([[]]) };
      const warn = vi.fn();
      const pause = vi.fn().mockResolvedValue();
      expect(await waitForNoteImportSchema(db, { env: { LIGHTNOTE_RUNTIME_ENV: 'local' }, warn, pause })).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).not.toContain('private SQL');
      expect(pause).toHaveBeenCalledTimes(30);
      expect(db.query).toHaveBeenCalledTimes(3);
    },
  );

  it('does not treat the task table alone as ready', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockRejectedValueOnce(missing('ER_NO_SUCH_TABLE'))
        .mockResolvedValue([[]]),
    };
    await waitForNoteImportSchema(db, { env: { LIGHTNOTE_RUNTIME_ENV: 'local' }, warn: vi.fn(), pause: vi.fn() });
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  it('keeps production strict', async () => {
    const error = missing('ER_NO_SUCH_TABLE');
    await expect(
      waitForNoteImportSchema(
        { query: vi.fn().mockRejectedValue(error) },
        { env: { LIGHTNOTE_RUNTIME_ENV: 'production' } },
      ),
    ).rejects.toBe(error);
  });

  it('does not hide connection failures locally', async () => {
    const error = missing('ECONNREFUSED');
    await expect(
      waitForNoteImportSchema({ query: vi.fn().mockRejectedValue(error) }, { env: { LIGHTNOTE_RUNTIME_ENV: 'local' } }),
    ).rejects.toBe(error);
  });

  it('can stop while schema is missing without becoming ready', async () => {
    let stopping = false;
    const db = { query: vi.fn().mockRejectedValue(missing('ER_NO_SUCH_TABLE')) };
    const pause = vi.fn(async () => {
      stopping = true;
    });
    expect(
      await waitForNoteImportSchema(db, {
        env: { LIGHTNOTE_RUNTIME_ENV: 'local' },
        isStopping: () => stopping,
        pause,
        warn: vi.fn(),
      }),
    ).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
