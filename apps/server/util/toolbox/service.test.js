import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createNote: vi.fn(),
  createTemporaryDocumentSource: vi.fn(),
  resolvePersonalKnowledgeResourceVersions: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({ default: { query: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../services/noteService.js', () => ({ createNote: mocks.createNote }));
vi.mock('../aiDocument/service.js', () => ({
  createTemporaryDocumentSource: mocks.createTemporaryDocumentSource,
}));
vi.mock('../personalKnowledgeSearch.js', () => ({
  resolvePersonalKnowledgeResourceVersions: mocks.resolvePersonalKnowledgeResourceVersions,
}));

const {
  createToolboxJob,
  createToolboxQuote,
  getToolboxArtifact,
  listToolboxHomeTasks,
  saveToolboxArtifactToNote,
  toolboxServiceInternals,
} = await import('./service.js');
const { toolboxInputDigest } = await import('./catalog.js');

describe('toolbox service boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates cloud OCR files against the same MIME and per-file size limits as uploads', async () => {
    mocks.resolvePersonalKnowledgeResourceVersions.mockResolvedValue([{ type: 'file', id: 'file-1', version: 'v1' }]);
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [{ id: 'file-1', file_name: 'scan.pdf', file_type: 'application/pdf', file_size: 1024 }],
        ]),
    };

    await expect(
      toolboxServiceInternals.resolveOwnedToolboxInput({
        userId: 'user-1',
        toolId: 'ocr_to_text',
        rawInput: { resourceRefs: [{ type: 'file', id: 'file-1' }] },
        database,
      }),
    ).resolves.toMatchObject({ itemCount: 1, totalBytes: 1024 });

    database.query.mockResolvedValueOnce([
      [{ id: 'file-1', file_name: 'scan.txt', file_type: 'text/plain', file_size: 1024 }],
    ]);
    await expect(
      toolboxServiceInternals.resolveOwnedToolboxInput({
        userId: 'user-1',
        toolId: 'ocr_to_text',
        rawInput: { resourceRefs: [{ type: 'file', id: 'file-1' }] },
        database,
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_UPLOAD_TYPE_UNSUPPORTED' });

    database.query.mockResolvedValueOnce([
      [
        {
          id: 'file-1',
          file_name: 'scan.pdf',
          file_type: 'application/pdf',
          file_size: 20 * 1024 * 1024 + 1,
        },
      ],
    ]);
    await expect(
      toolboxServiceInternals.resolveOwnedToolboxInput({
        userId: 'user-1',
        toolId: 'ocr_to_text',
        rawInput: { resourceRefs: [{ type: 'file', id: 'file-1' }] },
        database,
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_UPLOAD_TOO_LARGE', status: 413 });
  });

  it('rejects resources that are no longer owned or changed after the client snapshot', async () => {
    mocks.resolvePersonalKnowledgeResourceVersions.mockResolvedValueOnce([]);
    await expect(
      toolboxServiceInternals.resolveOwnedToolboxInput({
        userId: 'user-1',
        toolId: 'research_brief',
        rawInput: { resourceRefs: [{ type: 'note', id: 'note-1' }] },
        database: { query: vi.fn() },
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_RESOURCE_UNAVAILABLE', status: 404 });

    mocks.resolvePersonalKnowledgeResourceVersions.mockResolvedValueOnce([
      { type: 'note', id: 'note-1', version: 'version-2' },
    ]);
    await expect(
      toolboxServiceInternals.resolveOwnedToolboxInput({
        userId: 'user-1',
        toolId: 'research_brief',
        rawInput: { resourceRefs: [{ type: 'note', id: 'note-1', version: 'version-1' }] },
        database: { query: vi.fn() },
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_RESOURCE_STALE', status: 409 });
  });

  it('binds a quote to the authoritative input snapshot and replays the same request idempotently', async () => {
    const authoritative = { type: 'note', id: 'note-1', version: 'version-1' };
    mocks.resolvePersonalKnowledgeResourceVersions.mockResolvedValue([authoritative]);
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const request = {
      userId: 'user-1',
      toolId: 'research_brief',
      rawInput: { resourceRefs: [{ type: 'note', id: 'note-1' }] },
      billingMedium: 'points',
      clientRequestId: 'quote-request-1234',
      database,
    };

    const quote = await createToolboxQuote(request);
    expect(quote).toMatchObject({
      toolId: 'research_brief',
      billingMedium: 'points',
      quotedPoints: 20,
      status: 'active',
    });
    const inserted = database.query.mock.calls[1][1];
    expect(JSON.parse(inserted[7])).toEqual({
      resourceRefs: [authoritative],
      sourceIds: [],
      options: {},
    });

    const replayDatabase = {
      query: vi.fn().mockResolvedValueOnce([
        [
          {
            id: quote.id,
            request_id: request.clientRequestId,
            tool_id: request.toolId,
            pricing_version: inserted[4],
            billing_medium: inserted[5],
            input_digest: inserted[6],
            input_snapshot_json: inserted[7],
            quoted_points: 20,
            status: 'active',
            expires_at: quote.expiresAt,
          },
        ],
      ]),
    };
    await expect(createToolboxQuote({ ...request, database: replayDatabase })).resolves.toMatchObject({ id: quote.id });
    expect(replayDatabase.query).toHaveBeenCalledOnce();
  });

  it('quotes a prompt-only draft without requiring knowledge resources', async () => {
    mocks.resolvePersonalKnowledgeResourceVersions.mockResolvedValue([]);
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const quote = await createToolboxQuote({
      userId: 'user-1',
      toolId: 'idea_to_draft',
      rawInput: {
        options: {
          question: '写一篇解释个人知识库长期价值的文章，面向刚入职的产品经理',
          intent: 'article',
          detailLevel: 'detailed',
        },
      },
      billingMedium: 'points',
      clientRequestId: 'prompt-quote-1234',
      database,
    });

    expect(quote).toMatchObject({
      toolId: 'idea_to_draft',
      billingMedium: 'points',
      quotedPoints: 28,
      status: 'active',
      inputSummary: { itemCount: 0, resourceCount: 0, uploadCount: 0 },
    });
    expect(mocks.resolvePersonalKnowledgeResourceVersions).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', resourceRefs: [] }),
    );
    const inserted = database.query.mock.calls[1][1];
    expect(JSON.parse(inserted[7])).toEqual({
      resourceRefs: [],
      sourceIds: [],
      options: {
        question: '写一篇解释个人知识库长期价值的文章，面向刚入职的产品经理',
        intent: 'article',
        detailLevel: 'detailed',
      },
    });
  });

  it('quotes an AI skill with user AI quota without reserving points', async () => {
    const authoritative = { type: 'note', id: 'note-1', version: 'version-1' };
    mocks.resolvePersonalKnowledgeResourceVersions.mockResolvedValue([authoritative]);
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const quote = await createToolboxQuote({
      userId: 'user-1',
      toolId: 'research_brief',
      rawInput: { resourceRefs: [{ type: 'note', id: 'note-1' }] },
      billingMedium: 'ai_quota',
      clientRequestId: 'quota-quote-1234',
      database,
    });

    expect(quote).toMatchObject({ billingMedium: 'ai_quota', quotedPoints: 0, status: 'active' });
    expect(database.query.mock.calls[1][1][5]).toBe('ai_quota');
    expect(database.query.mock.calls[1][1][8]).toBe(0);
  });

  it('does not let an idempotency key switch from points to AI quota', async () => {
    const authoritative = { type: 'note', id: 'note-1', version: 'version-1' };
    const snapshot = { resourceRefs: [authoritative], sourceIds: [], options: {} };
    mocks.resolvePersonalKnowledgeResourceVersions.mockResolvedValue([authoritative]);
    const database = {
      query: vi.fn().mockResolvedValueOnce([
        [
          {
            id: 'quote-existing',
            request_id: 'medium-quote-1234',
            tool_id: 'research_brief',
            pricing_version: 'toolbox-billing-v2',
            billing_medium: 'points',
            input_digest: toolboxInputDigest({ toolId: 'research_brief', input: snapshot }),
            input_snapshot_json: JSON.stringify(snapshot),
            quoted_points: 20,
            status: 'active',
            expires_at: new Date(Date.now() + 60_000),
          },
        ],
      ]),
    };

    await expect(
      createToolboxQuote({
        userId: 'user-1',
        toolId: 'research_brief',
        rawInput: { resourceRefs: [{ type: 'note', id: 'note-1' }] },
        billingMedium: 'ai_quota',
        clientRequestId: 'medium-quote-1234',
        database,
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_IDEMPOTENCY_KEY_REUSED', status: 409 });
  });

  it('creates the job, points reservation and immutable input rows in one transaction', async () => {
    const snapshot = {
      resourceRefs: [{ type: 'note', id: 'note-1', version: 'version-1' }],
      sourceIds: [],
      options: { detailLevel: 'balanced' },
    };
    const quote = {
      id: 'quote-1',
      user_id: 'user-1',
      tool_id: 'research_brief',
      pricing_version: 'toolbox-billing-v2',
      billing_medium: 'points',
      input_digest: toolboxInputDigest({ toolId: 'research_brief', input: snapshot }),
      input_snapshot_json: JSON.stringify(snapshot),
      quoted_points: 20,
      status: 'active',
      expires_at: new Date(Date.now() + 60_000),
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[quote]])
        .mockResolvedValueOnce([[{ points: 100 }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 77 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      createToolboxJob({
        userId: 'user-1',
        quoteId: quote.id,
        clientRequestId: 'job-request-1234',
        database,
      }),
    ).resolves.toMatchObject({
      toolId: 'research_brief',
      status: 'queued',
      artifactState: 'none',
      billing: { status: 'reserved', quotedPoints: 20 },
    });
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.query.mock.calls[7][0]).toContain('INSERT INTO toolbox_jobs');
    expect(connection.query.mock.calls[8][0]).toContain('INSERT INTO toolbox_job_inputs');
    expect(connection.query.mock.calls[9][0]).toContain("status = 'consumed'");
  });

  it('creates an AI quota job without touching the points economy', async () => {
    const snapshot = {
      resourceRefs: [{ type: 'note', id: 'note-1', version: 'version-1' }],
      sourceIds: [],
      options: { detailLevel: 'balanced' },
    };
    const quote = {
      id: 'quote-quota-1',
      user_id: 'user-1',
      tool_id: 'research_brief',
      pricing_version: 'toolbox-billing-v2',
      billing_medium: 'ai_quota',
      input_digest: toolboxInputDigest({ toolId: 'research_brief', input: snapshot }),
      input_snapshot_json: JSON.stringify(snapshot),
      quoted_points: 0,
      status: 'active',
      expires_at: new Date(Date.now() + 60_000),
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[quote]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      createToolboxJob({
        userId: 'user-1',
        quoteId: quote.id,
        clientRequestId: 'quota-job-request-1234',
        database,
      }),
    ).resolves.toMatchObject({
      billing: { medium: 'ai_quota', status: 'quoted', quotedPoints: 0 },
      status: 'queued',
    });
    const sql = connection.query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).not.toContain('user_growth');
    expect(sql).not.toContain('points_economy_operations');
    expect(connection.query.mock.calls[2][0]).toContain('INSERT INTO toolbox_jobs');
    expect(connection.query.mock.calls[3][0]).toContain('INSERT INTO toolbox_job_inputs');
    expect(connection.query.mock.calls[4][0]).toContain("status = 'consumed'");
  });

  it('hides expired artifacts from task summaries before the hourly cleanup runs', () => {
    const base = {
      id: 'job-1',
      tool_id: 'research_brief',
      status: 'succeeded',
      progress: 100,
      stage: 'completed',
      billing_status: 'settled',
      save_status: 'unsaved',
      quoted_points: 20,
      actual_points: 20,
      external_cost_committed: 1,
      artifact_id: 'artifact-1',
      artifact_type: 'research_brief',
      artifact_title: '研究速读包',
      artifact_content_type: 'markdown',
      artifact_version: 1,
      artifact_status: 'ready',
    };

    const readyJob = toolboxServiceInternals.formatJob({
      ...base,
      artifact_expires_at: new Date(Date.now() + 60_000),
    });
    expect(readyJob).toMatchObject({ artifactState: 'ready', artifact: { id: 'artifact-1' } });
    expect(readyJob).not.toHaveProperty('progress');
    expect(toolboxServiceInternals.formatJob({ ...base, artifact_expires_at: new Date(Date.now() - 1) })).toMatchObject(
      { artifactState: 'expired', artifact: null },
    );
  });

  it('only reports refunded points after billing has reached a refund-bearing terminal state', () => {
    const base = {
      id: 'job-1',
      tool_id: 'research_brief',
      status: 'queued',
      stage: 'queued',
      save_status: 'unsaved',
      quoted_points: 20,
      actual_points: 0,
      external_cost_committed: 0,
    };

    expect(toolboxServiceInternals.formatJob({ ...base, billing_status: 'reserved' }).billing.refundedPoints).toBe(0);
    expect(toolboxServiceInternals.formatJob({ ...base, billing_status: 'released' }).billing.refundedPoints).toBe(20);
    expect(
      toolboxServiceInternals.formatJob({
        ...base,
        billing_status: 'partially_settled',
        actual_points: 12,
      }).billing.refundedPoints,
    ).toBe(8);
  });

  it('首页待继续是行动队列，最近用过是独立时间序列，且都不携带正文', async () => {
    const base = {
      tool_id: 'research_brief',
      stage: 'completed',
      billing_status: 'settled',
      save_status: 'saved',
      quoted_points: 20,
      actual_points: 20,
      external_cost_committed: 1,
      create_time: '2026-08-30T08:00:00.000Z',
      updated_at: '2026-08-30T08:00:00.000Z',
    };
    const database = {
      query: vi.fn().mockResolvedValueOnce([
        [
          {
            ...base,
            id: 'active-1',
            status: 'processing',
            stage: 'generating',
            save_status: 'unsaved',
            updated_at: '2026-08-30T06:00:00.000Z',
          },
          {
            ...base,
            id: 'active-2',
            status: 'queued',
            stage: 'queued',
            save_status: 'unsaved',
            updated_at: '2026-08-30T05:00:00.000Z',
          },
          {
            ...base,
            id: 'active-3',
            status: 'processing',
            stage: 'generating',
            save_status: 'unsaved',
            updated_at: '2026-08-30T04:00:00.000Z',
          },
          {
            ...base,
            id: 'active-4',
            status: 'queued',
            stage: 'queued',
            save_status: 'unsaved',
            updated_at: '2026-08-30T03:00:00.000Z',
          },
          {
            ...base,
            id: 'active-overflow',
            status: 'queued',
            stage: 'queued',
            save_status: 'unsaved',
            updated_at: '2026-08-30T02:00:00.000Z',
          },
          {
            ...base,
            id: 'ready-1',
            status: 'succeeded',
            save_status: 'unsaved',
            artifact_id: 'artifact-1',
            artifact_type: 'research_brief',
            artifact_title: '研究简报',
            artifact_content_type: 'markdown',
            artifact_version: 1,
            artifact_status: 'ready',
            artifact_expires_at: '2099-01-01T00:00:00.000Z',
            updated_at: '2026-08-30T09:00:00.000Z',
          },
          { ...base, id: 'recent-1', status: 'succeeded', updated_at: '2026-08-30T10:00:00.000Z' },
        ],
      ]),
    };

    const result = await listToolboxHomeTasks({ userId: 'user-1', database });

    expect(result.active.map((job) => job.id)).toEqual(['active-1', 'active-2', 'active-3', 'active-4']);
    expect(result.ready.map((job) => job.id)).toEqual(['ready-1']);
    expect(result.recent.map((job) => job.id)).toEqual([
      'recent-1',
      'ready-1',
      'active-1',
      'active-2',
      'active-3',
      'active-4',
    ]);
    expect(result.recent.map((job) => job.id)).toEqual(expect.arrayContaining(['active-1', 'ready-1']));
    expect(result.ready[0].artifact).toEqual({
      id: 'artifact-1',
      type: 'research_brief',
      title: '研究简报',
      contentType: 'markdown',
      version: 1,
    });
    expect(result.ready[0].artifact).not.toHaveProperty('content');
    expect(database.query.mock.calls[0][0]).not.toContain('job.*');
    expect(database.query.mock.calls[0][0]).not.toContain('artifact.content,');
    expect(database.query.mock.calls[0][0]).not.toContain('options_json');
    expect(database.query.mock.calls[0][1]).toEqual(['user-1']);
  });

  it('distinguishes an active automatic retry from a terminal failure in public task messages', () => {
    expect(
      toolboxServiceInternals.formatJobError({
        status: 'queued',
        stage: 'retrying',
        error_code: 'AI_GATEWAY_TIMEOUT',
        error_message: '工具任务遇到临时问题',
      }),
    ).toEqual({
      code: 'AI_GATEWAY_TIMEOUT',
      message: '遇到临时问题，正在自动重试；无需重新提交任务。',
    });
    expect(
      toolboxServiceInternals.formatJobError({
        status: 'failed',
        stage: 'failed',
        error_code: 'AI_EXECUTION_REQUEST_DUPLICATED',
        error_message: '工具任务处理失败，系统将自动重试',
      }),
    ).toEqual({
      code: 'AI_EXECUTION_REQUEST_DUPLICATED',
      message: '多次尝试后仍未完成，预占积分已退回；请稍后重新发起。',
    });
    expect(
      toolboxServiceInternals.formatJobError({
        status: 'failed',
        stage: 'failed',
        billing_medium: 'ai_quota',
        error_code: 'AI_QUOTA_EXCEEDED',
        error_message: '工具任务处理失败',
      }),
    ).toEqual({
      code: 'AI_QUOTA_EXCEEDED',
      message: '多次尝试后仍未完成，未产生可用成果的 AI 额度已按规则释放；请稍后重新发起。',
    });
    expect(
      toolboxServiceInternals.formatJobError({
        status: 'failed',
        stage: 'failed',
        error_code: 'AI_SKILL_SCOPE_STALE',
        error_message: '部分材料在报价后已更新，请重新发起任务',
      }),
    ).toEqual({
      code: 'AI_SKILL_SCOPE_STALE',
      message: '部分材料在报价后已更新，请重新发起任务',
    });
  });

  it('enforces artifact expiry in the authoritative read used by view and save', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };
    await expect(getToolboxArtifact({ userId: 'user-1', artifactId: 'artifact-1', database })).rejects.toMatchObject({
      code: 'TOOLBOX_ARTIFACT_NOT_FOUND',
      status: 404,
    });
    expect(database.query.mock.calls[0][0]).toContain('artifact.expires_at > NOW()');
  });

  it('reports a saved note target separately from the historical save status when the note is trashed', async () => {
    const database = {
      query: vi.fn().mockResolvedValueOnce([
        [
          {
            id: 'artifact-1',
            job_id: 'job-1',
            tool_id: 'research_brief',
            artifact_type: 'research_brief',
            artifact_version: 1,
            title: '研究速读包',
            content: '# 内容',
            content_type: 'markdown',
            save_status: 'saved',
            saved_target_type: 'note',
            saved_target_id: 'note-1',
            saved_target_availability: 'trashed',
            status: 'ready',
          },
        ],
      ]),
    };

    await expect(getToolboxArtifact({ userId: 'user-1', artifactId: 'artifact-1', database })).resolves.toMatchObject({
      save: {
        status: 'saved',
        targetType: 'note',
        targetId: 'note-1',
        targetAvailability: 'trashed',
      },
    });
    expect(database.query.mock.calls[0][0]).toContain('LEFT JOIN note saved_note');
    expect(database.query.mock.calls[0][0]).toContain(
      'saved_note.id = CONVERT(receipt.target_id USING utf8mb4) COLLATE utf8mb4_unicode_ci',
    );
    expect(database.query.mock.calls[0][0]).toContain(
      'saved_note.create_by = CONVERT(artifact.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci',
    );
  });

  it('does not start a second note save while the same artifact save lease is active', async () => {
    const now = new Date();
    const database = {
      query: vi.fn().mockResolvedValueOnce([
        [
          {
            id: 'artifact-1',
            job_id: 'job-1',
            tool_id: 'research_brief',
            artifact_type: 'research_brief',
            artifact_version: 1,
            title: '研究速读包',
            content: '# 内容',
            content_type: 'markdown',
            save_status: 'saving',
            status: 'ready',
          },
        ],
      ]),
      getConnection: vi.fn(),
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ id: 'receipt-1', status: 'saving', updated_at: now }]]),
    };
    database.getConnection.mockResolvedValue(connection);

    await expect(
      saveToolboxArtifactToNote({
        userId: 'user-1',
        userRole: 'user',
        artifactId: 'artifact-1',
        clientRequestId: 'save-request-1234',
        request: {},
        database,
        createNoteFn: mocks.createNote,
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_SAVE_IN_PROGRESS', status: 409 });
    expect(mocks.createNote).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('derives the save effect identity from the artifact version instead of a replaceable client request id', () => {
    const input = { userId: 'user-1', artifactId: 'artifact-1', version: 2, targetType: 'note' };
    const first = toolboxServiceInternals.saveIdempotencyKey(input);
    const second = toolboxServiceInternals.saveIdempotencyKey(input);
    expect(first).toBe(second);
    expect(first).toMatch(/^save:[a-f0-9]{48}$/u);
    expect(toolboxServiceInternals.saveIdempotencyKey({ ...input, artifactId: 'artifact-2' })).not.toBe(first);
  });

  it('removes numeric source markers from the saved note while keeping the artifact immutable', async () => {
    const artifactRow = {
      id: 'artifact-1',
      job_id: 'job-1',
      tool_id: 'research_brief',
      artifact_type: 'research_brief',
      artifact_version: 1,
      title: '研究速读包',
      content: '# 结论\n\n主要结论 [1]，补充结论 [2]。\n\n`rows[1]` 保持不变。',
      content_type: 'markdown',
      save_status: 'unsaved',
      status: 'ready',
    };
    const reservationConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const finalizationConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = {
      query: vi.fn().mockResolvedValueOnce([[artifactRow]]),
      getConnection: vi.fn().mockResolvedValueOnce(reservationConnection).mockResolvedValueOnce(finalizationConnection),
    };
    mocks.createNote.mockResolvedValueOnce({ id: 'note-1' });

    await expect(
      saveToolboxArtifactToNote({
        userId: 'user-1',
        userRole: 'user',
        artifactId: 'artifact-1',
        clientRequestId: 'save-request-1234',
        request: {},
        database,
        createNoteFn: mocks.createNote,
      }),
    ).resolves.toMatchObject({ status: 'saved', targetId: 'note-1' });

    expect(mocks.createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        note: expect.objectContaining({
          content: '# 结论\n\n主要结论，补充结论。\n\n`rows[1]` 保持不变。',
        }),
      }),
    );
    expect(artifactRow.content).toContain('[1]');
    expect(finalizationConnection.beginTransaction).toHaveBeenCalledOnce();
    expect(finalizationConnection.query.mock.calls[0][0]).toContain('UPDATE toolbox_save_receipts');
    expect(finalizationConnection.query.mock.calls[0][0]).toContain("lease_token = ? AND status = 'saving'");
    expect(finalizationConnection.query.mock.calls[1][0]).toContain('UPDATE toolbox_jobs');
    expect(finalizationConnection.commit).toHaveBeenCalledOnce();
    expect(finalizationConnection.rollback).not.toHaveBeenCalled();
  });

  it('rejects a stale save lease token instead of overwriting a newer save result', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn().mockResolvedValueOnce([{ affectedRows: 0 }]),
    };

    await expect(
      toolboxServiceInternals.persistToolboxSaveState({
        database: { getConnection: vi.fn().mockResolvedValue(connection) },
        receiptKey: 'receipt-key',
        leaseToken: 'stale-lease-token',
        artifact: { id: 'artifact-1', jobId: 'job-1' },
        userId: 'user-1',
        status: 'save_failed',
        errorCode: 'ECONNRESET',
        errorMessage: '保存失败',
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_SAVE_STATE_MISSING', status: 409 });

    expect(connection.query.mock.calls[0][0]).toContain("lease_token = ? AND status = 'saving'");
    expect(connection.query.mock.calls[0][1].at(-1)).toBe('stale-lease-token');
    expect(connection.query).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('replays a completed artifact save without creating a duplicate note', async () => {
    const artifactRow = {
      id: 'artifact-1',
      job_id: 'job-1',
      tool_id: 'research_brief',
      artifact_type: 'research_brief',
      artifact_version: 1,
      title: '研究速读包',
      content: '# 内容',
      content_type: 'markdown',
      save_status: 'saved',
      status: 'ready',
      saved_target_type: 'note',
      saved_target_id: 'note-1',
    };
    const receiptKey = toolboxServiceInternals.saveReceiptKey({
      userId: 'user-1',
      artifactId: 'artifact-1',
      version: 1,
      targetType: 'note',
    });
    const receipt = {
      id: 'receipt-1',
      receipt_key: receiptKey,
      status: 'saved',
      target_id: 'note-1',
      save_generation: 1,
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[receipt]])
        .mockResolvedValueOnce([[receipt]])
        .mockResolvedValueOnce([[{ id: 'note-1', del_flag: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = {
      query: vi.fn().mockResolvedValueOnce([[artifactRow]]),
      getConnection: vi.fn().mockResolvedValue(connection),
    };

    await expect(
      saveToolboxArtifactToNote({
        userId: 'user-1',
        userRole: 'user',
        artifactId: 'artifact-1',
        clientRequestId: 'save-request-1234',
        request: {},
        database,
        createNoteFn: mocks.createNote,
      }),
    ).resolves.toEqual({
      status: 'saved',
      targetType: 'note',
      targetId: 'note-1',
      targetAvailability: 'available',
      idempotent: true,
    });
    expect(mocks.createNote).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls[2][0]).toContain('FROM note');
    expect(connection.query.mock.calls[3][0]).toContain("save_status = 'saved'");
  });

  it.each([
    { targetState: '已进入回收站', targetRows: [{ id: 'note-1', del_flag: 1 }] },
    { targetState: '已彻底删除', targetRows: [] },
  ])('refuses to recreate a saved target that $targetState unless explicitly requested', async ({ targetRows }) => {
    const artifactRow = {
      id: 'artifact-1',
      job_id: 'job-1',
      tool_id: 'research_brief',
      artifact_type: 'research_brief',
      artifact_version: 1,
      title: '研究速读包',
      content: '# 内容',
      content_type: 'markdown',
      save_status: 'saved',
      status: 'ready',
      saved_target_type: 'note',
      saved_target_id: 'note-1',
    };
    const receiptKey = toolboxServiceInternals.saveReceiptKey({
      userId: 'user-1',
      artifactId: 'artifact-1',
      version: 1,
      targetType: 'note',
    });
    const receipt = {
      id: 'receipt-1',
      receipt_key: receiptKey,
      status: 'saved',
      target_id: 'note-1',
      save_generation: 1,
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[receipt]])
        .mockResolvedValueOnce([[receipt]])
        .mockResolvedValueOnce([targetRows]),
    };
    const database = {
      query: vi.fn().mockResolvedValueOnce([[artifactRow]]),
      getConnection: vi.fn().mockResolvedValueOnce(connection),
    };

    await expect(
      saveToolboxArtifactToNote({
        userId: 'user-1',
        userRole: 'user',
        artifactId: 'artifact-1',
        clientRequestId: 'save-request-1234',
        action: 'save',
        request: {},
        database,
        createNoteFn: mocks.createNote,
      }),
    ).rejects.toMatchObject({ code: 'TOOLBOX_SAVED_TARGET_UNAVAILABLE', status: 409 });

    expect(mocks.createNote).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.query).toHaveBeenCalledTimes(3);
  });

  it('uses a new save generation and stable note idempotency key for an explicit recreate', async () => {
    const artifactRow = {
      id: 'artifact-1',
      job_id: 'job-1',
      tool_id: 'research_brief',
      artifact_type: 'research_brief',
      artifact_version: 1,
      title: '研究速读包',
      content: '# 内容',
      content_type: 'markdown',
      save_status: 'saved',
      status: 'ready',
      saved_target_type: 'note',
      saved_target_id: 'note-1',
    };
    const receiptKey = toolboxServiceInternals.saveReceiptKey({
      userId: 'user-1',
      artifactId: 'artifact-1',
      version: 1,
      targetType: 'note',
    });
    const generationOneKey = toolboxServiceInternals.saveIdempotencyKey({
      userId: 'user-1',
      artifactId: 'artifact-1',
      version: 1,
      targetType: 'note',
      generation: 1,
    });
    const receipt = {
      id: 'receipt-1',
      receipt_key: receiptKey,
      idempotency_key: generationOneKey,
      status: 'saved',
      target_id: 'note-1',
      save_generation: 1,
    };
    const reservationConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[receipt]])
        .mockResolvedValueOnce([[receipt]])
        .mockResolvedValueOnce([[{ id: 'note-1', del_flag: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const finalizationConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = {
      query: vi.fn().mockResolvedValueOnce([[artifactRow]]),
      getConnection: vi.fn().mockResolvedValueOnce(reservationConnection).mockResolvedValueOnce(finalizationConnection),
    };
    mocks.createNote.mockResolvedValueOnce({ id: 'note-2' });

    await expect(
      saveToolboxArtifactToNote({
        userId: 'user-1',
        userRole: 'user',
        artifactId: 'artifact-1',
        clientRequestId: 'recreate-request-1234',
        action: 'recreate_missing_target',
        request: {},
        database,
        createNoteFn: mocks.createNote,
      }),
    ).resolves.toEqual({
      status: 'saved',
      targetType: 'note',
      targetId: 'note-2',
      targetAvailability: 'available',
      idempotent: false,
    });

    const generationTwoKey = toolboxServiceInternals.saveIdempotencyKey({
      userId: 'user-1',
      artifactId: 'artifact-1',
      version: 1,
      targetType: 'note',
      generation: 2,
    });
    expect(generationTwoKey).not.toBe(generationOneKey);
    expect(reservationConnection.query.mock.calls[3][0]).toContain('save_generation = ?');
    expect(reservationConnection.query.mock.calls[3][1]).toEqual([
      2,
      generationTwoKey,
      expect.any(String),
      'receipt-1',
    ]);
    expect(mocks.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'toolbox:artifact-1:v1:g2' }),
    );
    expect(finalizationConnection.commit).toHaveBeenCalledOnce();
  });

  it('replays an already completed recreate generation without creating a third note', async () => {
    const artifactRow = {
      id: 'artifact-1',
      job_id: 'job-1',
      tool_id: 'research_brief',
      artifact_type: 'research_brief',
      artifact_version: 1,
      title: '研究速读包',
      content: '# 内容',
      content_type: 'markdown',
      save_status: 'saved',
      status: 'ready',
      saved_target_type: 'note',
      saved_target_id: 'note-2',
    };
    const receipt = {
      id: 'receipt-1',
      receipt_key: toolboxServiceInternals.saveReceiptKey({
        userId: 'user-1',
        artifactId: 'artifact-1',
        version: 1,
        targetType: 'note',
      }),
      idempotency_key: toolboxServiceInternals.saveIdempotencyKey({
        userId: 'user-1',
        artifactId: 'artifact-1',
        version: 1,
        targetType: 'note',
        generation: 2,
      }),
      status: 'saved',
      target_id: 'note-2',
      save_generation: 2,
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[receipt]])
        .mockResolvedValueOnce([[{ id: 'note-2', del_flag: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = {
      query: vi.fn().mockResolvedValueOnce([[artifactRow]]),
      getConnection: vi.fn().mockResolvedValueOnce(connection),
    };

    await expect(
      saveToolboxArtifactToNote({
        userId: 'user-1',
        userRole: 'user',
        artifactId: 'artifact-1',
        clientRequestId: 'another-client-request-1234',
        action: 'recreate_missing_target',
        request: {},
        database,
        createNoteFn: mocks.createNote,
      }),
    ).resolves.toEqual({
      status: 'saved',
      targetType: 'note',
      targetId: 'note-2',
      targetAvailability: 'available',
      idempotent: true,
    });
    expect(mocks.createNote).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('rolls back both final save markers and leaves the retry idempotent when finalization is interrupted', async () => {
    const artifactRow = {
      id: 'artifact-1',
      job_id: 'job-1',
      tool_id: 'research_brief',
      artifact_type: 'research_brief',
      artifact_version: 1,
      title: '研究速读包',
      content: '# 内容',
      content_type: 'markdown',
      save_status: 'unsaved',
      status: 'ready',
    };
    const reservationConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const failedFinalizationConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: 'ECONNRESET' })),
    };
    const failedStateConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn().mockRejectedValueOnce(Object.assign(new Error('database unavailable'), { code: 'ECONNRESET' })),
    };
    const database = {
      query: vi.fn().mockResolvedValueOnce([[artifactRow]]),
      getConnection: vi
        .fn()
        .mockResolvedValueOnce(reservationConnection)
        .mockResolvedValueOnce(failedFinalizationConnection)
        .mockResolvedValueOnce(failedStateConnection),
    };
    mocks.createNote.mockResolvedValueOnce({ id: 'note-1' });

    await expect(
      saveToolboxArtifactToNote({
        userId: 'user-1',
        userRole: 'user',
        artifactId: 'artifact-1',
        clientRequestId: 'save-request-1234',
        request: {},
        database,
        createNoteFn: mocks.createNote,
      }),
    ).rejects.toMatchObject({ code: 'ECONNRESET', status: 500 });

    expect(mocks.createNote).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'toolbox:artifact-1:v1' }));
    expect(failedFinalizationConnection.commit).not.toHaveBeenCalled();
    expect(failedFinalizationConnection.rollback).toHaveBeenCalledOnce();
    expect(failedStateConnection.rollback).toHaveBeenCalledOnce();
  });
});
