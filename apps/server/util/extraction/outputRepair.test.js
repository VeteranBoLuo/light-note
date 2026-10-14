import { beforeEach, describe, expect, it, vi } from 'vitest';
const gateway = vi.hoisted(() => ({ requestAi: vi.fn(), requestAiStream: vi.fn(), estimateAiProviderTokens: vi.fn() }));
vi.mock('../agent/aiGateway.js', () => gateway);
import { extractionSkills } from '../aiSkill/skills/extractionSkill.js';
import { compileExtractionCitations } from './citations.js';
import { validatePlan } from './contract.js';

const plan = validatePlan({
  recordDefinition: '每个服务一条',
  fields: [
    { key: 'name', label: 'System', type: 'text', rule: '摘录服务名' },
    { key: 'command', label: 'Action', type: 'text', rule: '原始命令' },
    { key: 'other', label: 'windows/other', type: 'text', rule: '' },
  ],
});
const source = {
  id: 'source',
  title: '合成开发材料',
  version: 'v1',
  complete: true,
  coverage: {},
  segments: [
    {
      id: 'p1',
      kind: 'original',
      locator: '段落 1',
      text: Array.from({ length: 16 }, (_, i) => `服务 ${i}\nnode ./service_${i}.js`).join('\n'),
    },
  ],
};
const good = () => ({
  complete: true,
  records: Array.from({ length: 16 }, (_, i) => ({
    anchor: { reference: `s0_l${i * 2}_p0` },
    cells: [
      { value: `服务 ${i}`, evidence: [`s0_l${i * 2}_p0`] },
      { value: `node ./service_${i}.js`, evidence: [`s0_l${i * 2 + 1}_p0`] },
      null,
    ],
  })),
});
const response = (args, name = 'extract_records', extra = {}) => ({
  ...extra,
  toolCalls: [{ function: { name, arguments: JSON.stringify(args) } }],
});
async function invoke(beforeRequest = vi.fn()) {
  const skill = extractionSkills.find((s) => s.id.endsWith('_extract'));
  const prepared = await skill.prepare({ input: { source, plan, goal: '' }, dependencies: { beforeRequest } });
  return prepared.callModel({ modelPolicy: skill.modelPolicy, trace: { stage: 'extraction' } });
}
beforeEach(() => vi.resetAllMocks());

describe('提取局部修复和输出成本', () => {
  it.each(['length', 'content_filter', 'consumer_stop'])(
    '首次输出未完整结束时不浪费一次完整重发：%s',
    async (finishReason) => {
      gateway.requestAi.mockResolvedValueOnce(response(good(), 'extract_records', { finishReason }));
      await expect(invoke()).rejects.toMatchObject({ code: 'EXTRACTION_OUTPUT_INCOMPLETE' });
      expect(gateway.requestAi).toHaveBeenCalledOnce();
    },
  );
  it('16 条中仅修复 1 条，其他记录及正常单元格完全一致，仍只调用一次平台修复', async () => {
    const draft = good();
    draft.records[13].cells[1].evidence = ['s99_l0_p0'];
    const patch = { complete: true, repairs: [{ index: 13, record: good().records[13] }] };
    patch.repairs[0].record.cells[0] = null; // Preserve the valid name without generating it again.
    gateway.requestAi
      .mockResolvedValueOnce(response(draft))
      .mockResolvedValueOnce(response(patch, 'repair_extraction_records'));
    const before = vi.fn();
    const result = await invoke(before);
    expect(result.records).toEqual(compileExtractionCitations(source, plan).validate({ records: good().records }));
    expect(draft.records[13].cells[1].evidence).toEqual(['s99_l0_p0']);
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
    expect(before).toHaveBeenCalledTimes(2);
    const [messages, options] = gateway.requestAi.mock.calls[1];
    expect(options).toMatchObject({
      billingScope: 'platform',
      repairReasonCode: 'EXTRACTION_CONTRACT_INVALID',
      trace: { stage: 'extraction_repair' },
      toolChoice: { function: { name: 'repair_extraction_records' } },
    });
    expect(messages.at(-1).content).toContain('records[13].cells[1].evidence[0]');
    expect(messages.at(-1).content).not.toContain('node ./service_0.js');
    expect(Buffer.byteLength(JSON.stringify(patch))).toBeLessThan(Buffer.byteLength(JSON.stringify(good())) * 0.1);
  });
  it('一次诊断所有出错记录及字段，不逐格追加模型调用', async () => {
    const draft = good();
    draft.records[0].cells[0].evidence = ['s98_l0_p0'];
    draft.records[0].cells[1].evidence = ['s99_l0_p0'];
    draft.records[8].cells[1].status = 'unknown';
    const patch = { complete: true, repairs: [0, 8].map((index) => ({ index, record: good().records[index] })) };
    gateway.requestAi
      .mockResolvedValueOnce(response(draft))
      .mockResolvedValueOnce(response(patch, 'repair_extraction_records'));
    expect((await invoke()).records).toHaveLength(16);
    const message = gateway.requestAi.mock.calls[1][0].at(-1).content;
    for (const path of ['records[0].cells[0].evidence[0]', 'records[0].cells[1].evidence[0]', 'records[8].cells[1]'])
      expect(message).toContain(path);
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
  });
  it.each([
    'other_row',
    'omit',
    'duplicate',
    'unknown_key',
    'delete',
    'change_good_cell',
    'change_identity',
    'bad_evidence',
    'wrong_cell_count',
    'incomplete',
  ])('拒绝不安全修复：%s，且不第三次调用', async (mutation) => {
    const draft = good();
    draft.records[13].cells[1].evidence = ['s99_l0_p0'];
    const patch = { complete: true, repairs: [{ index: 13, record: good().records[13] }] };
    if (mutation === 'other_row') patch.repairs[0].index = 0;
    if (mutation === 'omit') patch.repairs = [];
    if (mutation === 'duplicate') patch.repairs.push(patch.repairs[0]);
    if (mutation === 'unknown_key') patch.repairs[0].owner = 'other';
    if (mutation === 'delete') patch.repairs[0].record = null;
    if (mutation === 'change_good_cell') patch.repairs[0].record.cells[0].value = 'tampered';
    if (mutation === 'change_identity') patch.repairs[0].record.anchor = { reference: 's0_l1_p0' };
    if (mutation === 'bad_evidence') patch.repairs[0].record.cells[1].evidence = ['s99_l0_p0'];
    if (mutation === 'wrong_cell_count') patch.repairs[0].record.cells.pop();
    if (mutation === 'incomplete') patch.complete = false;
    gateway.requestAi
      .mockResolvedValueOnce(response(draft))
      .mockResolvedValueOnce(response(patch, 'repair_extraction_records'));
    await expect(invoke()).rejects.toBeDefined();
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
  });
  it('记录间重复不能局部猜测，沿用一次完整修复并保留全部条目', async () => {
    const draft = good();
    draft.records[1] = structuredClone(draft.records[0]);
    gateway.requestAi.mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response(good()));
    expect((await invoke()).records).toHaveLength(16);
    expect(gateway.requestAi.mock.calls[1][1].toolChoice.function.name).toBe('extract_records');
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
  });
  it('所有记录出错时沿用一次完整修复，不能省略坏记录', async () => {
    const draft = good();
    for (const row of draft.records) row.cells[1].evidence = ['s99_l0_p0'];
    gateway.requestAi.mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response(good()));
    expect((await invoke()).records).toHaveLength(16);
    expect(gateway.requestAi.mock.calls[1][1].toolChoice.function.name).toBe('extract_records');
  });
  it('合并后重新检查跨记录锚点，不能把坏记录改成另一条记录', async () => {
    const draft = good();
    draft.records[13].anchor.reference = 's99_l0_p0';
    const patch = { complete: true, repairs: [{ index: 13, record: good().records[0] }] };
    gateway.requestAi
      .mockResolvedValueOnce(response(draft))
      .mockResolvedValueOnce(response(patch, 'repair_extraction_records'));
    await expect(invoke()).rejects.toMatchObject({ validationReason: 'Repeated record anchor' });
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
  });
  it('局部修复同样重检租约，失效后不外发', async () => {
    const draft = good();
    draft.records[13].cells[1].evidence = ['s99_l0_p0'];
    gateway.requestAi.mockResolvedValueOnce(response(draft));
    const before = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('lease lost'));
    await expect(invoke(before)).rejects.toThrow('lease lost');
    expect(gateway.requestAi).toHaveBeenCalledOnce();
  });
  it('局部修复响应被截断仍失败，即使 JSON 可解析也不发布或追加重试', async () => {
    const draft = good();
    draft.records[13].cells[1].evidence = ['s99_l0_p0'];
    const patch = { complete: true, repairs: [{ index: 13, record: good().records[13] }] };
    gateway.requestAi
      .mockResolvedValueOnce(response(draft))
      .mockResolvedValueOnce(response(patch, 'repair_extraction_records', { finishReason: 'length' }));
    await expect(invoke()).rejects.toMatchObject({ code: 'AI_SKILL_STRUCTURED_OUTPUT_INVALID' });
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
  });
});
