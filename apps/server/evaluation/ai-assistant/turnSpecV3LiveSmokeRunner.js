#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { stableAgentErrorCode } from '../../util/agent/logSafety.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PROVIDERS = new Set(['deepseek', 'qwen']);
const MAX_LIVE_CASES = 2;

export const TURN_SPEC_V3_SMOKE_CASES = Object.freeze([
  Object.freeze({
    id: 'today-note-artifact',
    role: 'user',
    message: '根据今天的全部笔记生成一篇新笔记，至少 2000 字，不要编造事实。',
    groundingPolicy: 'workspace_query',
    expectedRequestKind: 'create_artifact',
    expectedCapabilities: Object.freeze(['note.query', 'note.create']),
    expectedTemporal: Object.freeze([{ capabilityId: 'note.query', slot: 'timeRange', argumentValue: '今天' }]),
    expectedContinuationMode: 'independent',
    expectedTopicEpochAction: 'advance',
  }),
  Object.freeze({
    id: 'todo-reminder-at',
    role: 'user',
    message: '查询提醒时间是今天 16 点的待办。',
    groundingPolicy: 'workspace_query',
    expectedRequestKind: 'answer',
    expectedCapabilities: Object.freeze(['todo.query']),
    expectedTemporal: Object.freeze([
      { capabilityId: 'todo.query', slot: 'planDate', argumentValue: '2026-08-20' },
      { capabilityId: 'todo.query', slot: 'reminderAt', argumentValue: '2026-08-20 16:00' },
    ]),
    expectedContinuationMode: 'independent',
    expectedTopicEpochAction: 'advance',
  }),
  Object.freeze({
    id: 'selected-bookmark-analysis',
    role: 'user',
    message: '总结这个书签对应的网页内容。',
    groundingPolicy: 'current_explicit_only',
    contextSummary: Object.freeze({ selectedResourceTypes: ['bookmark'], selectedResourceCount: 1 }),
    expectedRequestKind: 'answer',
    expectedCapabilities: Object.freeze(['web.read']),
    expectedReferent: Object.freeze({ capabilityId: 'web.read', source: 'current_explicit', type: 'bookmark' }),
    expectedContinuationMode: 'independent',
    expectedTopicEpochAction: 'advance',
  }),
  Object.freeze({
    id: 'cross-domain-switch',
    role: 'user',
    message: '查看最近 7 天书签的详细链接。',
    groundingPolicy: 'workspace_query',
    discourseProjection: Object.freeze({
      schemaVersion: 3,
      revision: 4,
      topicEpoch: 2,
      activeDomain: 'note',
      lastCapabilityIds: ['note.query'],
      lastResultSet: { available: true, domains: ['note'], refTypes: ['note'], refCount: 5 },
    }),
    expectedRequestKind: 'answer',
    expectedCapabilities: Object.freeze(['bookmark.query']),
    expectedTemporal: Object.freeze([{ capabilityId: 'bookmark.query', slot: 'timeRange', argumentValue: '最近7天' }]),
    expectedContinuationMode: 'independent',
    expectedTopicEpochAction: 'advance',
  }),
  Object.freeze({
    id: 'root-today-new-users',
    role: 'root',
    message: '今天新增了多少用户？',
    groundingPolicy: 'workspace_query',
    expectedRequestKind: 'answer',
    expectedCapabilities: Object.freeze(['admin.user.query']),
    expectedTemporal: Object.freeze([
      { capabilityId: 'admin.user.query', slot: 'registeredWithin', argumentValue: '今天' },
    ]),
    expectedContinuationMode: 'independent',
    expectedTopicEpochAction: 'advance',
  }),
]);

export function parseTurnSpecV3SmokeArgs(argv = []) {
  const options = { live: false, repeat: 1, format: 'text', provider: 'deepseek', caseIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--live') options.live = true;
    else if (arg === '--repeat') options.repeat = Number(argv[++index]);
    else if (arg === '--format') options.format = String(argv[++index] || 'text');
    else if (arg === '--provider') options.provider = String(argv[++index] || 'deepseek');
    else if (arg === '--case') options.caseIds.push(String(argv[++index] || '').trim());
    else throw new Error(`未知参数：${arg}`);
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1 || options.repeat > 3) {
    throw new Error('--repeat 必须是 1～3 的整数');
  }
  if (!['text', 'json'].includes(options.format)) throw new Error('--format 仅支持 text 或 json');
  if (!PROVIDERS.has(options.provider)) throw new Error('--provider 仅支持 deepseek 或 qwen');
  if (options.caseIds.some((caseId) => !caseId)) throw new Error('--case 后必须提供用例 ID');
  if (new Set(options.caseIds).size !== options.caseIds.length) throw new Error('--case 不得重复');
  if (options.live && !options.caseIds.length) throw new Error('真实冒烟必须显式指定 --case，防止意外消耗 Token');
  if (options.caseIds.length > MAX_LIVE_CASES) throw new Error(`一次最多选择 ${MAX_LIVE_CASES} 个用例`);
  return options;
}

export function evaluateTurnSpecV3SmokeAttempt(smokeCase, turnSpec) {
  const errors = [];
  const goals = Array.isArray(turnSpec?.goals) ? turnSpec.goals : [];
  const actualCapabilities = [...new Set(goals.map((goal) => goal.capabilityId).filter(Boolean))];
  const expectedCapabilities = [...smokeCase.expectedCapabilities];
  for (const capabilityId of expectedCapabilities) {
    if (!actualCapabilities.includes(capabilityId)) errors.push(`missing_capability:${capabilityId}`);
  }
  for (const capabilityId of actualCapabilities) {
    if (!expectedCapabilities.includes(capabilityId)) errors.push(`unexpected_capability:${capabilityId}`);
  }
  if (turnSpec?.requestKind !== smokeCase.expectedRequestKind) errors.push('request_kind_mismatch');
  if (turnSpec?.continuationMode !== smokeCase.expectedContinuationMode) errors.push('continuation_mode_mismatch');
  if (turnSpec?.topicEpochAction !== smokeCase.expectedTopicEpochAction) errors.push('topic_epoch_action_mismatch');
  if (turnSpec?.missingSlots?.length) errors.push('unexpected_missing_slots');

  for (const expected of smokeCase.expectedTemporal || []) {
    const goalIds = new Set(goals.filter((goal) => goal.capabilityId === expected.capabilityId).map((goal) => goal.id));
    const found = (turnSpec?.temporalConstraints || []).some(
      (constraint) =>
        goalIds.has(constraint.goalId) &&
        constraint.slot === expected.slot &&
        constraint.argumentValue === expected.argumentValue,
    );
    if (!found) errors.push(`temporal_mismatch:${expected.capabilityId}.${expected.slot}`);
  }

  if (smokeCase.expectedReferent) {
    const referents = goals
      .filter((goal) => goal.capabilityId === smokeCase.expectedReferent.capabilityId)
      .flatMap((goal) => goal.referentSelectors || []);
    if (
      !referents.some(
        (selector) =>
          selector.source === smokeCase.expectedReferent.source &&
          selector.types.includes(smokeCase.expectedReferent.type),
      )
    ) {
      errors.push(`referent_mismatch:${smokeCase.expectedReferent.capabilityId}`);
    }
  }
  return { passed: errors.length === 0, errors, actualCapabilities };
}

function providerCost(providerInfo, usage) {
  return (
    (Number(usage.promptTokens || 0) * Number(providerInfo.price?.input || 0) +
      Number(usage.completionTokens || 0) * Number(providerInfo.price?.output || 0)) /
    1_000_000
  );
}

export async function runTurnSpecV3LiveSmoke(options, dependencies = {}) {
  const selectedIds = new Set(options.caseIds || []);
  const cases = TURN_SPEC_V3_SMOKE_CASES.filter((item) => !selectedIds.size || selectedIds.has(item.id));
  if (selectedIds.size && selectedIds.size !== cases.length) throw new Error('存在未知的 TurnSpec V3 用例 ID');
  if (options.live && !selectedIds.size) throw new Error('真实冒烟必须显式选择用例');
  if (selectedIds.size > MAX_LIVE_CASES) throw new Error(`一次最多选择 ${MAX_LIVE_CASES} 个用例`);
  const maximumModelCalls = cases.length * options.repeat * 2;
  if (!options.live) {
    return {
      passed: true,
      dryRun: true,
      runtime: 'turn_spec_v3',
      provider: options.provider,
      repeat: options.repeat,
      cases: cases.map((item) => item.id),
      maximumModelCalls,
      businessToolsExecuted: 0,
      message: '未调用模型；真实模式必须用 --live 并显式选择最多 2 个 --case。',
    };
  }

  dotenv.config({ path: path.resolve(moduleDir, '../../.env'), quiet: true });
  const [{ requestAi }, { getActiveProviderInfo }, { default: allTools }, manifest, compiler] = await Promise.all([
    dependencies.requestAi ? { requestAi: dependencies.requestAi } : import('../../util/agent/aiGateway.js'),
    dependencies.getActiveProviderInfo
      ? { getActiveProviderInfo: dependencies.getActiveProviderInfo }
      : import('../../util/agent/deepseekClient.js'),
    dependencies.allTools ? { default: dependencies.allTools } : import('../../util/agent/tools/index.js'),
    dependencies.buildAgentV3CapabilityCatalog
      ? { buildAgentV3CapabilityCatalog: dependencies.buildAgentV3CapabilityCatalog }
      : import('../../util/agent/runtime/v3/capabilityManifest.js'),
    dependencies.compileAgentTurnSpecV3
      ? { compileAgentTurnSpecV3: dependencies.compileAgentTurnSpecV3 }
      : import('../../util/agent/runtime/v3/intentCompiler.js'),
  ]);
  const providerInfo = getActiveProviderInfo(options.provider);
  const attempts = [];
  for (const smokeCase of cases) {
    const roleTools = smokeCase.role === 'root' ? allTools : allTools.filter((tool) => !tool.requireRoot);
    const catalog = manifest.buildAgentV3CapabilityCatalog(roleTools, {
      availableToolNames: new Set(roleTools.map((tool) => tool.name)),
      actorRole: smokeCase.role,
    });
    for (let attempt = 1; attempt <= options.repeat; attempt += 1) {
      const responses = [];
      const startedAt = Date.now();
      let compiled = null;
      let protocolFailure = null;
      try {
        compiled = await compiler.compileAgentTurnSpecV3({
          message: smokeCase.message,
          catalog,
          discourseProjection: smokeCase.discourseProjection || {},
          contextSummary: smokeCase.contextSummary || {},
          authoritativeGroundingPolicy: smokeCase.groundingPolicy,
          temporalContext: {
            timeZone: 'Asia/Singapore',
            currentDate: '2026-08-20',
            currentDateTime: '2026-08-20 18:00:00',
          },
          actorRole: smokeCase.role,
          traceId: `turn-spec-v3-smoke-${smokeCase.id}-${attempt}`,
          request: (messages, requestOptions) =>
            requestAi(messages, { ...requestOptions, providerOverride: options.provider }),
          onResponse: (response) => responses.push(response),
        });
      } catch (error) {
        protocolFailure = stableAgentErrorCode(error);
      }
      const evaluation = evaluateTurnSpecV3SmokeAttempt(smokeCase, compiled?.turnSpec);
      const usage = responses.reduce(
        (total, response) => ({
          promptTokens: total.promptTokens + Number(response?.usage?.promptTokens || 0),
          completionTokens: total.completionTokens + Number(response?.usage?.completionTokens || 0),
          totalTokens: total.totalTokens + Number(response?.usage?.totalTokens || 0),
        }),
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      );
      attempts.push({
        caseId: smokeCase.id,
        attempt,
        passed: evaluation.passed && !protocolFailure,
        errors: protocolFailure ? [...evaluation.errors, `protocol:${protocolFailure}`] : evaluation.errors,
        compilerAttempts: compiled?.attempts || responses.length,
        durationMs: Date.now() - startedAt,
        usage,
        costCny: providerCost(providerInfo, usage),
      });
    }
  }
  return {
    passed: attempts.every((attempt) => attempt.passed),
    dryRun: false,
    runtime: 'turn_spec_v3',
    provider: { provider: providerInfo.provider, model: providerInfo.model },
    repeat: options.repeat,
    cases: cases.map((item) => item.id),
    maximumModelCalls,
    actualModelCalls: attempts.reduce((sum, attempt) => sum + attempt.compilerAttempts, 0),
    businessToolsExecuted: 0,
    usage: attempts.reduce(
      (total, attempt) => ({
        promptTokens: total.promptTokens + attempt.usage.promptTokens,
        completionTokens: total.completionTokens + attempt.usage.completionTokens,
        totalTokens: total.totalTokens + attempt.usage.totalTokens,
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    ),
    costCny: attempts.reduce((sum, attempt) => sum + attempt.costCny, 0),
    attempts,
  };
}

export function formatTurnSpecV3SmokeText(report) {
  if (report.dryRun) {
    return `${report.message}\n${report.cases.length} 个可选用例，当前最多 ${report.maximumModelCalls} 次模型请求，业务工具执行 0 次。`;
  }
  return [
    `TurnSpec V3 低成本冒烟：${report.passed ? '通过' : '未通过'}`,
    `Provider：${report.provider.provider}/${report.provider.model}`,
    `用例：${report.cases.join(', ')}`,
    `模型请求：${report.actualModelCalls}/${report.maximumModelCalls}，Token：${report.usage.totalTokens}，估算成本：¥${report.costCny.toFixed(4)}`,
    `业务工具执行：${report.businessToolsExecuted}`,
    ...report.attempts
      .filter((item) => !item.passed)
      .map((item) => `${item.caseId}#${item.attempt}: ${item.errors.join(', ')}`),
  ].join('\n');
}

const isCliEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCliEntry) {
  try {
    const options = parseTurnSpecV3SmokeArgs(process.argv.slice(2));
    const report = await runTurnSpecV3LiveSmoke(options);
    process.stdout.write(
      `${options.format === 'json' ? JSON.stringify(report, null, 2) : formatTurnSpecV3SmokeText(report)}\n`,
    );
    process.exit(report.passed ? 0 : 1);
  } catch (error) {
    process.stderr.write(`TurnSpec V3 冒烟运行失败：${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
