import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./fetchWebMeta.js', () => ({
  EXPLICIT_WEB_READ_MAX_BYTES: 4194304,
  classifyWebPageSnapshot: () => '',
  fetchWebMeta: async () => ({
    ok: true,
    title: '实际页面',
    description: '已经读取的真实网页材料',
    bodyText: '可靠正文',
    source: 'static_html',
  }),
}));
import * as gatewayModule from './agent/aiGateway.js';
import { runAiExecution } from './aiExecution/service.js';
import { createAiSkillExecutionConfig } from './aiBillingCatalog.js';
import bookmarkSkill from './aiSkill/skills/bookmarkParseSkill.js';
import { suggestBookmarkMeta } from './aiOrganize.js';

function providerResponse(fields, tokens = 50) {
  return {
    content: '',
    provider: 'deepseek',
    model: 'test',
    usageStatus: 'reported',
    usage: { promptTokens: tokens - 10, completionTokens: 10, totalTokens: tokens },
    toolCalls: [{ function: { name: 'suggest_bookmark_metadata', arguments: JSON.stringify(fields) } }],
  };
}
const empty = { name: '', description: '', tagSuggestions: [] };
const valid = { name: '有效名称', description: '根据网页材料生成的说明', tagSuggestions: [] };

function setup(client) {
  const persistence = Object.fromEntries(
    [
      'insertAiExecution',
      'updateAiExecutionReservation',
      'renewAiExecutionLease',
      'insertAiProviderSpan',
      'settleAiExecution',
    ].map((key) => [key, vi.fn()]),
  );
  const quota = {
    reserve: vi.fn().mockResolvedValue({ blocked: false, reserved: 10000, reservationKey: 'reservation' }),
    reconcile: vi.fn().mockResolvedValue(true),
  };
  const gateway = gatewayModule.createAiGateway({ completeClient: client, streamClient: vi.fn() });
  vi.spyOn(gatewayModule, 'requestAi').mockImplementation((...args) => gateway.complete(...args));
  const config = createAiSkillExecutionConfig(
    bookmarkSkill,
    {
      requestId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
      input: { url: 'https://example.com' },
      scope: { resourceRefs: [] },
      client: { surface: 'test' },
    },
    { request: { user: { id: 'u1', role: 'user' }, headers: {}, body: {} }, persistence },
  );
  return {
    persistence,
    quota,
    config,
    execute: (extra = {}) =>
      runAiExecution(config, () => suggestBookmarkMeta({ url: 'https://example.com', ...extra }), { quota }),
  };
}

afterEach(() => vi.restoreAllMocks());
describe('bookmark repair execution and billing', () => {
  it('修复复用同一 Execution 和额度预留，只结算主调用的用户用量', async () => {
    const client = vi
      .fn()
      .mockResolvedValueOnce(providerResponse(empty, 50))
      .mockResolvedValueOnce(providerResponse(valid, 30));
    const { execute, config, quota, persistence } = setup(client);
    expect(config).toMatchObject({ maxUserProviderCalls: 1, maxPlatformProviderCalls: 1 });
    expect(await execute()).toMatchObject({ name: valid.name });
    expect(client).toHaveBeenCalledTimes(2);
    expect(quota.reserve).toHaveBeenCalledOnce();
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 50, { aborted: false });
    expect(persistence.insertAiExecution).toHaveBeenCalledOnce();
    expect(persistence.insertAiProviderSpan.mock.calls.map(([span]) => span.billingScope)).toEqual([
      'user',
      'platform',
    ]);
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'success',
      providerCallCount: 2,
      chargedTokens: 50,
      usage: { totalTokens: 80 },
    });
  });

  it('修复后仍为空则失败并按零结算，保留两次真实调用，不再第三次外发', async () => {
    const client = vi.fn().mockResolvedValue(providerResponse(empty, 50));
    const { execute, quota, persistence } = setup(client);
    await expect(execute()).rejects.toMatchObject({ code: 'AI_SKILL_OUTPUT_EMPTY' });
    expect(client).toHaveBeenCalledTimes(2);
    expect(quota.reserve).toHaveBeenCalledOnce();
    expect(quota.reconcile).toHaveBeenCalledWith(expect.any(Object), 0, { aborted: false });
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      providerCallCount: 2,
      chargedTokens: 0,
      usage: { totalTokens: 100 },
    });
  });

  it('Provider 失败不自动重放，根执行没有可交付结果时不扣费', async () => {
    const client = vi.fn().mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'AI_NETWORK_ERROR' }));
    const { execute, persistence } = setup(client);
    await expect(execute()).rejects.toMatchObject({ code: 'AI_NETWORK_ERROR' });
    expect(client).toHaveBeenCalledOnce();
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      providerCallCount: 1,
      chargedTokens: 0,
    });
  });

  it('修复前租约失效时不再次外发', async () => {
    const client = vi.fn().mockResolvedValue(providerResponse(empty));
    const { execute, persistence } = setup(client);
    const beforeRequest = vi
      .fn()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(Object.assign(new Error('lost'), { code: 'ORGANIZE_LEASE_LOST' }));
    await expect(execute({ beforeRequest })).rejects.toMatchObject({ code: 'ORGANIZE_LEASE_LOST' });
    expect(client).toHaveBeenCalledOnce();
    expect(persistence.settleAiExecution.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      providerCallCount: 1,
      chargedTokens: 0,
    });
  });
});
