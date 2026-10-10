import { describe, expect, it, vi } from 'vitest';
import { validateComparisonTable } from './comparisonTable.js';
import { toolboxSkills } from './toolboxSkills.js';
import { callStructuredSkillModel } from '../structuredModel.js';
vi.mock('../../agent/aiGateway.js', () => ({
  requestAi: vi.fn(),
  requestAiStream: vi.fn(),
  estimateAiProviderTokens: vi.fn(() => 2048),
}));
const { requestAi } = await import('../../agent/aiGateway.js');
const column = { label: '价格', type: 'auto', rule: '' };
const context = () => ({
  columns: [column],
  sources: [
    { id: 'note:a', title: '方案 A', coverage: { complete: true } },
    { id: 'note:b', title: '方案 B', coverage: { complete: true } },
  ],
  sourceTexts: { 'note:a': '价格为 39 元。旧版本为 29 元。', 'note:b': '团队协作功能。' },
  resourceRefs: [
    { type: 'note', id: 'a' },
    { type: 'note', id: 'b' },
  ],
  coverage: { complete: true },
});
const output = () => ({
  rows: [
    { sourceIndex: 1, cells: [{ value: '39 元', status: 'found', quotes: ['价格为 39 元。'] }] },
    { sourceIndex: 2, cells: [{ value: '', status: 'missing', quotes: [] }] },
  ],
});
describe('comparison table grounding', () => {
  it('binds rows to authoritative sources and keeps missing values empty', () => {
    const result = validateComparisonTable(output(), context());
    expect(result.comparisonTable.rows[0]).toMatchObject({ sourceId: 'note:a', title: '方案 A' });
    expect(result.comparisonTable.rows[1].cells[0]).toEqual({ value: '', status: 'missing', quotes: [] });
    expect(result.content).toContain('价格为 39 元。');
  });
  it.each([
    'inventedQuote',
    'otherSourceQuote',
    'duplicateRow',
    'missingRow',
    'extraColumn',
    'noQuote',
    'badConflict',
    'filledMissing',
  ])('rejects %s', (reason) => {
    const args = output();
    const cell = args.rows[0].cells[0];
    if (reason === 'inventedQuote') cell.quotes = ['价格为 99 元。'];
    if (reason === 'otherSourceQuote') cell.quotes = ['团队协作功能。'];
    if (reason === 'duplicateRow') args.rows[1].sourceIndex = 1;
    if (reason === 'missingRow') args.rows.pop();
    if (reason === 'extraColumn') args.rows[0].cells.push(cell);
    if (reason === 'noQuote') cell.quotes = [];
    if (reason === 'badConflict') cell.status = 'conflict';
    if (reason === 'filledMissing') cell.status = 'missing';
    expect(() => validateComparisonTable(args, context())).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });
  it('keeps unreadable and truncated sources distinct from absent facts', () => {
    const ctx = context();
    ctx.sources[1].coverage.complete = false;
    ctx.resourceRefs.push({ type: 'file', id: 'c' });
    const rows = validateComparisonTable(output(), ctx).comparisonTable.rows;
    expect(rows[1].cells[0].status).toBe('unavailable');
    expect(rows[2]).toMatchObject({ sourceId: 'file:c', cells: [{ status: 'unavailable' }] });
  });
  it('marks strict number formats for review without discarding evidence', () => {
    const ctx = context();
    ctx.columns = [{ ...column, type: 'number' }];
    expect(validateComparisonTable(output(), ctx).comparisonTable.rows[0].cells[0]).toMatchObject({
      value: '39 元',
      status: 'format_error',
    });
  });
  it('uses the structured path only when explicitly requested, retaining report contracts', async () => {
    const skill = toolboxSkills.find((item) => item.id === 'toolbox.source_comparison');
    const ctx = context();
    const loader = vi.fn(async () => ({ ...ctx, evidence: '权威正文' }));
    const args = {
      context: { identity: { subjectUserId: 'owner' }, resourceRefs: ctx.resourceRefs },
      dependencies: { loadExplicitResourceEvidence: loader },
    };
    const report = await skill.prepare({ ...args, input: skill.validateInput({ question: '比较价格' }) });
    expect(report.structuredTool).toBeUndefined();
    expect(report.resultValidator).toBeTypeOf('function');
    expect(report.messages[1].content).toContain('Markdown 对比矩阵');
    const table = await skill.prepare({
      ...args,
      input: skill.validateInput({ question: '比较价格', resultMode: 'table', columns: [column] }),
    });
    expect(table.structuredTool.name).toBe('submit_comparison_table');
    expect(table.validateArguments(output()).comparisonTable.rows).toHaveLength(2);
    expect(skill.resolveModelPolicy({}).maxTokens).toBe(5000);
    expect(skill.resolveModelPolicy({ resultMode: 'table' }).maxTokens).toBe(12000);
  });
});

it('preserves structured table and evidence through the Skill response and commit boundary', async () => {
  const { executeAiSkill } = await import('../runtime.js');
  const skill = toolboxSkills.find((item) => item.id === 'toolbox.source_comparison');
  const ctx = context();
  const model = vi.fn(async (options) => {
    expect(options.modelPolicy.maxTokens).toBe(12000);
    return options.validateArguments(output());
  });
  const commit = vi.fn();
  const result = await executeAiSkill(
    {
      protocolVersion: 1,
      requestId: '11111111-1111-4111-8111-111111111111',
      skillId: skill.id,
      skillVersion: 1,
      threadId: null,
      input: { question: '价格', resultMode: 'table', columns: [column] },
      scope: { resourceRefs: ctx.resourceRefs },
      client: { locale: 'zh-CN', timezone: 'Asia/Singapore', surface: 'toolbox' },
    },
    { user: { id: 'owner', role: 'user' } },
    {
      internalCaller: 'toolbox_worker',
      resolveSkill: () => skill,
      assertDomainEnabled: vi.fn(),
      resolveThread: async () => null,
      appendTurn: vi.fn(),
      runExecution: async (_config, operation) => operation(),
      resolveContext: async () => ({
        identity: {
          actorUserId: 'owner',
          actorRole: 'user',
          subjectUserId: 'owner',
          subjectRole: 'user',
          adminContextId: null,
          adminContextMode: 'normal',
        },
        resourceRefs: ctx.resourceRefs,
        scopeDigest: 'a'.repeat(64),
      }),
      skillDependencies: {
        loadExplicitResourceEvidence: async () => ({ ...ctx, evidence: '原文资料' }),
        callStructuredSkillModel: model,
      },
      commitValidatedResult: commit,
    },
  );
  expect(result.result.comparisonTable.rows).toHaveLength(2);
  expect(result.receipt.modelCalled).toBe(true);
  expect(commit.mock.calls[0][0].response.result.comparisonTable).toEqual(result.result.comparisonTable);
  expect(model).toHaveBeenCalledOnce();
});

it('repairs invalid quotes with row/column context while keeping grounding strict and platform billing', async () => {
  const skill = toolboxSkills.find((item) => item.id === 'toolbox.source_comparison');
  const ctx = context();
  const prepared = await skill.prepare({
    input: skill.validateInput({ question: '比较价格', resultMode: 'table', columns: [column] }),
    context: { identity: { subjectUserId: 'owner' }, resourceRefs: ctx.resourceRefs },
    dependencies: { loadExplicitResourceEvidence: async () => ({ ...ctx, evidence: '权威正文' }) },
  });
  const invalid = output();
  invalid.rows[0].cells[0].quotes = ['价格为 99 元。'];
  const response = (args) => ({
    toolCalls: [{ function: { name: 'submit_comparison_table', arguments: JSON.stringify(args) } }],
  });
  requestAi.mockReset().mockResolvedValueOnce(response(invalid)).mockResolvedValueOnce(response(output()));
  const result = await callStructuredSkillModel({ ...prepared, modelPolicy: { maxTokens: 12000 }, trace: {} });
  expect(result.comparisonTable.rows[0].cells[0].quotes).toEqual(['价格为 39 元。']);
  const [messages, options] = requestAi.mock.calls[1];
  expect(messages.at(-1).content).toContain('quote_not_in_source');
  expect(messages.at(-1).content).toContain('来源编号：1，列序号：1');
  expect(messages.at(-1).content).not.toContain('99');
  expect(options.billingScope).toBe('platform');
  requestAi.mockReset().mockResolvedValue(response(invalid));
  await expect(
    callStructuredSkillModel({ ...prepared, modelPolicy: { maxTokens: 12000 }, trace: {} }),
  ).rejects.toMatchObject({
    code: 'AI_SKILL_OUTPUT_PROFILE_INVALID',
    details: { reason: 'quote_not_in_source', sourceIndex: 1, columnIndex: 1 },
  });
  expect(requestAi).toHaveBeenCalledTimes(2);
});
