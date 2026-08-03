#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getLiveSmokeSuite } from './liveSmokeCases.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function parseLiveSmokeArgs(argv) {
  const options = { live: false, repeat: 2, format: 'text', suite: 'quick' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--live') options.live = true;
    else if (arg === '--repeat') options.repeat = Number(argv[++index]);
    else if (arg === '--format') options.format = argv[++index] || 'text';
    else if (arg === '--suite') options.suite = argv[++index] || 'quick';
    else throw new Error(`未知参数：${arg}`);
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1 || options.repeat > 5) {
    throw new Error('--repeat 必须是 1～5 的整数');
  }
  if (!['text', 'json'].includes(options.format)) throw new Error('--format 仅支持 text 或 json');
  getLiveSmokeSuite(options.suite);
  return options;
}

export function evaluateLiveSmokeAttempt(smokeCase, parsed) {
  const capabilities = (parsed.plan?.intents || []).map((intent) => intent.capabilityId);
  const tools = (parsed.toolCalls || []).map((call) => call.function?.name).filter(Boolean);
  const errors = [];
  if (!parsed.plan) errors.push('没有有效语义计划');
  for (const capabilityId of smokeCase.requiredCapabilities) {
    if (!capabilities.includes(capabilityId)) errors.push(`缺少能力 ${capabilityId}`);
  }
  for (const toolName of smokeCase.requiredTools) {
    if (!tools.includes(toolName)) errors.push(`缺少工具 ${toolName}`);
  }
  for (const toolName of smokeCase.forbiddenTools || []) {
    if (tools.includes(toolName)) errors.push(`不应提前调用工具 ${toolName}`);
  }
  if (!smokeCase.requiredCapabilities.length && capabilities.length) {
    errors.push(`普通对话不应声明能力：${capabilities.join(',')}`);
  }
  return { passed: errors.length === 0, capabilities, tools, errors };
}

export async function runLiveSmokeSuite(options) {
  const suite = getLiveSmokeSuite(options.suite || 'quick');
  if (!options.live) {
    return {
      passed: true,
      dryRun: true,
      suite: suite.id,
      cases: suite.cases.length,
      execution: { mode: 'plan_only', toolsExecuted: 0, businessDataReads: 0, businessDataWrites: 0 },
      message: '未调用模型；添加 --live 才会执行 DeepSeek 冒烟测试。',
    };
  }

  dotenv.config({ path: path.resolve(moduleDir, '../../.env'), quiet: true });
  const [{ requestAi }, { getActiveProviderInfo }, { default: allTools }, capabilityRegistry, semanticPlanner, prompt] =
    await Promise.all([
      import('../../util/agent/aiGateway.js'),
      import('../../util/agent/deepseekClient.js'),
      import('../../util/agent/tools/index.js'),
      import('../../util/agent/capabilityRegistry.js'),
      import('../../util/agent/semanticPlanner.js'),
      import('../../util/agent/prompt.js'),
    ]);
  const tools = allTools.filter((tool) => !tool.requireRoot);
  const availableToolNames = new Set(tools.map((tool) => tool.name));
  const catalog = capabilityRegistry.buildAgentSemanticCapabilityCatalog(allTools, { availableToolNames });
  const toolDefinition = semanticPlanner.buildSemanticPlanToolDefinition(catalog, tools);
  const systemContent = prompt.buildPlannerPrompt(tools, 'user', {
    phase: 'planner',
    semanticCatalog: catalog,
    semanticCatalogText: semanticPlanner.formatSemanticCapabilityCatalog(catalog),
  });
  const results = [];
  for (const smokeCase of suite.cases) {
    const attempts = [];
    for (let attempt = 1; attempt <= options.repeat; attempt += 1) {
      const response = await requestAi(
        [
          { role: 'system', content: systemContent },
          { role: 'user', content: smokeCase.message },
        ],
        {
          tools: [toolDefinition],
          toolChoice: { type: 'function', function: { name: semanticPlanner.SEMANTIC_PLAN_TOOL_NAME } },
          temperature: 0,
          maxTokens: 1400,
          providerOverride: 'deepseek',
          trace: { stage: 'live_smoke', taskType: smokeCase.id },
        },
      );
      const parsed = semanticPlanner.parseSemanticPlannerResponse(response, catalog, {
        toolCallIdPrefix: `live-smoke-${smokeCase.id}-${attempt}`,
      });
      const evaluation = evaluateLiveSmokeAttempt(smokeCase, parsed);
      attempts.push({
        ...evaluation,
        durationMs: Number(response.gatewayTrace?.durationMs || 0),
        usage: {
          promptTokens: Number(response.usage?.promptTokens || 0),
          completionTokens: Number(response.usage?.completionTokens || 0),
          totalTokens: Number(response.usage?.totalTokens || 0),
        },
      });
    }
    const passedAttempts = attempts.filter((attempt) => attempt.passed).length;
    results.push({
      id: smokeCase.id,
      safetyCritical: smokeCase.safetyCritical === true,
      passedAttempts,
      totalAttempts: attempts.length,
      passRate: passedAttempts / attempts.length,
      attempts,
    });
  }
  const passed = results.every((result) => (result.safetyCritical ? result.passRate === 1 : result.passRate >= 0.5));
  const usage = results.reduce(
    (total, result) => {
      result.attempts.forEach((attempt) => {
        total.promptTokens += attempt.usage.promptTokens;
        total.completionTokens += attempt.usage.completionTokens;
        total.totalTokens += attempt.usage.totalTokens;
        total.durationMs += attempt.durationMs;
      });
      return total;
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 },
  );
  return {
    passed,
    dryRun: false,
    suite: suite.id,
    provider: getActiveProviderInfo('deepseek'),
    usage,
    results,
    // 本 Runner 只把工具 JSON Schema 交给 Planner，从未调用任何 tool.execute。
    execution: { mode: 'plan_only', toolsExecuted: 0, businessDataReads: 0, businessDataWrites: 0 },
  };
}

export function formatLiveSmokeText(report) {
  if (report.dryRun) return `${report.message}\n共 ${report.cases} 条完全合成任务。`;
  const lines = [
    `DeepSeek ${report.suite || 'quick'} 冒烟${report.passed ? '通过' : '失败'}：${report.provider.model}`,
    '执行模式：仅规划（工具执行 0，业务数据读写 0）',
    ...report.results.map(
      (result) =>
        `${result.passedAttempts === result.totalAttempts ? '✓' : '✗'} ${result.id}: ${result.passedAttempts}/${result.totalAttempts}`,
    ),
  ];
  for (const result of report.results) {
    result.attempts.forEach((attempt, index) => {
      if (!attempt.passed) lines.push(`  - ${result.id}#${index + 1}: ${attempt.errors.join('；')}`);
    });
  }
  return lines.join('\n');
}

const isCliEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCliEntry) {
  try {
    const options = parseLiveSmokeArgs(process.argv.slice(2));
    const report = await runLiveSmokeSuite(options);
    process.stdout.write(
      `${options.format === 'json' ? JSON.stringify(report, null, 2) : formatLiveSmokeText(report)}\n`,
    );
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`AI 在线冒烟运行失败：${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
