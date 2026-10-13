import { beforeEach, describe, expect, it, vi } from 'vitest';
const gateway = vi.hoisted(() => ({ requestAi: vi.fn(), requestAiStream: vi.fn(), estimateAiProviderTokens: vi.fn() }));
vi.mock('../agent/aiGateway.js', () => gateway);
import { extractionSkills } from '../aiSkill/skills/extractionSkill.js';
import { extractionRepairInstruction, extractionValidationReason, validatePlan } from './contract.js';

const source = {
  id: 's',
  version: 'v1',
  title: '产品',
  complete: true,
  coverage: {},
  segments: [{ id: 'p', kind: 'original', locator: '段落 1', text: '相机甲 重量 3 g' }],
};
const plan = validatePlan({
  recordDefinition: '每个产品',
  fields: [{ key: 'weight', label: '重量', type: 'text', rule: '含单位' }],
});
const good = {
  complete: true,
  records: [
    {
      anchor: { reference: 's0_l0_p0', quote: '相机甲' },
      cells: [{ value: '3 g', status: 'found', evidence: [{ reference: 's0_l0_p0' }] }],
    },
  ],
};
const result = (args) => ({ toolCalls: [{ function: { name: 'extract_records', arguments: JSON.stringify(args) } }] });
const invalid = () => {
  const draft = structuredClone(good);
  draft.records[0].anchor.quote = '不存在的原文';
  return draft;
};
async function invoke(beforeRequest = vi.fn()) {
  const skill = extractionSkills.find((s) => s.id.endsWith('_extract'));
  const prepared = await skill.prepare({ input: { source, plan, goal: '' }, dependencies: { beforeRequest } });
  return prepared.callModel({ modelPolicy: skill.modelPolicy });
}
beforeEach(() => vi.resetAllMocks());
describe('提取输出的一次平台修复', () => {
  it('使用原材料和具体校验原因修复，仍校验依据，第二次调用由平台承担', async () => {
    gateway.requestAi.mockResolvedValueOnce(result(invalid())).mockResolvedValueOnce(result(good));
    const before = vi.fn();
    const value = await invoke(before);
    expect(value.records[0].cells[0].originalValue).toBe('3 g');
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
    expect(before).toHaveBeenCalledTimes(2);
    const [messages, options] = gateway.requestAi.mock.calls[1];
    expect(options).toMatchObject({ billingScope: 'platform', repairReasonCode: 'EXTRACTION_CONTRACT_INVALID' });
    expect(messages.at(-1).content).toContain('Missing or ambiguous quote');
    expect(messages.at(-1).content).toContain('不存在的原文');
    const schema = options.tools[0].function.parameters;
    expect(schema.properties.records.items.properties.cells).toMatchObject({ minItems: 1, maxItems: 1 });
    expect(schema.properties.records.items.properties.anchor.properties.reference.pattern).toBeTruthy();
    expect(messages.at(-1).content).toContain('records[0].anchor');
    expect(messages.at(-1).content).toContain('系统会按编号回填原文');
  });
  it('修复仍无依据就失败，不降级校验或继续循环', async () => {
    gateway.requestAi.mockResolvedValue(result(invalid()));
    await expect(invoke()).rejects.toMatchObject({
      code: 'EXTRACTION_CONTRACT_INVALID',
      validationReason: 'Missing or ambiguous quote',
    });
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
  });
  it('错误编号给出精确字段路径，修复后引用原文由服务端回填', async () => {
    const draft = structuredClone(good);
    draft.records[0].cells[0].evidence[0].reference = 's99_l0_p0';
    gateway.requestAi.mockResolvedValueOnce(result(draft)).mockResolvedValueOnce(result(good));
    const value = await invoke();
    expect(value.records[0].cells[0].evidence[0].quote).toBe(source.segments[0].text);
    const [messages, options] = gateway.requestAi.mock.calls[1];
    expect(messages.at(-1).content).toContain('Unknown citation reference');
    expect(messages.at(-1).content).toContain('records[0].cells[0].evidence[0]');
    expect(options.billingScope).toBe('platform');
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
  });
  it('错误状态给出明确修复要求，仍只允许一次平台修复', async () => {
    const draft = structuredClone(good);
    draft.records[0].cells[0].status = 'unknown';
    gateway.requestAi.mockResolvedValueOnce(result(draft)).mockResolvedValueOnce(result(good));
    const value = await invoke();
    expect(value.records[0].cells[0]).toMatchObject({ status: 'found', originalValue: '3 g' });
    const [messages, options] = gateway.requestAi.mock.calls[1];
    expect(messages.at(-1).content).toContain('Invalid cell status');
    expect(messages.at(-1).content).toContain('records[0].cells[0]');
    expect(options.billingScope).toBe('platform');
    expect(gateway.requestAi).toHaveBeenCalledTimes(2);
  });
  it('未完整输出或网络结果不确定不会自动重发', async () => {
    gateway.requestAi.mockResolvedValueOnce(result({ complete: false, records: [] }));
    await expect(invoke()).rejects.toMatchObject({ code: 'EXTRACTION_OUTPUT_INCOMPLETE' });
    expect(gateway.requestAi).toHaveBeenCalledOnce();
    gateway.requestAi.mockReset().mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    await expect(invoke()).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    expect(gateway.requestAi).toHaveBeenCalledOnce();
  });
  it('第二次外发前重新检查围栏；失去租约不再请求', async () => {
    gateway.requestAi.mockResolvedValueOnce(result(invalid()));
    const before = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('lease lost'));
    await expect(invoke(before)).rejects.toThrow('lease lost');
    expect(gateway.requestAi).toHaveBeenCalledOnce();
  });
  it('低敏诊断只允许白名单，过大草稿不截断冒充完整草稿', () => {
    const error = { message: 'private', validationReason: 'private' };
    expect(extractionValidationReason(error)).toBeNull();
    const instruction = extractionRepairInstruction({
      error,
      toolName: 'extract_records',
      invalidArguments: { value: 'x'.repeat(33000) },
    });
    expect(instruction).toContain('draftOmitted');
    expect(instruction).not.toContain('private');
    expect(instruction).not.toContain('x'.repeat(100));
  });
});
