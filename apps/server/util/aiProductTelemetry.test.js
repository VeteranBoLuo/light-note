import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_PRODUCT_EVENTS,
  cleanupExpiredAiProductEvents,
  normalizeAiProductEvent,
  recordAiProductEvent,
  requiresTelemetrySecret,
} from './aiProductTelemetry.js';

describe('requiresTelemetrySecret 失败关闭策略', () => {
  it('production 一律要求独立密钥', () => {
    expect(requiresTelemetrySecret('production', 'linux')).toBe(true);
    expect(requiresTelemetrySecret('production', 'darwin')).toBe(true);
  });
  it('Linux 非明确本地/测试(含漏配 NODE_ENV 的空值)必须失败关闭', () => {
    expect(requiresTelemetrySecret('', 'linux')).toBe(true); // 漏配 NODE_ENV
    expect(requiresTelemetrySecret('staging', 'linux')).toBe(true); // 未知非本地环境
  });
  it('明确的本地开发/测试环境允许回退固定盐', () => {
    expect(requiresTelemetrySecret('development', 'linux')).toBe(false);
    expect(requiresTelemetrySecret('test', 'linux')).toBe(false);
    expect(requiresTelemetrySecret('', 'darwin')).toBe(false);
  });
});

describe('AI product telemetry privacy contract', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts only enumerated no-content dimensions', () => {
    const event = normalizeAiProductEvent({
      id: '18ee8f57-5259-4adf-b7b9-40a4387434b0',
      event: 'ai_prompt_submitted',
      dimensions: {
        surface: 'search',
        mode: 'ask',
        intent: 'find',
        lengthBucket: '51_200',
        materialCount: 3,
        externalWeb: false,
        requestId: 'req_123',
      },
    });
    expect(event).toEqual({
      id: '18ee8f57-5259-4adf-b7b9-40a4387434b0',
      eventName: 'ai_prompt_submitted',
      dimensions: {
        surface: 'search',
        mode: 'ask',
        intent: 'find',
        lengthBucket: '51_200',
        materialCount: 3,
        externalWeb: false,
        requestId: expect.stringMatching(/^h_[a-f0-9]{32}$/u),
      },
    });
  });

  it.each(['bookmark_manage', 'cloud_space', 'tag_detail'])('accepts resource entry surface %s', (surface) => {
    expect(normalizeAiProductEvent({ event: 'ai_entry_opened', dimensions: { surface } }).dimensions.surface).toBe(
      surface,
    );
  });

  it.each(['query', 'title', 'content', 'excerpt', 'prompt', 'url', 'comment'])(
    'rejects content-bearing dimension %s',
    (key) => {
      expect(() => normalizeAiProductEvent({ event: 'ai_completed', dimensions: { [key]: 'private text' } })).toThrow(
        'AI_EVENT_DIMENSION_UNSUPPORTED',
      );
    },
  );

  it('rejects unsupported event names and free-form identifier text', () => {
    expect(() => normalizeAiProductEvent({ event: 'ai_arbitrary_event' })).toThrow('AI_EVENT_UNSUPPORTED');
    expect(() =>
      normalizeAiProductEvent({ event: 'ai_source_opened', dimensions: { sourceId: 'private title with spaces' } }),
    ).toThrow('AI_EVENT_DIMENSION_INVALID');
    expect(AI_PRODUCT_EVENTS.length).toBeGreaterThan(20);
  });

  it('binds actor, subject and admin context and deduplicates by event id', async () => {
    const database = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    const result = await recordAiProductEvent(
      {
        actorUserId: 'root-1',
        subjectUserId: 'user-2',
        adminContextId: 'ctx-3',
        adminContextMode: 'maintain',
      },
      {
        id: '18ee8f57-5259-4adf-b7b9-40a4387434b0',
        event: 'ai_change_succeeded',
        dimensions: { changeSetId: 'set-1', itemCount: 2, outcome: 'success' },
      },
      database,
    );
    expect(result).toEqual({ id: '18ee8f57-5259-4adf-b7b9-40a4387434b0', accepted: true });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO ai_product_events'), [
      '18ee8f57-5259-4adf-b7b9-40a4387434b0',
      'root-1',
      'user-2',
      'ctx-3',
      'maintain',
      'ai_change_succeeded',
      expect.stringContaining('"changeSetId":"h_'),
    ]);
  });

  it('hashes identifiers and buckets arbitrary client error text before persistence', () => {
    const event = normalizeAiProductEvent({
      event: 'ai_completed',
      dimensions: {
        sourceId: 'user@example.com',
        errorCode: 'my-secret-password',
      },
    });
    expect(event.dimensions.sourceId).toMatch(/^h_[a-f0-9]{32}$/u);
    expect(event.dimensions.sourceId).not.toContain('example');
    expect(event.dimensions.errorCode).toBe('UNKNOWN');
  });

  it('uses a keyed HMAC so low-entropy identifiers cannot be enumerated with a public fixed salt', () => {
    vi.stubEnv('AI_TELEMETRY_HMAC_SECRET', 'a'.repeat(32));
    const first = normalizeAiProductEvent({ event: 'ai_source_opened', dimensions: { sourceId: 'note-1' } });
    vi.stubEnv('AI_TELEMETRY_HMAC_SECRET', 'b'.repeat(32));
    const second = normalizeAiProductEvent({ event: 'ai_source_opened', dimensions: { sourceId: 'note-1' } });

    expect(first.dimensions.sourceId).toMatch(/^h_[a-f0-9]{32}$/u);
    expect(first.dimensions.sourceId).not.toBe(second.dimensions.sourceId);
  });

  it('requires a dedicated HMAC secret in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_TELEMETRY_HMAC_SECRET', '');
    expect(() => normalizeAiProductEvent({ event: 'ai_source_opened', dimensions: { sourceId: 'note-1' } })).toThrow(
      'AI_TELEMETRY_HMAC_SECRET_REQUIRED',
    );
  });

  it('treats only duplicate event ids as an idempotent no-op', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    const database = { query: vi.fn().mockRejectedValue(duplicate) };
    await expect(
      recordAiProductEvent(
        { actorUserId: 'user-1', subjectUserId: 'user-1' },
        { id: '18ee8f57-5259-4adf-b7b9-40a4387434b0', event: 'ai_completed' },
        database,
      ),
    ).resolves.toEqual({ id: '18ee8f57-5259-4adf-b7b9-40a4387434b0', accepted: false });

    database.query.mockRejectedValue(Object.assign(new Error('schema failure'), { code: 'ER_BAD_FIELD_ERROR' }));
    await expect(
      recordAiProductEvent(
        { actorUserId: 'user-1', subjectUserId: 'user-1' },
        { id: '18ee8f57-5259-4adf-b7b9-40a4387434b0', event: 'ai_completed' },
        database,
      ),
    ).rejects.toMatchObject({ code: 'ER_BAD_FIELD_ERROR' });
  });

  it('deletes product events after the bounded retention period', async () => {
    vi.stubEnv('AI_PRODUCT_EVENT_RETENTION_DAYS', '90');
    const database = { query: vi.fn().mockResolvedValue([{ affectedRows: 7 }]) };
    await expect(cleanupExpiredAiProductEvents(database)).resolves.toEqual({
      deleted: 7,
      retentionDays: 90,
      batches: 1,
      backlogRemaining: false,
    });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INTERVAL ? DAY'), [90, 10_000]);
  });

  it('drains retention backlog in bounded batches and reports when the configured cap is reached', async () => {
    const drainedDatabase = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 100 }])
        .mockResolvedValueOnce([{ affectedRows: 100 }])
        .mockResolvedValueOnce([{ affectedRows: 3 }]),
    };
    await expect(
      cleanupExpiredAiProductEvents(drainedDatabase, { batchSize: 100, maxBatches: 5 }),
    ).resolves.toMatchObject({ deleted: 203, batches: 3, backlogRemaining: false });

    const cappedDatabase = { query: vi.fn().mockResolvedValue([{ affectedRows: 100 }]) };
    await expect(
      cleanupExpiredAiProductEvents(cappedDatabase, { batchSize: 100, maxBatches: 2 }),
    ).resolves.toMatchObject({ deleted: 200, batches: 2, backlogRemaining: true });
  });
});
