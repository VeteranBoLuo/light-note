import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtures } from './fixtures.js';
import {
  validatePlan,
  validateRecords,
  sourcePayload,
  planMessages,
  extractionMessages,
  planTool,
} from './contract.js';
import { score } from './score.js';
import { localAdapters, loadRuntime } from './runtime.js';

vi.mock('../../util/agent/deepseekClient.js', () => ({ requestDeepSeek: vi.fn(), requestDeepSeekStream: vi.fn() }));
import { requestDeepSeek } from '../../util/agent/deepseekClient.js';
import { callStructuredSkillModel } from '../../util/aiSkill/structuredModel.js';
import { runAiExecution } from '../../util/aiExecution/service.js';

const rawPlan = {
  recordDefinition: '一门课程',
  fields: [{ key: 'name', label: '课程名称', type: 'text', rule: '原始名称' }],
};
const plan = () => validatePlan(structuredClone(rawPlan));
const source = () => ({
  id: 'a',
  version: 'v1',
  complete: true,
  segments: [{ id: 's1', locator: '第 1 页', kind: 'ocr', text: '绘画课 12；陶艺课 16；日期 2025-02-30；编号 001' }],
});
const record = (value = '绘画课', quote = value) => ({
  anchor: { segment: 0, quote: '绘画课' },
  cells: [{ value, status: 'found', evidence: [{ segment: 0, quote }] }],
});
const dirs = [];
const adapters = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ln-extraction-'));
  dirs.push(dir);
  return localAdapters(join(dir, 'ledger.jsonl'));
};
afterEach(() => {
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
  vi.clearAllMocks();
});

describe('source-bound extraction contract', () => {
  it('assigns stable IDs and preserves OCR/source version evidence', () => {
    const result = validateRecords({ records: [record()] }, plan(), source());
    expect(result).toEqual(validateRecords({ records: [record()] }, plan(), source()));
    expect(result[0].cells[0].evidence[0]).toMatchObject({
      sourceId: 'a',
      sourceVersion: 'v1',
      kind: 'ocr',
      offset: 0,
    });
    expect(validateRecords({ records: [record()] }, plan(), { ...source(), version: 'v2' })[0].id).not.toBe(
      result[0].id,
    );
  });
  it.each([
    (r) => {
      r.cells[0].evidence[0].segment = 1;
    },
    (r) => {
      r.cells[0].evidence[0].quote = '不存在的价格 99 元';
    },
    (r) => {
      r.sourceId = 'other-user';
    },
    (r) => {
      r.cells = [];
    },
    (r) => {
      r.cells[0].evidence = [];
    },
  ])('rejects invalid references and resource identity injection', (mutate) => {
    const r = record();
    mutate(r);
    expect(() => validateRecords({ records: [r] }, plan(), source())).toThrow();
  });
  it('rejects duplicate and ambiguous anchors instead of silently dropping records', () => {
    expect(() => validateRecords({ records: [record(), record()] }, plan(), source())).toThrow('Repeated');
    const s = source();
    s.segments[0].text += ' 绘画课';
    expect(() => validateRecords({ records: [record()] }, plan(), s)).toThrow('ambiguous');
  });
  it('distinguishes missing from unread range and never invents a blank evidence quote', () => {
    const r = record();
    r.cells[0] = { value: '', status: 'missing', evidence: [] };
    expect(validateRecords({ records: [r] }, plan(), source())[0].cells[0].status).toBe('missing');
    expect(validateRecords({ records: [r] }, plan(), { ...source(), complete: false })[0].cells[0].status).toBe(
      'unavailable',
    );
    r.cells[0].value = '0';
    expect(() => validateRecords({ records: [r] }, plan(), source())).toThrow();
  });
  it('keeps invalid dates and numbers visible without silent conversion', () => {
    for (const [type, value] of [
      ['date', '2025-02-30'],
      ['number', '001'],
    ]) {
      const p = plan();
      p.fields[0].type = type;
      const cell = validateRecords({ records: [record(value)] }, p, source())[0].cells[0];
      expect(cell).toMatchObject({ status: 'format_error', originalValue: value });
    }
  });
  it('preserves conflicts supported by a single sentence and still rejects unsupported claims', () => {
    const s = source();
    s.segments[0].text = '绘画课：介绍写 12 课时；报名表写 16 课时。';
    const r = record('12 / 16', s.segments[0].text);
    r.cells[0].status = 'conflict';
    expect(validateRecords({ records: [r] }, plan(), s)[0].cells[0].status).toBe('conflict');
    r.cells[0].evidence = [];
    expect(() => validateRecords({ records: [r] }, plan(), s)).toThrow();
  });
  it('rejects oversized material without truncation', () => {
    const s = source();
    s.segments[0].text = '中'.repeat(24_000);
    expect(() => sourcePayload(s)).toThrow('no truncation');
  });
  it('does not expose golden answers, scores or prefilled fields to schema suggestion', () => {
    const f = { ...fixtures[0], rows: [{ secret: 'GOLDEN_SENTINEL' }], fields: [{ key: 'GOLDEN_FIELD' }] };
    expect(JSON.stringify(planMessages(f))).not.toMatch(/GOLDEN_SENTINEL|GOLDEN_FIELD/);
    expect(JSON.stringify(extractionMessages(f, plan()))).not.toContain('GOLDEN_SENTINEL');
  });
  it('rejects duplicate schema keys and unsupported field types', () => {
    expect(() => validatePlan({ ...rawPlan, fields: [rawPlan.fields[0], rawPlan.fields[0]] })).toThrow();
    expect(() => validatePlan({ ...rawPlan, fields: [{ ...rawPlan.fields[0], type: 'formula' }] })).toThrow();
  });
});

describe('quality scoring and bounded accounting', () => {
  it('counts values attached to the wrong row as errors, even when they all exist in the source', () => {
    const fixture = fixtures[0];
    const p = {
      fields: [
        { key: 'code', label: '编号' },
        { key: 'name', label: '名称' },
        { key: 'units', label: '学分' },
      ],
    };
    const records = fixture.rows.map((row, i) => ({
      id: String(i),
      cells: [row.code, row.name, fixture.rows[(i + 1) % 4].units].map((originalValue) => ({
        originalValue,
        status: 'found',
      })),
    }));
    const result = score(fixture, p, records);
    expect(result.matchedRecords).toBe(4);
    expect(result.correctCells).toBe(10);
    records.push(records[0]);
    expect(score(fixture, p, records).matchedRecords).toBe(3);
  });
  it('retains conservative reservations after unknown outcomes', async () => {
    const a = adapters();
    const handle = await a.quota.reserve({}, { reserveTokens: 80_000, requestId: 'first' });
    await a.quota.reconcile(handle, 0);
    await expect(a.quota.reserve({}, { reserveTokens: 1, requestId: 'retry' })).rejects.toMatchObject({
      code: 'EXTRACTION_EVAL_BUDGET_EXCEEDED',
    });
  });
  it('runs real Execution/Gateway with a mocked provider and persists usage once', async () => {
    const a = adapters();
    requestDeepSeek.mockResolvedValue({
      content: '',
      finishReason: 'tool_calls',
      toolCalls: [{ function: { name: planTool.name, arguments: JSON.stringify(rawPlan) } }],
      usage: { promptTokens: 80, completionTokens: 20, totalTokens: 100 },
      usageStatus: 'reported',
      provider: 'mock',
      model: 'mock-model',
    });
    await runAiExecution(
      {
        billingPolicy: 'system',
        taskType: 'extraction_evaluation',
        reservationTokens: 10_000,
        maxUserProviderCalls: 1,
        persistence: a.persistence,
      },
      () =>
        callStructuredSkillModel({
          messages: planMessages(fixtures[0]),
          structuredTool: planTool,
          validateArguments: validatePlan,
          modelPolicy: { maxTokens: 1800, temperature: 0, timeoutMs: 1000 },
          trace: { stage: 'extraction_eval_plan' },
          repairableErrorCodes: [],
        }),
      { quota: a.quota },
    );
    expect(requestDeepSeek).toHaveBeenCalledTimes(1);
    expect(a.events.find((e) => e.event === 'execution_settled')).toMatchObject({
      status: 'success',
      chargedTokens: 100,
      providerCallCount: 1,
      quotaSettlementStatus: 'reconciled',
    });
    expect(a.events.filter((e) => e.event === 'provider_span')).toHaveLength(1);
    expect(a.events.find((e) => e.event === 'execution_started').usage.totalTokens).toBe(0);
    expect(readFileSync(join(dirs[0], 'ledger.jsonl'), 'utf8')).not.toContain('Program Electives');
  });
  it('blocks provider calls if the experiment ledger cannot be written', async () => {
    const a = localAdapters('/nonexistent-extraction-eval-path/ledger.jsonl');
    await expect(
      runAiExecution(
        { billingPolicy: 'system', taskType: 'extraction_evaluation', persistence: a.persistence },
        () => requestDeepSeek(),
        { quota: a.quota },
      ),
    ).rejects.toThrow();
    expect(requestDeepSeek).not.toHaveBeenCalled();
  });
  it('never retries an uncertain provider failure and records missing usage conservatively', async () => {
    const a = adapters();
    requestDeepSeek.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'AI_GATEWAY_TIMEOUT' }));
    await expect(
      runAiExecution(
        {
          billingPolicy: 'system',
          taskType: 'extraction_evaluation',
          reservationTokens: 10_000,
          maxUserProviderCalls: 1,
          persistence: a.persistence,
        },
        () =>
          callStructuredSkillModel({
            messages: planMessages(fixtures[0]),
            structuredTool: planTool,
            validateArguments: validatePlan,
            modelPolicy: { maxTokens: 1800, temperature: 0, timeoutMs: 1000 },
            trace: { stage: 'extraction_eval_plan' },
            repairableErrorCodes: [],
          }),
        { quota: a.quota },
      ),
    ).rejects.toThrow('timeout');
    expect(requestDeepSeek).toHaveBeenCalledTimes(1);
    const span = a.events.find((e) => e.event === 'provider_span');
    const execution = a.events.find((e) => e.event === 'execution_settled');
    expect(span).toMatchObject({ status: 'failed', usageStatus: 'missing' });
    expect(execution).toMatchObject({ status: 'failed', missingUsageSpans: 1, chargedTokens: span.estimatedTokens });
  });
  it('refuses live runtime loading from routine tests', async () => {
    await expect(loadRuntime()).rejects.toThrow('forbidden in test');
  });
});
