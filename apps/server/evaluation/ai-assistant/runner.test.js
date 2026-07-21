import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_DATASET_PATH,
  evaluateGoldenResults,
  readGoldenDataset,
  readResultRecords,
  summarizeGoldenDataset,
} from './runner.js';

const dataset = readGoldenDataset(DEFAULT_DATASET_PATH);

function expectedResult(task) {
  const citations = task.expected.citations.requiredSourceIds.map((sourceId, index) => ({
    citationKey: `E${index + 1}`,
    sourceId,
    evidenceRef: `ev-${task.id}-${index + 1}`,
    locatorResolved: true,
    supportsClaim: true,
  }));
  return {
    schemaVersion: 2,
    id: task.id,
    owner: {
      actorRef: task.identity.actorRef,
      subjectRef: task.identity.subjectRef,
      adminMode: task.identity.adminMode,
      adminContextRef: task.identity.adminContextRef,
    },
    route: task.expected.route,
    intent: task.expected.intent,
    tools: [...task.expected.requiredTools],
    sourcesUsed: [...new Set(citations.map((citation) => citation.sourceId))],
    citations,
    actions: [],
    disclosures: [...task.expected.requiredDisclosures],
    coverage: {
      disclosed: ['disclose_incomplete', 'refuse_overclaim'].includes(task.expected.coverage),
      complete: task.expected.coverage === 'complete',
      failedRangesDisclosed: task.expected.requiredDisclosures.includes('failed_ranges'),
      truncationDisclosed: task.expected.requiredDisclosures.includes('truncation'),
    },
    confirmation: task.expected.confirmation,
    outcome: task.expected.outcome,
    signals: [...task.expected.requiredSignals],
  };
}

describe('AI 助手离线回归 runner', () => {
  it('输出稳定的数据集覆盖摘要', () => {
    expect(summarizeGoldenDataset(dataset)).toMatchObject({
      datasetId: 'light-note-ai-golden-product-matrix-v2',
      tasks: 267,
      sources: 49,
      modes: { ask: 245, organize: 22 },
      capabilities: {
        ask: 55,
        evidence_citation: 24,
        gateway_policy: 24,
        memory: 25,
        organize_changeset: 20,
        owner_isolation: 21,
        privacy_retention: 23,
        quota: 25,
        recovery: 25,
        result_reuse: 25,
      },
    });
  });

  it('完整结果全部满足契约时通过回归门槛', () => {
    const report = evaluateGoldenResults(dataset, dataset.tasks.map(expectedResult));
    expect(report).toMatchObject({
      passed: true,
      errors: [],
      evaluated: 267,
      total: 267,
      averageScore: 1,
      criticalFailures: 0,
    });
  });

  it('默认拒绝缺失结果，显式 allowPartial 才允许抽样', () => {
    const sample = [expectedResult(dataset.tasks[0])];
    expect(evaluateGoldenResults(dataset, sample).errors[0]).toContain('缺少任务结果');
    expect(evaluateGoldenResults(dataset, sample, { allowPartial: true })).toMatchObject({
      passed: true,
      evaluated: 1,
      total: 267,
    });
  });

  it('安全关键失败不能被较低平均分门槛放过', () => {
    const results = dataset.tasks.map(expectedResult);
    results[0].actions.push('cross_subject_read');
    const report = evaluateGoldenResults(dataset, results, { minScore: 0.5 });
    expect(report.passed).toBe(false);
    expect(report.criticalFailures).toBe(1);
  });

  it('读取 JSONL 时忽略空行和注释并报告坏行号', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'light-note-ai-eval-'));
    const filePath = path.join(directory, 'results.jsonl');
    try {
      const record = expectedResult(dataset.tasks[0]);
      writeFileSync(filePath, `# adapter metadata\n\n${JSON.stringify(record)}\n`, 'utf8');
      expect(readResultRecords(filePath)).toEqual([record]);
      writeFileSync(filePath, '{broken}\n', 'utf8');
      expect(() => readResultRecords(filePath)).toThrow('第 1 行不是有效 JSON');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
