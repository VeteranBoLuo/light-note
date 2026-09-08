import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ocrUsageDate, reserveFreeOcr, settleFreeOcr, executeFreeOcr, FREE_OCR_POLICY } from './freeOcr.js';

const mocks = vi.hoisted(() => ({ read: vi.fn(), image: vi.fn(), pdf: vi.fn(), parse: vi.fn() }));
vi.mock('../obsClient.js', () => ({ getObjectBufferFromObs: mocks.read }));
vi.mock('../aiDocument/localOcr.js', () => ({
  localOcrProvider: { recognizeImage: mocks.image, recognizePdf: mocks.pdf },
}));
vi.mock('../aiDocument/parser.js', () => ({ parseDocumentBuffer: mocks.parse, validateDocumentDescriptor: vi.fn() }));

describe('free OCR quota', () => {
  it('uses Beijing midnight and bounded non-financial usage', () => {
    expect(ocrUsageDate(new Date('2026-09-07T15:59:59Z'))).toBe('2026-09-07');
    expect(ocrUsageDate(new Date('2026-09-07T16:00:00Z'))).toBe('2026-09-08');
    expect(FREE_OCR_POLICY).toMatchObject({ maxPages: 20, dailyPages: 50, activeJobs: 1 });
  });
  it('rejects another active job before reserving usage', async () => {
    const connection = { query: vi.fn().mockResolvedValue([[{ id: 'active' }]]) };
    await expect(reserveFreeOcr(connection, 'owner', 'new', [])).rejects.toMatchObject({ code: 'TOOLBOX_OCR_BUSY' });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });
  it('cached content does not reserve pages or touch a financial ledger', async () => {
    const connection = {
      query: vi.fn(async (sql) => {
        if (sql.includes('SELECT * FROM toolbox_ocr_usage')) return [[{ used_pages: 50, reserved_pages: 0 }]];
        if (sql.includes('SELECT input.result_json')) return [[{ result_json: { text: 'cached' } }]];
        return [[]];
      }),
    };
    await reserveFreeOcr(connection, 'owner', 'job', [{ descriptor: { id: 'source' }, hash: 'hash', pages: 10 }]);
    const update = connection.query.mock.calls.find(([sql]) => sql.includes('reserved_pages = reserved_pages +'));
    expect(update[1][0]).toBe(0);
    expect(connection.query.mock.calls.every(([sql]) => !/user_growth|points_economy|ai_execution/.test(sql))).toBe(
      true,
    );
  });
  it('releases unprocessed pages and charges attempted pages once', async () => {
    const row = { pages: 20, attempted_pages: 3, usage_date: '2026-09-07', input_index: 0 };
    const connection = {
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT')) return [[{ ...row }]];
        if (sql.startsWith('UPDATE toolbox_ocr_inputs')) row.pages = 0;
        return [{ affectedRows: 1 }];
      }),
    };
    await settleFreeOcr(connection, { id: 'job', user_id: 'owner' });
    await settleFreeOcr(connection, { id: 'job', user_id: 'owner' });
    const updates = connection.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE toolbox_ocr_usage'));
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toEqual([20, 3, 'owner', '2026-09-07']);
  });
});

describe('free OCR execution', () => {
  it('does not expose cached text after the source is removed or inaccessible', async () => {
    mocks.read.mockClear();
    const database = {
      query: vi.fn(async (sql) =>
        sql.includes('FROM toolbox_ocr_inputs')
          ? [[{ source_json: { kind: 'file', id: 'removed', object_key: 'private' }, result_json: { text: 'cached' } }]]
          : [[]],
      ),
    };
    await expect(executeFreeOcr({ id: 'job', user_id: 'owner' }, database)).rejects.toMatchObject({
      code: 'TOOLBOX_RESOURCE_UNAVAILABLE',
    });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(database.query.mock.calls[1][1]).toEqual(['removed', 'owner']);
  });
  it('forces the local image engine and marks the page before recognition, without a financial operation', async () => {
    const buffer = Buffer.from('test image');
    mocks.read.mockResolvedValue(buffer);
    const calls = [];
    mocks.image.mockImplementation(async () => {
      calls.push('recognize');
      return 'recognized';
    });
    mocks.parse.mockImplementation(async (data, descriptor, options) => {
      await options.ocrProvider.recognizeImage(data, {});
      return { text: 'recognized', coverage: { complete: true } };
    });
    const database = {
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT'))
          return [
            [
              {
                input_index: 0,
                source_json: { kind: 'file', id: 'file', file_name: 'test.png' },
                content_hash: crypto.createHash('sha256').update(buffer).digest('hex'),
              },
            ],
          ];
        if (sql.includes('attempted_pages')) calls.push('mark');
        return [{ affectedRows: 1 }];
      }),
    };
    const result = await executeFreeOcr({ id: 'job', user_id: 'owner', locked_by: 'lease' }, database);
    expect(calls).toEqual(['mark', 'recognize']);
    expect(result.outcome).toBe('succeeded');
    expect(database.query.mock.calls.every(([sql]) => !/points|ai_execution|user_growth/.test(sql))).toBe(true);
  });
  it('stops before recognition when cancellation or a lost lease prevents marking', async () => {
    const buffer = Buffer.from('test image');
    mocks.read.mockResolvedValue(buffer);
    mocks.image.mockClear();
    mocks.parse.mockImplementation(async (data, descriptor, options) => options.ocrProvider.recognizeImage(data, {}));
    const database = {
      query: vi.fn(async (sql) =>
        sql.startsWith('SELECT')
          ? [
              [
                {
                  input_index: 0,
                  source_json: { file_name: 'test.png' },
                  content_hash: crypto.createHash('sha256').update(buffer).digest('hex'),
                },
              ],
            ]
          : [{ affectedRows: 0 }],
      ),
    };
    await expect(executeFreeOcr({ id: 'job', user_id: 'owner', locked_by: 'old' }, database)).rejects.toMatchObject({
      code: 'TOOLBOX_JOB_LEASE_LOST',
    });
    expect(mocks.image).not.toHaveBeenCalled();
  });
  it('does not overwrite a newer attempt after losing the lease during recognition', async () => {
    const buffer = Buffer.from('test image');
    mocks.read.mockResolvedValue(buffer);
    mocks.parse.mockResolvedValue({ text: 'recognized', coverage: { complete: true } });
    const database = {
      query: vi.fn(async (sql) =>
        sql.startsWith('SELECT')
          ? [
              [
                {
                  input_index: 0,
                  source_json: { kind: 'file', id: 'file', file_name: 'test.png' },
                  content_hash: crypto.createHash('sha256').update(buffer).digest('hex'),
                },
              ],
            ]
          : [{ affectedRows: 0 }],
      ),
    };
    await expect(executeFreeOcr({ id: 'job', user_id: 'owner', locked_by: 'old' }, database)).rejects.toMatchObject({
      code: 'TOOLBOX_JOB_LEASE_LOST',
    });
    const writes = database.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'));
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain('job.locked_by = ?');
    expect(writes[0][1].at(-1)).toBe('old');
  });
});
