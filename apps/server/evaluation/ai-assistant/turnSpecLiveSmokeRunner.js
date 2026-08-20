#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getLiveSmokeSuite } from './liveSmokeCases.js';
import { buildAgentSemanticCapabilityCatalog } from '../../util/agent/capabilityRegistry.js';
import { routeTurnSpecCapabilities } from '../../util/agent/runtime/capabilityRouter.js';
import { compileAgentTurnSpec } from '../../util/agent/runtime/intentCompiler.js';
import { planAgentExecution } from '../../util/agent/runtime/executionPlanner.js';
import { validateExecutionPlan } from '../../util/agent/runtime/planValidator.js';
import { stableAgentErrorCode } from '../../util/agent/logSafety.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PROVIDERS = new Set(['deepseek', 'qwen', 'both']);
const LIVE_EVALUATION_CONCURRENCY = 4;

export function parseTurnSpecSmokeArgs(argv) {
  const options = { live: false, repeat: 20, format: 'text', suite: 'quick', provider: 'both', caseIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--live') options.live = true;
    else if (arg === '--repeat') options.repeat = Number(argv[++index]);
    else if (arg === '--format') options.format = argv[++index] || 'text';
    else if (arg === '--suite') options.suite = argv[++index] || 'quick';
    else if (arg === '--provider') options.provider = argv[++index] || 'both';
    else if (arg === '--case') options.caseIds.push(String(argv[++index] || '').trim());
    else throw new Error(`未知参数：${arg}`);
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1 || options.repeat > 20) {
    throw new Error('--repeat 必须是 1～20 的整数');
  }
  if (!['text', 'json'].includes(options.format)) throw new Error('--format 仅支持 text 或 json');
  if (!PROVIDERS.has(options.provider)) throw new Error('--provider 仅支持 deepseek、qwen 或 both');
  if (options.caseIds.some((caseId) => !caseId)) throw new Error('--case 后必须提供用例 ID');
  getLiveSmokeSuite(options.suite);
  return options;
}

function percentile(values, ratio) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function providerCost(providerInfo, usage) {
  return (
    (Number(usage.promptTokens || 0) * Number(providerInfo.price?.input || 0) +
      Number(usage.completionTokens || 0) * Number(providerInfo.price?.output || 0)) /
    1_000_000
  );
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function consume() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
  return results;
}

export function evaluateTurnSpecSmokeAttempt(smokeCase, outcome) {
  const calls = outcome.toolCalls || [];
  const toolNames = calls.map((call) => call?.function?.name).filter(Boolean);
  const toolArguments = Object.fromEntries(
    calls.flatMap((call) => {
      const toolName = call?.function?.name;
      if (!toolName) return [];
      try {
        return [[toolName, JSON.parse(call.function?.arguments || '{}')]];
      } catch {
        return [[toolName, null]];
      }
    }),
  );
  const errors = [];
  const clarified = outcome.state === 'clarification';
  if (Boolean(smokeCase.expectedNeedsClarification) !== clarified) {
    errors.push(smokeCase.expectedNeedsClarification ? 'missing_clarification' : 'unexpected_clarification');
  }
  for (const toolName of smokeCase.requiredTools || []) {
    if (!toolNames.includes(toolName)) errors.push(`missing_tool:${toolName}`);
  }
  for (const toolName of smokeCase.forbiddenTools || []) {
    if (toolNames.includes(toolName)) errors.push(`extra_tool:${toolName}`);
  }
  for (const [toolName, expectedArguments] of Object.entries(smokeCase.requiredToolArguments || {})) {
    const actualArguments = toolArguments[toolName];
    if (!actualArguments || typeof actualArguments !== 'object') {
      errors.push(`missing_tool_arguments:${toolName}`);
      continue;
    }
    for (const [key, expectedValue] of Object.entries(expectedArguments || {})) {
      const acceptedValues = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
      if (!acceptedValues.includes(actualArguments[key])) {
        errors.push(`invalid_tool_argument:${toolName}.${key}`);
      }
    }
  }
  if (!(smokeCase.requiredTools || []).length && toolNames.length) {
    errors.push(`unexpected_tools:${toolNames.join(',')}`);
  }
  if (clarified && toolNames.length) errors.push('tool_during_clarification');
  if (outcome.validation?.valid === false) errors.push(...(outcome.validation.issues || []));
  return { passed: errors.length === 0, errors, toolNames, clarified };
}

async function runProvider({ provider, suite, repeat, requestAi, allTools, getActiveProviderInfo }) {
  const providerInfo = getActiveProviderInfo(provider);
  const roleContexts = new Map();
  const contextForRole = (role) => {
    const normalizedRole = role === 'root' ? 'root' : 'user';
    if (roleContexts.has(normalizedRole)) return roleContexts.get(normalizedRole);
    const tools = normalizedRole === 'root' ? allTools : allTools.filter((tool) => !tool.requireRoot);
    const catalog = buildAgentSemanticCapabilityCatalog(allTools, {
      availableToolNames: new Set(tools.map((tool) => tool.name)),
    });
    const context = { tools, catalog };
    roleContexts.set(normalizedRole, context);
    return context;
  };
  const jobs = suite.cases.flatMap((smokeCase) =>
    Array.from({ length: repeat }, (_, index) => ({ smokeCase, attempt: index + 1 })),
  );
  const attempts = await mapWithConcurrency(jobs, LIVE_EVALUATION_CONCURRENCY, async ({ smokeCase, attempt }) => {
    const { tools, catalog } = contextForRole(smokeCase.role);
    const responses = [];
    const startedAt = Date.now();
    let outcome;
    let protocolFailure = null;
    try {
      const request = (messages, options) => requestAi(messages, { ...options, providerOverride: provider });
      const compiled = await compileAgentTurnSpec({
        message: smokeCase.message,
        history: [],
        domainCatalog: catalog,
        contextSummary: { actorRole: smokeCase.role === 'root' ? 'root' : 'user' },
        authoritativeGroundingPolicy: /https?:\/\//iu.test(smokeCase.message)
          ? 'current_explicit_only'
          : 'general_knowledge',
        traceId: `turn-spec-smoke-${smokeCase.id}-${attempt}`,
        request,
        onResponse: (response) => responses.push(response),
      });
      if (compiled.turnSpec.confidence === 'low' || compiled.turnSpec.missingSlots.length) {
        outcome = { state: 'clarification', turnSpec: compiled.turnSpec, toolCalls: [] };
      } else if (compiled.turnSpec.requestKind === 'conversation' && compiled.turnSpec.goals.length === 0) {
        outcome = { state: 'ready_for_composer', turnSpec: compiled.turnSpec, toolCalls: [] };
      } else {
        const route = routeTurnSpecCapabilities({
          turnSpec: compiled.turnSpec,
          catalog,
          tools,
          message: smokeCase.message,
        });
        if (route.state === 'clarification' || route.state === 'unsupported' || !route.candidates.length) {
          outcome = { state: route.state, turnSpec: compiled.turnSpec, route, toolCalls: [] };
        } else {
          const planned = await planAgentExecution({
            turnSpec: compiled.turnSpec,
            route,
            request,
            traceId: `turn-spec-smoke-${smokeCase.id}-${attempt}`,
            validate: validateExecutionPlan,
            onResponse: (response) => responses.push(response),
          });
          outcome = {
            state: planned.validation?.valid ? 'ready_for_tools' : 'blocked',
            turnSpec: compiled.turnSpec,
            route,
            validation: planned.validation,
            toolCalls: planned.validation?.toolCalls || [],
          };
        }
      }
    } catch (error) {
      protocolFailure = stableAgentErrorCode(error);
      outcome = { state: 'blocked', toolCalls: [] };
    }
    const strict = evaluateTurnSpecSmokeAttempt(smokeCase, outcome);
    const usage = responses.reduce(
      (total, response) => ({
        promptTokens: total.promptTokens + Number(response?.usage?.promptTokens || 0),
        completionTokens: total.completionTokens + Number(response?.usage?.completionTokens || 0),
        totalTokens: total.totalTokens + Number(response?.usage?.totalTokens || 0),
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    );
    return {
      caseId: smokeCase.id,
      attempt,
      passed: strict.passed && !protocolFailure,
      errors: protocolFailure ? [...strict.errors, `protocol:${protocolFailure}`] : strict.errors,
      protocolFailure,
      clarification: strict.clarified,
      candidateToolCount: outcome.route?.candidateToolCount || 0,
      candidateDomainCount: outcome.route?.candidateDomainCount || 0,
      durationMs: Date.now() - startedAt,
      usage,
      costCny: providerCost(providerInfo, usage),
    };
  });
  const passed = attempts.filter((attempt) => attempt.passed).length;
  const catastrophic = attempts.filter((attempt) =>
    attempt.errors.some(
      (error) =>
        error === 'tool_during_clarification' ||
        error === 'extra_tool_call_blocked' ||
        error.startsWith('extra_tool:') ||
        error.startsWith('unexpected_tools:'),
    ),
  );
  const usage = attempts.reduce(
    (total, attempt) => ({
      promptTokens: total.promptTokens + attempt.usage.promptTokens,
      completionTokens: total.completionTokens + attempt.usage.completionTokens,
      totalTokens: total.totalTokens + attempt.usage.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
  const strictPassRate = attempts.length ? passed / attempts.length : 0;
  const candidateP95 = percentile(
    attempts.map((attempt) => attempt.candidateToolCount),
    0.95,
  );
  return {
    provider: providerInfo,
    passed: strictPassRate >= 0.95 && catastrophic.length === 0 && candidateP95 <= 12,
    strictPassRate,
    protocolFailureRate: attempts.length
      ? attempts.filter((attempt) => attempt.protocolFailure).length / attempts.length
      : 0,
    catastrophicFailureCount: catastrophic.length,
    candidateTools: {
      average: attempts.length
        ? attempts.reduce((sum, attempt) => sum + attempt.candidateToolCount, 0) / attempts.length
        : 0,
      p95: candidateP95,
      maximum: Math.max(0, ...attempts.map((attempt) => attempt.candidateToolCount)),
    },
    latencyMs: {
      average: attempts.length ? attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0) / attempts.length : 0,
      p95: percentile(
        attempts.map((attempt) => attempt.durationMs),
        0.95,
      ),
    },
    usage,
    costCny: attempts.reduce((sum, attempt) => sum + attempt.costCny, 0),
    attempts,
  };
}

export function selectTurnSpecProvider(reports = []) {
  const eligible = reports.filter(
    (report) =>
      report.strictPassRate >= 0.95 && report.catastrophicFailureCount === 0 && report.candidateTools?.p95 <= 12,
  );
  if (!eligible.length) return { provider: null, reason: 'no_provider_meets_contract_gate' };
  const selected = [...eligible].sort(
    (left, right) =>
      right.strictPassRate - left.strictPassRate ||
      left.protocolFailureRate - right.protocolFailureRate ||
      left.latencyMs.p95 - right.latencyMs.p95 ||
      left.costCny - right.costCny,
  )[0];
  return {
    provider: selected.provider.provider,
    model: selected.provider.model,
    reason: 'contract_pass_then_protocol_latency_cost',
  };
}

export async function runTurnSpecLiveSmoke(options) {
  const sourceSuite = getLiveSmokeSuite(options.suite || 'quick');
  const requestedCaseIds = new Set(options.caseIds || []);
  const selectedCases = sourceSuite.cases.filter(
    (smokeCase) => !requestedCaseIds.size || requestedCaseIds.has(smokeCase.id),
  );
  if (!selectedCases.length) throw new Error('没有匹配 --case 的 TurnSpec V2 用例');
  const suite = { ...sourceSuite, cases: selectedCases };
  const providers = options.provider === 'both' ? ['deepseek', 'qwen'] : [options.provider];
  if (!options.live) {
    return {
      passed: true,
      dryRun: true,
      runtime: 'turn_spec_v2',
      suite: suite.id,
      providers,
      repeat: options.repeat,
      cases: suite.cases.length,
      businessToolsExecuted: 0,
      message: '未调用模型；添加 --live 后才会运行隔离的 TurnSpec V2 Provider A/B。',
    };
  }
  dotenv.config({ path: path.resolve(moduleDir, '../../.env'), quiet: true });
  const [{ requestAi }, { getActiveProviderInfo }, { default: allTools }] = await Promise.all([
    import('../../util/agent/aiGateway.js'),
    import('../../util/agent/deepseekClient.js'),
    import('../../util/agent/tools/index.js'),
  ]);
  const reports = [];
  for (const provider of providers) {
    reports.push(
      await runProvider({ provider, suite, repeat: options.repeat, requestAi, allTools, getActiveProviderInfo }),
    );
  }
  const decision = selectTurnSpecProvider(reports);
  return {
    passed: reports.every((report) => report.passed) && decision.provider !== null,
    dryRun: false,
    runtime: 'turn_spec_v2',
    suite: suite.id,
    repeat: options.repeat,
    businessToolsExecuted: 0,
    reports,
    decision,
  };
}

export function formatTurnSpecSmokeText(report) {
  if (report.dryRun)
    return `${report.message}\n${report.providers.join(' vs ')}：${report.cases} 条 × ${report.repeat} 次。`;
  const lines = [
    `TurnSpec V2 Provider A/B：${report.passed ? '通过' : '未通过'}`,
    ...report.reports.map(
      (item) =>
        `${item.provider.provider}/${item.provider.model} strict=${(item.strictPassRate * 100).toFixed(1)}% ` +
        `protocol=${(item.protocolFailureRate * 100).toFixed(1)}% tools.p95=${item.candidateTools.p95} ` +
        `latency.p95=${item.latencyMs.p95}ms cost=¥${item.costCny.toFixed(4)}`,
    ),
    `推荐：${report.decision.provider || '无'}（${report.decision.reason}）`,
    '隔离评测未执行任何真实业务工具或业务数据读写。',
  ];
  return lines.join('\n');
}

const isCliEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCliEntry) {
  try {
    const options = parseTurnSpecSmokeArgs(process.argv.slice(2));
    const report = await runTurnSpecLiveSmoke(options);
    await new Promise((resolve) =>
      process.stdout.write(
        `${options.format === 'json' ? JSON.stringify(report, null, 2) : formatTurnSpecSmokeText(report)}\n`,
        resolve,
      ),
    );
    process.exit(report.passed ? 0 : 1);
  } catch (error) {
    await new Promise((resolve) =>
      process.stderr.write(
        `TurnSpec V2 在线冒烟运行失败：${error instanceof Error ? error.message : String(error)}\n`,
        resolve,
      ),
    );
    process.exit(1);
  }
}
