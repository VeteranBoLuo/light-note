import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  GOLDEN_DATASET_LIMITS,
  GOLDEN_ENUMS,
  scoreGoldenResult,
  validateGoldenDataset,
  validateGoldenResult,
} from './schema.js';

const datasetPath = fileURLToPath(new URL('./golden-tasks.json', import.meta.url));
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));

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

describe('AI 助手产品能力黄金集 schema', () => {
  it('严格校验 267 条合成任务并满足能力、来源与风险覆盖', () => {
    expect(validateGoldenDataset(dataset, GOLDEN_DATASET_LIMITS)).toEqual([]);
    expect(dataset.privacy).toMatchObject({ syntheticOnly: true, containsRealUserContent: false });
    expect(dataset.tasks).toHaveLength(267);
    expect(dataset.tasks.filter((task) => task.tags.includes('legacy-core'))).toHaveLength(70);
    expect(dataset.tasks.filter((task) => task.tags.includes('matrix-v2'))).toHaveLength(197);

    const modes = new Set(dataset.tasks.map((task) => task.mode));
    expect(modes).toEqual(new Set(['ask', 'organize']));
    const sourceTypes = new Set(dataset.sources.map((source) => source.type));
    expect(sourceTypes).toEqual(
      new Set(['note', 'bookmark', 'file', 'document', 'ocr', 'todo', 'tag', 'folder', 'knowledge', 'web']),
    );
    const capabilityCounts = dataset.tasks.reduce((counts, task) => {
      counts.set(task.capability, (counts.get(task.capability) || 0) + 1);
      return counts;
    }, new Map());
    expect(new Set(capabilityCounts.keys())).toEqual(new Set(GOLDEN_ENUMS.capabilities));
    for (const [capability, count] of capabilityCounts) {
      expect(count, `${capability} 覆盖不足`).toBeGreaterThanOrEqual(20);
    }
    const tags = new Set(dataset.tasks.flatMap((task) => task.tags));
    for (const requiredTag of [
      'long-doc',
      'late-section',
      'ocr',
      'todo',
      'conflict',
      'subject-isolation',
      'prompt-injection',
      'fake-citation',
      'idempotency',
      'mobile',
    ]) {
      expect(tags.has(requiredTag), `缺少覆盖标签 ${requiredTag}`).toBe(true);
    }
  });

  it('工具枚举覆盖当前全部 Agent 工具文件', () => {
    const toolsDirectory = fileURLToPath(new URL('../../util/agent/tools/', import.meta.url));
    const registeredToolFiles = readdirSync(toolsDirectory)
      .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js') && name !== 'index.js')
      .map((name) => name.slice(0, -3));
    expect(registeredToolFiles.filter((name) => !GOLDEN_ENUMS.tools.includes(name))).toEqual([]);
  });

  it('拒绝未知字段、重复任务 ID、重复消息与不足 260 条的集合', () => {
    const unknownField = structuredClone(dataset);
    unknownField.tasks[0].unexpected = true;
    expect(validateGoldenDataset(unknownField)).toContain('tasks[0].unexpected: 存在未声明字段');

    const duplicate = structuredClone(dataset);
    duplicate.tasks[1].id = duplicate.tasks[0].id;
    expect(validateGoldenDataset(duplicate).some((error) => error.includes('任务 ID 重复'))).toBe(true);

    const tooSmall = { ...structuredClone(dataset), tasks: dataset.tasks.slice(0, GOLDEN_DATASET_LIMITS.minTasks - 1) };
    expect(
      validateGoldenDataset(tooSmall).some((error) =>
        error.includes(`至少需要 ${GOLDEN_DATASET_LIMITS.minTasks} 条任务`),
      ),
    ).toBe(true);

    const duplicateMessage = structuredClone(dataset);
    duplicateMessage.tasks[1].input.message = duplicateMessage.tasks[0].input.message;
    expect(validateGoldenDataset(duplicateMessage)).toContain('tasks[1].input.message: 任务 message 重复');

    const duplicateContract = structuredClone(dataset);
    const originalMetadata = duplicateContract.tasks[81];
    duplicateContract.tasks[81] = {
      ...structuredClone(duplicateContract.tasks[80]),
      id: originalMetadata.id,
      title: originalMetadata.title,
      input: {
        ...structuredClone(duplicateContract.tasks[80].input),
        message: originalMetadata.input.message,
      },
      materials: {
        ...structuredClone(duplicateContract.tasks[80].materials),
        keyFacts: originalMetadata.materials.keyFacts,
      },
      tags: originalMetadata.tags,
    };
    expect(validateGoldenDataset(duplicateContract).some((error) => error.includes('可执行评分契约重复'))).toBe(true);

    const wrongCollections = { ...structuredClone(dataset), sources: {}, tasks: {} };
    expect(() => validateGoldenDataset(wrongCollections)).not.toThrow();
    expect(validateGoldenDataset(wrongCollections)).toEqual(
      expect.arrayContaining(['dataset.sources: 必须是数组', 'dataset.tasks: 必须是数组']),
    );

    const wrongRefs = structuredClone(dataset);
    wrongRefs.tasks[0].input.contextRefs = {};
    expect(() => validateGoldenDataset(wrongRefs)).not.toThrow();
    expect(validateGoldenDataset(wrongRefs)).toContain('tasks[0].input.contextRefs: 必须是数组');
  });

  it('拒绝越权材料、工具白名单缺口和伪完整覆盖', () => {
    const wrongOwner = structuredClone(dataset);
    wrongOwner.tasks[0].materials.allowedSourceIds = ['src-note-denied'];
    expect(validateGoldenDataset(wrongOwner).some((error) => error.includes('不属于当前 subject'))).toBe(true);

    const missingAllowedTool = structuredClone(dataset);
    missingAllowedTool.tasks[5].expected.requiredTools = ['get_security_summary'];
    expect(validateGoldenDataset(missingAllowedTool).some((error) => error.includes('不在 allowedTools 中'))).toBe(
      true,
    );

    const falseCoverage = structuredClone(dataset);
    const partialTask = falseCoverage.tasks.find((task) => task.id === 'ask-file-004');
    partialTask.expected.coverage = 'complete';
    expect(validateGoldenDataset(falseCoverage).some((error) => error.includes('不得声明完整覆盖'))).toBe(true);

    const realLookingFixture = structuredClone(dataset);
    realLookingFixture.sources[0].title = '项目路线图';
    realLookingFixture.sources.find((source) => source.locator?.type === 'url').locator.value = 'https://example.com';
    expect(validateGoldenDataset(realLookingFixture)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('标题必须显式标记为合成内容'),
        expect.stringContaining('合成网址必须使用保留的 .test 域名'),
      ]),
    );
  });

  it('把管理员 context ID 与领域状态信号纳入严格契约', () => {
    const missingAdminContext = structuredClone(dataset);
    const adminTask = missingAdminContext.tasks.find((task) => task.identity.adminMode !== 'normal');
    adminTask.identity.adminContextRef = null;
    expect(validateGoldenDataset(missingAdminContext).some((error) => error.includes('代管上下文必须携带'))).toBe(true);

    const forgedNormalContext = structuredClone(dataset);
    forgedNormalContext.tasks[0].identity.adminContextRef = 'synthetic-context-forged-normal';
    expect(validateGoldenDataset(forgedNormalContext).some((error) => error.includes('普通上下文不得携带'))).toBe(true);

    const missingDomainSignal = structuredClone(dataset);
    const quotaTask = missingDomainSignal.tasks.find((task) => task.capability === 'quota');
    quotaTask.expected.requiredSignals = ['owner_domain_validated'];
    expect(
      validateGoldenDataset(missingDomainSignal).some((error) => error.includes('能力 quota 缺少领域状态信号')),
    ).toBe(true);
  });

  it('严格校验回归结果并对完全符合期望的结果给满分', () => {
    for (const task of dataset.tasks) {
      const result = expectedResult(task);
      expect(validateGoldenResult(result), task.id).toEqual([]);
      expect(scoreGoldenResult(task, result), task.id).toMatchObject({ score: 10, maxScore: 10, passed: true });
    }
    const malformed = expectedResult(dataset.tasks[0]);
    malformed.citations = {};
    expect(() => validateGoldenResult(malformed)).not.toThrow();
    expect(validateGoldenResult(malformed)).toContain('result.citations: 必须是数组');

    const duplicateCitation = expectedResult(dataset.tasks.find((task) => task.id === 'ask-note-004'));
    duplicateCitation.citations[1].citationKey = duplicateCitation.citations[0].citationKey;
    expect(validateGoldenResult(duplicateCitation)).toContain('result.citations[1].citationKey: citationKey 不得重复');
  });

  it('把跨主体、非允许来源和假证据作为关键失败', () => {
    const task = dataset.tasks.find((item) => item.id === 'ask-file-004');
    const result = expectedResult(task);
    result.owner.subjectRef = 'synthetic-user-b';
    result.sourcesUsed.push('src-note-denied');
    result.citations[0].supportsClaim = false;
    result.actions.push('cross_subject_read');
    result.coverage.complete = true;

    const scored = scoreGoldenResult(task, result);
    expect(scored.passed).toBe(false);
    expect(scored.criticalFailure).toBe(true);
    expect(scored.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('owner.subjectRef 期望'),
        expect.stringContaining('使用了非允许来源'),
        expect.stringContaining('不支持主张'),
        expect.stringContaining('触发禁止动作'),
        expect.stringContaining('错误标记为完整覆盖'),
      ]),
    );
  });

  it('缺失事务或失败关闭信号时触发安全关键失败', () => {
    const task = dataset.tasks.find((item) => item.expected.requiredSignals.includes('quota_fail_closed'));
    const result = expectedResult(task);
    result.signals = result.signals.filter((signal) => signal !== 'quota_fail_closed');
    const scored = scoreGoldenResult(task, result);
    expect(scored).toMatchObject({ passed: false, criticalFailure: true });
    expect(scored.violations).toContain('缺少状态信号 quota_fail_closed');
  });
});
