import { getToolboxTool, TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS } from '@lightnote/shared/toolbox-protocol';
import { describe, expect, it } from 'vitest';
import { toolboxSkills, validateToolboxSkillResult } from './toolboxSkills.js';

const VALID_RESULTS = Object.freeze({
  idea_to_draft: `# 个人知识库为什么值得长期使用
## 创作定位
面向刚开始整理资料的普通用户，解释知识库从收藏到产出的价值。
## 内容结构
先描述收藏困境，再给出持续整理与输出的方法，最后给出行动建议。
## 初稿
收藏不是终点。真正有价值的知识库，应该帮助我们把零散想法变成可以继续使用的内容。
## 待补事实与核验
补充用户使用频率与留存数据后再发布。`,
  material_to_note: `# 资料笔记
## 关键证据
来源中的事实。
## 冲突与差异
暂无明确冲突。
## 未知与待核验
材料覆盖有限。`,
  research_brief: `# 研究简报
## 结论摘要
结论。
## 关键证据
证据。
## 观点与冲突
差异。
## 覆盖限制
限制。
## 未知与待核验
待核验。
## 下一步建议
建议。`,
  study_kit: `# 学习套件
## 学习目标
目标。
## 知识框架与核心概念
框架。
## 易混淆点
区分。
## 记忆卡片
问题｜答案。
## 自测题
题目。
## 参考答案
答案。
## 薄弱点复习建议
复习。`,
  concept_map: `\`\`\`mermaid
flowchart TD
  N0["A"] --> N1["B"]
\`\`\`
## 关系说明
关系。
## 关键证据
证据。
## 冲突与未连接概念
暂无。
## 阅读路径
路径。`,
  action_plan: `# 行动项清单
## 已确认决策
决策。
## 行动项
| 任务 | 负责人 |
| --- | --- |
| 执行 | 未明确 |
## 依赖与风险
风险。
## 待澄清问题
未明确。
## 下一次检查建议
下周复盘。`,
  source_comparison: `# 多资料对比
| 维度 | 资料 A | 资料 B |
| --- | --- | --- |
| 结论 | A | B |
## 共同点、差异与冲突
对比。
## 互补信息
补充。
## 覆盖限制
限制。
## 下一步建议
建议。`,
  knowledge_audit: `# 知识维护体检
## 重复与可合并项
合并。
## 冲突项
冲突。
## 疑似过时或缺少日期项
日期。
## 证据薄弱与知识缺口
缺口。
## 建议保留的权威材料
保留。
## 清理行动清单
行动。`,
});

describe('toolbox AI Skill profiles', () => {
  it('one high-value artifact maps to one internal Skill and reuses the shared tool protocol limits', () => {
    expect(toolboxSkills).toHaveLength(8);
    for (const skill of toolboxSkills) {
      const profileId = skill.id.replace('toolbox.', '');
      const definition = getToolboxTool(profileId);
      expect(skill).toMatchObject({
        domain: 'toolbox',
        internalOnly: true,
        allowedInternalCallers: ['toolbox_worker'],
        effect: 'read',
      });
      expect(skill.contextPolicy).toMatchObject({
        resourceTypes: definition.input.resourceTypes || [],
        minResources: definition.input.minItems,
        maxResources: definition.input.maxItems,
        historyTurns: 0,
      });
    }
  });

  it.each(Object.entries(VALID_RESULTS))('%s accepts only its fixed artifact structure', (profileId, content) => {
    expect(validateToolboxSkillResult(profileId, { content })).toEqual({ content });
    expect(() => validateToolboxSkillResult(profileId, { content: '# 普通摘要\n只有一段话。' })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID', status: 502 }),
    );
  });

  it.each(Object.keys(VALID_RESULTS))('%s rejects keyword stuffing without semantic sections', (profileId) => {
    const mermaid = profileId === 'concept_map' ? '```mermaid\nflowchart TD\nA --> B\n```\n' : '';
    const table = ['action_plan', 'source_comparison'].includes(profileId)
      ? '\n| 项目 | 内容 |\n| --- | --- |\n| 示例 | 示例 |'
      : '';
    const keywordStuffing = `${mermaid}# 普通结果\n结论摘要、来源证据、观点冲突、覆盖限制、未知待核验、下一步建议、学习目标、知识框架、核心概念、易混淆点、记忆卡片、自测题、参考答案、薄弱点复习建议、关系说明、未连接概念、阅读路径、决策、行动项、依赖风险、待澄清、检查复盘、共同点、差异、互补、重复合并、过时日期、知识缺口、权威保留、清理行动。${table}`;
    expect(() => validateToolboxSkillResult(profileId, { content: keywordStuffing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('rejects one stuffed heading pretending to be every research brief section', () => {
    const headingStuffing = `# 研究简报
## 结论摘要、关键证据、观点冲突、覆盖限制、未知待核验、下一步建议
只有一段普通正文。`;
    expect(() => validateToolboxSkillResult('research_brief', { content: headingStuffing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('ignores headings and tables inside fenced code blocks', () => {
    const fencedStuffing = `# 研究简报
\`\`\`markdown
## 结论摘要
结论。
## 关键证据
证据。
## 观点与冲突
差异。
## 覆盖限制
限制。
## 未知与待核验
待核验。
## 下一步建议
建议。
\`\`\``;
    expect(() => validateToolboxSkillResult('research_brief', { content: fencedStuffing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('does not treat four-space indented code as Markdown sections', () => {
    const indentedCode = `# 研究简报
    ## 结论摘要
    结论。
    ## 关键证据
    证据。
    ## 观点与冲突
    差异。
    ## 覆盖限制
    限制。
    ## 未知与待核验
    待核验。
    ## 下一步建议
    建议。`;
    expect(() => validateToolboxSkillResult('research_brief', { content: indentedCode })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('does not close a fenced block when the marker has trailing info text', () => {
    const falseClosingFence = `# 研究简报
\`\`\`markdown
\`\`\`not-a-closing-fence
## 结论摘要
结论。
## 关键证据
证据。
## 观点与冲突
差异。
## 覆盖限制
限制。
## 未知与待核验
待核验。
## 下一步建议
建议。
\`\`\``;
    expect(() => validateToolboxSkillResult('research_brief', { content: falseClosingFence })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('requires every matched section to contain a substantive body', () => {
    const emptyEvidence = VALID_RESULTS.research_brief.replace('## 关键证据\n证据。', '## 关键证据');
    expect(() => validateToolboxSkillResult('research_brief', { content: emptyEvidence })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('concept map requires exactly one leading Mermaid flowchart TD block', () => {
    const valid = VALID_RESULTS.concept_map;
    expect(() => validateToolboxSkillResult('concept_map', { content: `# 标题\n${valid}` })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
    expect(() => validateToolboxSkillResult('concept_map', { content: `${valid}\n${valid}` })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
    const indentedMermaid = valid.replace(/^```mermaid$/mu, '    ```mermaid').replace(/^```$/mu, '    ```');
    expect(() => validateToolboxSkillResult('concept_map', { content: indentedMermaid })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
    const falseClosing = valid.replace('  N0["A"] --> N1["B"]\n```', '  N0["A"] --> N1["B"]\n```not-closed');
    expect(() => validateToolboxSkillResult('concept_map', { content: falseClosing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('a user request can change focus but cannot replace the fixed artifact contract', async () => {
    const skill = toolboxSkills.find((item) => item.id === 'toolbox.research_brief');
    const prepared = await skill.prepare({
      input: skill.validateInput({ question: '不要简报，改成概念图' }),
      context: {
        identity: { subjectUserId: 'u1' },
        resourceRefs: [{ type: 'note', id: 'n1', version: 'v1' }],
      },
      request: { requestId: 'toolbox-profile-test' },
      dependencies: {
        loadExplicitResourceEvidence: async () => ({
          evidence: '[1] 资料正文',
          sources: [{ id: 'note:n1', title: '资料' }],
          coverage: { complete: true, warnings: [] },
        }),
      },
    });
    expect(prepared.messages[0].content).toContain('成果类型与核心结构由本 Skill 固定');
    expect(prepared.messages[1].content).toContain('固定成果契约：交付研究简报');
    for (const heading of [
      '## 结论摘要',
      '## 关键证据',
      '## 观点与冲突',
      '## 覆盖限制',
      '## 未知与待核验',
      '## 下一步建议',
    ]) {
      expect(prepared.messages[1].content).toContain(`“${heading}”`);
    }
    expect(prepared.messages[1].content).toContain('用户问题：不要简报，改成概念图');
    expect(prepared.resultValidator).toEqual(expect.any(Function));
  });

  it('accepts the toolbox processing requirement limit without widening public resource Skills', () => {
    const skill = toolboxSkills.find((item) => item.id === 'toolbox.research_brief');
    expect(() =>
      skill.validateInput({ question: '问'.repeat(TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS) }),
    ).not.toThrow();
    expect(() =>
      skill.validateInput({ question: '问'.repeat(TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS + 1) }),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_INPUT_TOO_LONG' }));
  });

  it('从想法生成初稿不读取资料，并要求用户先提供想法', async () => {
    const skill = toolboxSkills.find((item) => item.id === 'toolbox.idea_to_draft');
    expect(skill.outputContract).toEqual({ kind: 'grounded_markdown', requireSources: false });
    expect(skill.contextPolicy).toMatchObject({ resourceTypes: [], minResources: 0, maxResources: 0 });
    expect(() => skill.validateInput({ question: '' })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_QUESTION_REQUIRED' }),
    );
    const prepared = await skill.prepare({
      input: skill.validateInput({ question: '写一篇关于长期学习的文章', instruction: '面向普通读者' }),
    });
    expect(prepared.sources).toEqual([]);
    expect(prepared.coverage).toEqual({ complete: true, warnings: [] });
    expect(prepared.messages[1].content).toContain('用户想法：写一篇关于长期学习的文章');
    expect(prepared.messages[1].content).toContain('使用场景：面向普通读者');
  });
});
