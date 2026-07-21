#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GOLDEN_DATASET_LIMITS, scoreGoldenResult, validateGoldenDataset, validateGoldenResult } from './schema.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATASET_PATH = path.join(moduleDir, 'golden-tasks.json');

function parseArgs(argv) {
  const options = {
    dataset: DEFAULT_DATASET_PATH,
    results: '',
    format: 'text',
    allowPartial: false,
    minScore: 1,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--dataset') options.dataset = path.resolve(argv[++index] || '');
    else if (arg === '--results') options.results = path.resolve(argv[++index] || '');
    else if (arg === '--format') options.format = argv[++index] || 'text';
    else if (arg === '--allow-partial') options.allowPartial = true;
    else if (arg === '--min-score') options.minScore = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (!['text', 'json'].includes(options.format)) throw new Error('--format 仅支持 text 或 json');
  if (!Number.isFinite(options.minScore) || options.minScore < 0 || options.minScore > 1) {
    throw new Error('--min-score 必须是 0～1 之间的数字');
  }
  return options;
}

export function readGoldenDataset(filePath = DEFAULT_DATASET_PATH) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export function readResultRecords(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (path.extname(filePath).toLowerCase() === '.json') {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('JSON 结果文件必须是数组');
    return parsed;
  }
  const records = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    try {
      records.push(JSON.parse(trimmed));
    } catch (error) {
      throw new Error(`结果文件第 ${index + 1} 行不是有效 JSON：${error.message}`);
    }
  });
  return records;
}

function countBy(items, getter) {
  return Object.fromEntries(
    [
      ...items
        .reduce((counts, item) => {
          const key = getter(item);
          counts.set(key, (counts.get(key) || 0) + 1);
          return counts;
        }, new Map())
        .entries(),
    ].sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

export function summarizeGoldenDataset(dataset) {
  const tagCounts = countBy(
    dataset.tasks.flatMap((task) => task.tags),
    (tag) => tag,
  );
  return {
    datasetId: dataset.datasetId,
    tasks: dataset.tasks.length,
    sources: dataset.sources.length,
    modes: countBy(dataset.tasks, (task) => task.mode),
    capabilities: countBy(dataset.tasks, (task) => task.capability),
    routes: countBy(dataset.tasks, (task) => task.expected.route),
    adminModes: countBy(dataset.tasks, (task) => task.identity.adminMode),
    locales: countBy(dataset.tasks, (task) => task.locale),
    entrySurfaces: countBy(dataset.tasks, (task) => task.entrySurface),
    sourceTypes: countBy(dataset.sources, (source) => source.type),
    lifecycleSignals: countBy(
      dataset.tasks.flatMap((task) => task.expected.requiredSignals),
      (signal) => signal,
    ),
    taskFamilies: {
      legacyCore: tagCounts['legacy-core'] || 0,
      productMatrixV2: tagCounts['matrix-v2'] || 0,
    },
  };
}

export function evaluateGoldenResults(dataset, results, { allowPartial = false, minScore = 1 } = {}) {
  const errors = [];
  const resultById = new Map();
  results.forEach((result, index) => {
    const shapeErrors = validateGoldenResult(result);
    shapeErrors.forEach((message) => errors.push(`results[${index}] ${message}`));
    if (result?.id) {
      if (resultById.has(result.id)) errors.push(`results[${index}].id: 结果 ID 重复`);
      resultById.set(result.id, result);
    }
  });
  const taskById = new Map(dataset.tasks.map((task) => [task.id, task]));
  for (const resultId of resultById.keys()) {
    if (!taskById.has(resultId)) errors.push(`results: 存在黄金集之外的结果 ${resultId}`);
  }
  if (!allowPartial) {
    for (const task of dataset.tasks) {
      if (!resultById.has(task.id)) errors.push(`results: 缺少任务结果 ${task.id}`);
    }
  }
  if (errors.length) {
    return {
      passed: false,
      errors,
      evaluated: 0,
      total: dataset.tasks.length,
      averageScore: 0,
      criticalFailures: 0,
      taskResults: [],
    };
  }

  const taskResults = [];
  for (const task of dataset.tasks) {
    const result = resultById.get(task.id);
    if (!result) continue;
    taskResults.push(scoreGoldenResult(task, result));
  }
  const totalScore = taskResults.reduce((sum, item) => sum + item.score, 0);
  const maxScore = taskResults.reduce((sum, item) => sum + item.maxScore, 0);
  const averageScore = maxScore ? totalScore / maxScore : 0;
  const criticalFailures = taskResults.filter((item) => item.criticalFailure).length;
  return {
    passed:
      taskResults.length > 0 &&
      criticalFailures === 0 &&
      averageScore >= minScore &&
      taskResults.every((item) => item.passed || minScore < 1),
    errors: [],
    evaluated: taskResults.length,
    total: dataset.tasks.length,
    averageScore,
    criticalFailures,
    taskResults,
  };
}

function printHelp() {
  process.stdout.write(`轻笺 AI 助手离线黄金集校验与回归评分\n\n`);
  process.stdout.write(`用法：\n`);
  process.stdout.write(`  node evaluation/ai-assistant/runner.js\n`);
  process.stdout.write(`  node evaluation/ai-assistant/runner.js --results ./results.jsonl\n\n`);
  process.stdout.write(`参数：\n`);
  process.stdout.write(`  --dataset <path>      指定黄金集 JSON\n`);
  process.stdout.write(`  --results <path>      指定适配后的 JSON/JSONL 结果\n`);
  process.stdout.write(`  --allow-partial       允许只评估结果文件中出现的任务\n`);
  process.stdout.write(`  --min-score <0..1>    最低平均得分，默认 1；安全失败仍一票否决\n`);
  process.stdout.write(`  --format text|json    输出格式\n`);
}

function formatText(report) {
  if (report.kind === 'lint') {
    const summary = report.summary;
    return [
      `黄金集校验通过：${summary.datasetId}`,
      `任务 ${summary.tasks} 条，合成来源 ${summary.sources} 个`,
      `模式：${Object.entries(summary.modes)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')}`,
      `能力：${Object.entries(summary.capabilities)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')}`,
      `语言：${Object.entries(summary.locales)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')}`,
      '未联网、未调用模型、未访问数据库。',
    ].join('\n');
  }
  const lines = [
    `离线回归${report.passed ? '通过' : '失败'}：${report.evaluated}/${report.total} 条`,
    `平均得分 ${(report.averageScore * 100).toFixed(2)}%，安全关键失败 ${report.criticalFailures} 条`,
  ];
  if (report.errors.length) lines.push(...report.errors.map((item) => `- ${item}`));
  for (const item of report.taskResults.filter((task) => !task.passed)) {
    lines.push(`- ${item.id}: ${item.score}/${item.maxScore}；${item.violations.join('；')}`);
  }
  return lines.join('\n');
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }
  const dataset = readGoldenDataset(options.dataset);
  const datasetErrors = validateGoldenDataset(dataset, GOLDEN_DATASET_LIMITS);
  if (datasetErrors.length) {
    const report = { kind: 'lint', passed: false, errors: datasetErrors };
    process.stdout.write(`${options.format === 'json' ? JSON.stringify(report, null, 2) : datasetErrors.join('\n')}\n`);
    return 1;
  }
  if (!options.results) {
    const report = { kind: 'lint', passed: true, summary: summarizeGoldenDataset(dataset) };
    process.stdout.write(`${options.format === 'json' ? JSON.stringify(report, null, 2) : formatText(report)}\n`);
    return 0;
  }
  const results = readResultRecords(options.results);
  const report = {
    kind: 'regression',
    ...evaluateGoldenResults(dataset, results, {
      allowPartial: options.allowPartial,
      minScore: options.minScore,
    }),
  };
  process.stdout.write(`${options.format === 'json' ? JSON.stringify(report, null, 2) : formatText(report)}\n`);
  return report.passed ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    process.stderr.write(`AI 黄金评测运行失败：${error.message}\n`);
    process.exitCode = 1;
  }
}
