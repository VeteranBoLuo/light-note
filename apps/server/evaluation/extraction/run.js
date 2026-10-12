import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import { fixtures } from './fixtures.js';
import { planTool, extractTool, planMessages, extractionMessages, validatePlan, validateRecords } from './contract.js';
import { score } from './score.js';

const args = process.argv.slice(2);
const caseArgs = args.filter((a) => a.startsWith('--cases='));
const selectedIds = caseArgs[0]?.slice('--cases='.length).split(',') || fixtures.map((f) => f.id);
if (
  caseArgs.length > 1 ||
  selectedIds.some((id) => !fixtures.some((f) => f.id === id)) ||
  new Set(selectedIds).size !== selectedIds.length
)
  throw new Error('Cases must be unique fixed fixture IDs: courses,products,events,boundary');
const selected = fixtures.filter((f) => selectedIds.includes(f.id));
if (
  args.some((a) => !['--live', '--smoke'].includes(a) && !a.startsWith('--cases=')) ||
  (args.includes('--live') && args.includes('--smoke'))
)
  throw new Error('Usage: node evaluation/extraction/run.js [--live | --smoke] [--cases=events,boundary]');
if (!args.includes('--live') && !args.includes('--smoke')) {
  console.log(
    JSON.stringify(
      {
        mode: 'offline-plan',
        cases: selected.map((f) => ({
          id: f.id,
          kind: f.kind,
          expectedRecords: f.rows.length,
          inputBytes: Buffer.byteLength(JSON.stringify(f.source)),
        })),
        maxProviderCalls: selected.length * 2,
        maxReservedTokens: selected.length * 20000,
        productionInfrastructure: 'disabled',
        automaticRetry: false,
      },
      null,
      2,
    ),
  );
} else {
  const { loadRuntime, localAdapters } = await import('./runtime.js');
  // Load only provider settings; never load DB, Redis, storage or email settings from .env.
  if (args.includes('--live')) {
    const envPath = new URL('../../.env', import.meta.url);
    let settings = {};
    try {
      settings = parse(readFileSync(envPath));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    for (const key of [
      'DEEPSEEK_API_KEY',
      'DEEPSEEK_MODEL',
      'DASHSCOPE_API_KEY',
      'QWEN_MODEL',
      'AGENT_LLM_PROVIDER',
      'AGENT_DEFAULT_PROVIDER',
      'AGENT_DEFAULT_MODEL',
    ]) {
      if (!process.env[key] && settings[key]) process.env[key] = settings[key];
    }
  }
  const runtime = await loadRuntime();
  try {
    if (args.includes('--smoke')) {
      // Import-only smoke: no provider call, no credential file read and no production connection.
      console.log('Real Execution/Gateway imported; production adapters isolated; no model called.');
    } else {
      const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
      const dir = fileURLToPath(new URL(`../../../../docs/plan/extraction-evaluation/${id}/`, import.meta.url));
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const adapters = localAdapters(`${dir}/ledger.jsonl`, selected.length * 20_000);
      const results = [];
      const persist = () => {
        writeFileSync(
          `${dir}/results.json`,
          JSON.stringify(
            {
              id,
              version: 3,
              promptVersion: 2,
              contractVersion: 3,
              scoreVersion: 2,
              mode: 'live',
              results,
              events: adapters.events,
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
        writeFileSync(`${dir}/report.md`, report(results, adapters.events), { mode: 0o600 });
      };
      console.log(`Report directory: ${dir}`);
      for (const fixture of selected) {
        const result = { fixture: fixture.id, kind: fixture.kind, source: fixture.source, status: 'running' };
        results.push(result);
        persist();
        try {
          await runtime.runAiExecution(
            {
              billingPolicy: 'system',
              systemId: 'extraction_evaluation',
              taskType: 'extraction_evaluation',
              surface: 'local_evaluation',
              requestId: `${id.slice(0, 36)}-${fixture.id}`,
              reservationTokens: 20_000,
              providerPlan: { model_generation: { billingScope: 'user', maxCalls: 2 } },
              persistence: adapters.persistence,
            },
            async () => {
              const invoke = (messages, structuredTool, validateArguments, stage, maxTokens) =>
                runtime.callStructuredSkillModel({
                  messages,
                  structuredTool,
                  validateArguments,
                  trace: { stage, taskType: 'extraction_evaluation' },
                  modelPolicy: { maxTokens, temperature: 0, timeoutMs: 90_000 },
                  repairableErrorCodes: [],
                });
              result.plan = await invoke(
                planMessages(fixture),
                planTool,
                (raw) => {
                  result.planCandidate = raw;
                  persist();
                  return validatePlan(raw);
                },
                'extraction_eval_plan',
                1800,
              );
              persist();
              result.records = await invoke(
                extractionMessages(fixture, result.plan),
                extractTool,
                (raw) => {
                  result.extractionCandidate = raw;
                  persist();
                  return validateRecords(raw, result.plan, fixture.source);
                },
                'extraction_eval_records',
                6000,
              );
              result.score = score(fixture, result.plan, result.records);
              result.status = 'success';
              persist(); // A deliverable is saved before Execution settles.
            },
            { quota: adapters.quota },
          );
          console.log(
            `${fixture.id}: ${result.score.matchedRecords}/${result.score.expectedRecords} records; ${result.score.correctCells}/${result.score.expectedCells} checked facts`,
          );
        } catch (error) {
          result.status = 'failed';
          result.errorCode = /^[A-Z][A-Z0-9_]{1,100}$/.test(error.code || '') ? error.code : 'EXTRACTION_EVAL_FAILED';
          if (error.code === 'EXTRACTION_EVAL_CONTRACT_INVALID') result.contractReason = error.message;
          console.log(`${fixture.id}: ${result.errorCode}; no automatic retry`);
        }
        persist();
        // Unknown/failed paid calls are not automatically resubmitted, even as another fixture.
        if (result.status === 'failed') break;
      }
      if (results.some((r) => r.status === 'failed')) process.exitCode = 1;
    }
  } finally {
    runtime.dispose();
  }
}

function report(results, events) {
  const escape = (v) =>
    String(v ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, '<br>');
  const spans = events.filter((e) => e.event === 'provider_span');
  const rows = [
    '# AI 资料转表格：核心能力实验',
    '',
    '本报告验证自动建议字段、多条目提取和依据契约。公开材料仅为明确选取的事实节选；边界材料为自编模拟。未验证完整网页抓取、文件解析、OCR、长文分段、长期保存、真实用户节时或生产计费。',
    '',
    `实际模型调用：${spans.length}；模型报告 Token：${spans.reduce((n, s) => n + s.usage.totalTokens, 0)}；用量缺失调用：${spans.filter((s) => s.usageStatus !== 'reported').length}。`,
    `模型：${[...new Set(spans.map((s) => `${s.provider}/${s.model}`))].join('、')}。根执行与 Span 使用真实基础设施逻辑，账本和预算适配器仅写本地，不代表已验证生产额度扣费。`,
    '',
    '自动评分采用固定答案，检查记录身份与对应字段，不向模型提供答案。不熟悉的字段命名、合并时间列或将单位写入列名可能被保守评分标记，需人工复核；引用存在只证明片段存在，不证明字段语义正确。',
    '',
    '| 材料 | 状态 | 记录匹配/预期 | 产出记录 | 字段检查项/预期 |',
    '| --- | --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| ${r.fixture} | ${r.status} | ${r.score ? `${r.score.matchedRecords}/${r.score.expectedRecords}` : '—'} | ${r.records?.length ?? '—'} | ${r.score ? `${r.score.correctCells}/${r.score.expectedCells}` : '—'} |`,
    ),
    '',
  ];
  for (const r of results) {
    rows.push(
      `## ${r.source.title}`,
      '',
      r.source.url ? `[公开来源](${r.source.url})` : '自编测试，不是实际用户资料。',
      '',
      `覆盖：${r.source.coverage}`,
      '',
    );
    if (r.errorCode) rows.push(`失败：${r.errorCode}。${r.contractReason || '本次未记录校验细节。'}未重试。`, '');
    if (!r.plan) continue;
    rows.push(
      `AI 建议：${r.plan.recordDefinition}`,
      `字段建议待确认项：${JSON.stringify(r.plan.issues || [])}；依据不足单元格：${r.score?.evidenceIssueCells ?? '尚未检查'}。`,
      '',
      `| ${r.plan.fields.map((f) => escape(f.label)).join(' | ')} |`,
      `| ${r.plan.fields.map(() => '---').join(' | ')} |`,
    );
    for (const record of r.records || [])
      rows.push(
        `| ${record.cells.map((c) => escape(`${c.originalValue || '（空）'}${c.status === 'found' ? '' : ` [${c.status}]`}`)).join(' | ')} |`,
      );
    rows.push(
      '',
      '自动评分待复核项：',
      '',
      ...(!r.score
        ? ['- 未评分，不能视为通过。']
        : r.score.issues.length
          ? r.score.issues.map((i) => `- ${escape(JSON.stringify(i))}`)
          : ['- 无；仍需逐字段人工检查证据与条目归属。']),
      '',
      '输入节选：',
      '',
      '```text',
      r.source.segments.map((s) => `${s.locator}\n${s.text}`).join('\n\n'),
      '```',
      '',
    );
  }
  rows.push('完整逐字段证据、原值和稳定定位保存在同目录 results.json；调用账本保存在 ledger.jsonl。');
  return rows.join('\n');
}
