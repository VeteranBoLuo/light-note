import { describe, expect, it, vi } from 'vitest';
import tagAnalysisSkill, { tagAnalysisSkillInternals } from './tagAnalysisSkill.js';

function context(resourceCount) {
  return {
    identity: { subjectUserId: 'u-1' },
    tag: { id: 'tag-1', name: '研发', description: '项目研发资料' },
    resourceRefs: Array.from({ length: resourceCount }, (_, index) => ({
      type: index % 2 ? 'note' : 'bookmark',
      id: `r-${index + 1}`,
      version: 'v1',
    })),
  };
}

function loadedFor(refs) {
  return {
    evidence: refs.map((ref, index) => `[${index + 1}] ${ref.id}`).join('\n'),
    sources: refs.map((ref, index) => ({ id: `${ref.type}:${ref.id}`, citationKey: String(index + 1) })),
    coverage: {
      complete: true,
      warnings: [],
      structuralWarnings: [],
      qualityWarnings: [],
      resources: refs.map((ref) => ({ type: ref.type, id: ref.id, status: 'ready', warnings: [] })),
      readableResources: refs.length,
    },
  };
}

describe('tagAnalysisSkill', () => {
  it('小标签一次读取全部资源并直接生成，不存在 20 项截断', async () => {
    const scope = context(32);
    const loadExplicitResourceEvidence = vi.fn(async ({ resourceRefs }) => loadedFor(resourceRefs));
    const prepared = await tagAnalysisSkill.prepare({
      input: tagAnalysisSkill.validateInput({ instruction: '分析全部内容' }),
      context: scope,
      dependencies: { loadExplicitResourceEvidence },
    });

    expect(loadExplicitResourceEvidence).toHaveBeenCalledOnce();
    expect(loadExplicitResourceEvidence.mock.calls[0][0].resourceRefs).toHaveLength(32);
    expect(prepared.sources).toHaveLength(32);
    expect(prepared.coverage).toMatchObject({
      strategy: 'direct',
      requestedResources: 32,
      analyzedResources: 32,
      unreadableResources: 0,
      batchCount: 1,
    });
    expect(prepared.messages[1].content).toContain('标签「研发」下的完整资源范围');
  });

  it('大标签按 40 项分批，逐批引用会映射回完整来源后再汇总', async () => {
    const scope = context(81);
    const loadExplicitResourceEvidence = vi.fn(async ({ resourceRefs }) => loadedFor(resourceRefs));
    const callGroundedSkillModel = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'grounded_markdown', content: '第一批 [1] [40]' })
      .mockResolvedValueOnce({ kind: 'grounded_markdown', content: '第二批 [1]' })
      .mockResolvedValueOnce({ kind: 'grounded_markdown', content: '第三批 [1]' })
      .mockResolvedValueOnce({ kind: 'grounded_markdown', content: '最终结论 [1] [3] [4]' });
    const prepared = await tagAnalysisSkill.prepare({
      input: tagAnalysisSkill.validateInput({}),
      context: scope,
      dependencies: { loadExplicitResourceEvidence, callGroundedSkillModel },
    });

    const result = await prepared.callModel({});
    expect(loadExplicitResourceEvidence.mock.calls.map(([options]) => options.resourceRefs.length)).toEqual([
      40, 40, 1,
    ]);
    expect(callGroundedSkillModel).toHaveBeenCalledTimes(4);
    expect(callGroundedSkillModel.mock.calls[3][0].messages[1].content).toContain('第二批 [3]');
    expect(callGroundedSkillModel.mock.calls[3][0].messages[1].content).toContain('第三批 [4]');
    expect(callGroundedSkillModel.mock.calls[3][0].sources).toHaveLength(4);
    expect(prepared.sources).toHaveLength(4);
    expect(prepared.coverage).toMatchObject({ strategy: 'hierarchical', batchCount: 3, analyzedResources: 81 });
    expect(result.content).toContain('最终结论');
  });

  it('覆盖统计明确区分不可读、元数据和截断资源', () => {
    const coverage = tagAnalysisSkillInternals.mergeCoverage(
      [
        {
          sources: [{ id: 'bookmark:b-1' }, { id: 'note:n-1' }],
          coverage: {
            warnings: ['resource_content_truncated:note:n-1'],
            structuralWarnings: ['resource_content_truncated:note:n-1'],
            qualityWarnings: [],
            readableResources: 2,
            resources: [
              { status: 'metadata_only', warnings: [] },
              { status: 'ready', warnings: ['resource_content_truncated'] },
            ],
          },
        },
      ],
      3,
      'direct',
    );
    expect(coverage).toMatchObject({
      complete: false,
      analyzedResources: 2,
      unreadableResources: 1,
      metadataOnlyResources: 1,
      truncatedResources: 1,
    });
  });

  it('调用计划随服务端解析后的完整资源数增长，并保持 500 项明确上限', () => {
    expect(tagAnalysisSkill.contextPolicy.maxExpandedResources).toBe(500);
    expect(tagAnalysisSkillInternals.generationCallCount(50)).toBe(1);
    expect(tagAnalysisSkillInternals.generationCallCount(51)).toBe(3);
    expect(tagAnalysisSkillInternals.generationCallCount(500)).toBe(14);
    expect(tagAnalysisSkillInternals.evidenceLimits(500)).toEqual({
      maxCharsPerResource: 800,
      maxTotalChars: 400_000,
    });
  });
});
