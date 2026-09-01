import { TOOLBOX_TOOL_CATALOG, TOOLBOX_TOOL_INTENTS } from '@lightnote/shared/toolbox-protocol';
import { describe, expect, it, vi } from 'vitest';
import { toolboxSkills } from '../aiSkill/skills/toolboxSkills.js';
import { toolboxWorkerInternals } from './worker.js';

describe('toolbox worker contracts', () => {
  it('reuses the persisted document source of a cloud file after a document wait', async () => {
    const database = {
      query: async () => [
        [
          {
            input_type: 'resource',
            resource_type: 'file',
            resource_id: 'file-1',
            resource_version: 'v1',
            document_source_id: 'source-1',
          },
          {
            input_type: 'document_source',
            document_source_id: 'source-2',
          },
        ],
      ],
    };

    await expect(toolboxWorkerInternals.loadJobInputs('job-1', database)).resolves.toEqual({
      resourceRefs: [{ type: 'file', id: 'file-1', version: 'v1' }],
      unattachedFileRefs: [],
      sourceIds: ['source-1', 'source-2'],
    });
  });

  it('maps every fixed artifact to its own toolbox-internal Skill profile', () => {
    expect(toolboxWorkerInternals.TOOL_SKILLS).toEqual({
      idea_to_draft: 'toolbox.idea_to_draft',
      material_to_note: 'toolbox.material_to_note',
      research_brief: 'toolbox.research_brief',
      study_kit: 'toolbox.study_kit',
      concept_map: 'toolbox.concept_map',
      action_plan: 'toolbox.action_plan',
      source_comparison: 'toolbox.source_comparison',
      knowledge_audit: 'toolbox.knowledge_audit',
    });
  });

  it('keeps shared AI tools, registered Skills and Worker strategies bidirectionally identical', () => {
    const protocolTools = TOOLBOX_TOOL_CATALOG.filter((tool) => tool.executionMode === 'ai_skill');
    const protocolIds = protocolTools.map((tool) => tool.id).sort();
    const skillIds = toolboxSkills.map((skill) => skill.id.replace(/^toolbox\./u, '')).sort();
    const strategyIds = Object.keys(toolboxWorkerInternals.AI_TOOL_STRATEGIES).sort();

    expect(skillIds).toEqual(protocolIds);
    expect(strategyIds).toEqual(protocolIds);
    for (const tool of protocolTools) {
      const strategy = toolboxWorkerInternals.AI_TOOL_STRATEGIES[tool.id];
      expect(strategy.skillId).toBe(`toolbox.${tool.id}`);
      expect(strategy.artifactType).toBe(tool.output.artifactType);
    }
  });

  it('keeps Worker responsible only for artifact persistence, not duplicated model prompts', () => {
    for (const [toolId, strategy] of Object.entries(toolboxWorkerInternals.AI_TOOL_STRATEGIES)) {
      expect(strategy.skillId).toBe(toolboxWorkerInternals.TOOL_SKILLS[toolId]);
      expect(strategy.artifactType).toBeTruthy();
      expect(strategy.defaultTitle).toBeTruthy();
      expect(strategy).not.toHaveProperty('instructions');
    }
  });

  it('marks incomplete source coverage as a partial deliverable', () => {
    expect(toolboxWorkerInternals.coverageIsPartial({ complete: true, warnings: [] })).toBe(false);
    expect(toolboxWorkerInternals.coverageIsPartial({ complete: false, warnings: [] })).toBe(true);
    expect(toolboxWorkerInternals.coverageIsPartial({ complete: true, warnings: ['truncated'] })).toBe(true);
  });

  it('does not retry ownership and scope errors, but retries transient infrastructure failures', () => {
    const job = { attempts: 1, max_attempts: 3 };
    expect(toolboxWorkerInternals.shouldRetryJob(job, { code: 'AI_SKILL_SCOPE_STALE', status: 409 })).toBe(false);
    expect(toolboxWorkerInternals.shouldRetryJob(job, { code: 'AI_SKILL_OUTPUT_PROFILE_INVALID', status: 502 })).toBe(
      false,
    );
    expect(
      toolboxWorkerInternals.shouldRetryJob(job, { code: 'AI_SKILL_STRUCTURED_OUTPUT_INVALID', status: 502 }),
    ).toBe(false);
    expect(toolboxWorkerInternals.shouldRetryJob(job, { code: 'ETIMEDOUT', status: 503 })).toBe(true);
    expect(toolboxWorkerInternals.shouldRetryJob(job, { code: 'AI_PROVIDER_ERROR', status: 503 })).toBe(true);
    expect(toolboxWorkerInternals.shouldRetryJob(job, { code: 'AI_RATE_LIMITED', status: 429 })).toBe(true);
    expect(toolboxWorkerInternals.shouldRetryJob(job, { code: 'TOOLBOX_TOOL_EXECUTOR_MISSING', status: 500 })).toBe(
      false,
    );
    expect(toolboxWorkerInternals.shouldRetryJob(job, { code: 'TOOLBOX_BILLING_RECEIPT_CONFLICT', status: 500 })).toBe(
      false,
    );
    expect(toolboxWorkerInternals.shouldRetryJob(job, { code: 'UNKNOWN_INTERNAL_FAILURE', status: 503 })).toBe(false);
    expect(toolboxWorkerInternals.shouldRetryJob({ attempts: 3, max_attempts: 3 }, { code: 'ETIMEDOUT' })).toBe(false);
  });

  it('derives scenario guidance from a server-controlled intent instead of a second user prompt', () => {
    expect(toolboxWorkerInternals.toolboxIntentInstruction('research_brief', 'decision')).toContain('待决策问题');
    expect(toolboxWorkerInternals.toolboxIntentInstruction('research_brief', 'synthesize')).toBe('');
    expect(toolboxWorkerInternals.toolboxIntentInstruction('unknown', 'decision')).toBe('');
    for (const [toolId, intents] of Object.entries(TOOLBOX_TOOL_INTENTS)) {
      expect(Object.keys(toolboxWorkerInternals.AI_TOOL_INTENT_INSTRUCTIONS[toolId] || {}).sort()).toEqual(
        [...intents].sort(),
      );
    }
  });

  it('gives every automatic attempt a stable but distinct AI execution request id', () => {
    const first = toolboxWorkerInternals.toolboxAttemptRequestId({ id: 'job-1', attempts: 1 });
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(toolboxWorkerInternals.toolboxAttemptRequestId({ id: 'job-1', attempts: 1 })).toBe(first);
    expect(toolboxWorkerInternals.toolboxAttemptRequestId({ id: 'job-1', attempts: 2 })).not.toBe(first);
  });

  it('routes point runs to the platform budget and AI quota runs to the user budget', () => {
    expect(toolboxWorkerInternals.toolboxAiExecutionOverrides({ billing_medium: 'points' })).toEqual({
      executionConfigOverrides: { billingPolicy: 'system', systemId: 'toolbox_points' },
    });
    expect(toolboxWorkerInternals.toolboxAiExecutionOverrides({ billing_medium: 'ai_quota' })).toEqual({});
    expect(toolboxWorkerInternals.toolboxAiExecutionOverrides({})).toEqual({
      executionConfigOverrides: { billingPolicy: 'system', systemId: 'toolbox_points' },
    });
  });

  it('bounds material-to-note output by detail while allowing asynchronous generation more time', () => {
    expect(toolboxWorkerInternals.toolboxModelPolicy('material_to_note', { detailLevel: 'concise' })).toEqual({
      maxTokens: 2600,
      timeoutMs: 150000,
    });
    expect(toolboxWorkerInternals.toolboxModelPolicy('material_to_note', { detailLevel: 'detailed' })).toEqual({
      maxTokens: 6000,
      timeoutMs: 150000,
    });
    expect(toolboxWorkerInternals.toolboxModelPolicy('research_brief')).toEqual({ timeoutMs: 150000 });
  });

  it('claims one queued job under a database lease and records the worker before execution', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ id: 'job-1', status: 'queued', attempts: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(toolboxWorkerInternals.claimNextToolboxJob('worker-1', database)).resolves.toMatchObject({
      id: 'job-1',
      status: 'processing',
      attempts: 1,
      locked_by: expect.stringMatching(/^worker-1:[0-9a-f-]{36}$/u),
    });
    expect(connection.query.mock.calls[0][0]).toContain('attempts >= max_attempts');
    expect(connection.query.mock.calls[1][0]).toContain('LIMIT 1 FOR UPDATE');
    expect(connection.query.mock.calls[1][0]).toContain('locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)');
    expect(connection.query.mock.calls[2][1][0]).toMatch(/^worker-1:[0-9a-f-]{36}$/u);
    expect(connection.query.mock.calls[2][1][1]).toBe('job-1');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('uses a unique lease token for every claim even when the process worker id is reused', () => {
    const first = toolboxWorkerInternals.toolboxLeaseOwner('worker-1');
    const second = toolboxWorkerInternals.toolboxLeaseOwner('worker-1');
    expect(first).toMatch(/^worker-1:[0-9a-f-]{36}$/u);
    expect(second).toMatch(/^worker-1:[0-9a-f-]{36}$/u);
    expect(second).not.toBe(first);
    expect(toolboxWorkerInternals.toolboxLeaseOwner('x'.repeat(200)).length).toBeLessThanOrEqual(128);
  });

  it('keeps a pending long operation leased until it settles', async () => {
    vi.useFakeTimers();
    const database = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    let finishOperation;
    const pendingOperation = new Promise((resolve) => {
      finishOperation = resolve;
    });
    const running = toolboxWorkerInternals.withToolboxLeaseHeartbeat(
      { id: 'job-long' },
      'worker-1:lease-token',
      () => pendingOperation,
      database,
    );

    try {
      await vi.advanceTimersByTimeAsync(toolboxWorkerInternals.TOOLBOX_LEASE_HEARTBEAT_MS * 2);
      expect(database.query).toHaveBeenCalledTimes(2);
      expect(database.query.mock.calls[0][0]).toContain('SET locked_at = NOW()');
      expect(database.query.mock.calls[0][1]).toEqual(['job-long', 'worker-1:lease-token']);
      finishOperation('artifact');
      await expect(running).resolves.toBe('artifact');
      await vi.advanceTimersByTimeAsync(toolboxWorkerInternals.TOOLBOX_LEASE_HEARTBEAT_MS * 2);
      expect(database.query).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a long operation result after its unique lease has been lost', async () => {
    vi.useFakeTimers();
    const database = { query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) };
    let finishOperation;
    const pendingOperation = new Promise((resolve) => {
      finishOperation = resolve;
    });
    const running = toolboxWorkerInternals.withToolboxLeaseHeartbeat(
      { id: 'job-lost' },
      'worker-1:old-lease',
      () => pendingOperation,
      database,
    );

    try {
      await vi.advanceTimersByTimeAsync(toolboxWorkerInternals.TOOLBOX_LEASE_HEARTBEAT_MS);
      finishOperation('stale-artifact');
      await expect(running).rejects.toMatchObject({ code: 'TOOLBOX_JOB_LEASE_LOST', status: 409 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('terminalizes a stale final-attempt lease and releases its reserved points before claiming more work', async () => {
    const stale = {
      id: 'job-stale',
      user_id: 'user-1',
      tool_id: 'research_brief',
      quote_id: 'quote-1',
      points_operation_id: 9,
      quoted_points: 20,
      actual_points: 0,
      billing_status: 'reserved',
      status: 'processing',
      attempts: 3,
      max_attempts: 3,
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[stale]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(toolboxWorkerInternals.claimNextToolboxJob('worker-1', database)).resolves.toEqual({
      terminalized: true,
      id: 'job-stale',
    });
    expect(connection.query.mock.calls[0][0]).toContain('attempts >= max_attempts');
    expect(connection.query.mock.calls[1][0]).toContain('UPDATE user_growth SET points = points + ?');
    expect(connection.query.mock.calls[5][0]).toContain("error_code = 'TOOLBOX_JOB_LEASE_EXHAUSTED'");
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('records truthful worker milestones without allowing progress to move backwards', async () => {
    const database = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await expect(
      toolboxWorkerInternals.updateToolboxJobStage({ id: 'job-1' }, 'worker-1', 'reading_sources', 28, database),
    ).resolves.toBeUndefined();
    expect(database.query.mock.calls[0][0]).toContain('progress = GREATEST(progress, ?)');
    expect(database.query.mock.calls[0][0]).toContain("status = 'processing'");
    expect(database.query.mock.calls[0][1]).toEqual(['reading_sources', 28, 'job-1', 'worker-1']);
  });
});
