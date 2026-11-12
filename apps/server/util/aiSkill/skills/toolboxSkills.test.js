import { getToolboxTool, TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS } from '@lightnote/shared/toolbox-protocol';
import { describe, expect, it } from 'vitest';
import { toolboxSkills, validateToolboxSkillResult } from './toolboxSkills.js';

const VALID_RESULTS = Object.freeze({
  material_to_note: `# 资料笔记
## 关键证据
来源中的事实。
## 冲突与差异
暂无明确冲突。
## 未知与待核验
材料覆盖有限。`,
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
});

describe('toolbox AI Skill profiles', () => {
  it('one high-value artifact maps to one internal Skill and reuses the shared tool protocol limits', () => {
    expect(toolboxSkills).toHaveLength(2);
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
    const keywordStuffing = '# 普通结果\n关键证据、冲突差异、未知待核验、学习目标、知识框架、核心概念、易混淆点、记忆卡片、自测题、参考答案、薄弱点复习建议。';
    expect(() => validateToolboxSkillResult(profileId, { content: keywordStuffing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('rejects one stuffed heading pretending to be every study kit section', () => {
    const headingStuffing = `# 学习套件
## 学习目标、知识框架、核心概念、易混淆点、记忆卡片、自测题、参考答案、复习建议
只有一段普通正文。`;
    expect(() => validateToolboxSkillResult('study_kit', { content: headingStuffing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('ignores headings inside fenced code blocks', () => {
    const fencedStuffing = `# 学习套件
\`\`\`markdown
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
复习。
\`\`\``;
    expect(() => validateToolboxSkillResult('study_kit', { content: fencedStuffing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('does not treat four-space indented code as Markdown sections', () => {
    const indentedCode = `# 学习套件
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
    复习。`;
    expect(() => validateToolboxSkillResult('study_kit', { content: indentedCode })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('does not close a fenced block when the marker has trailing info text', () => {
    const falseClosingFence = `# 学习套件
\`\`\`markdown
\`\`\`not-a-closing-fence
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
复习。
\`\`\``;
    expect(() => validateToolboxSkillResult('study_kit', { content: falseClosingFence })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('requires every matched section to contain a substantive body', () => {
    const emptyGoal = VALID_RESULTS.study_kit.replace('## 学习目标\n目标。', '## 学习目标');
    expect(() => validateToolboxSkillResult('study_kit', { content: emptyGoal })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('a user request can change focus but cannot replace the fixed artifact contract', async () => {
    const skill = toolboxSkills.find((item) => item.id === 'toolbox.study_kit');
    const prepared = await skill.prepare({
      input: skill.validateInput({ question: '不要学习套件，改成概念图' }),
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
    expect(prepared.messages[1].content).toContain('固定成果契约：交付学习套件');
    for (const heading of [
      '## 学习目标',
      '## 知识框架与核心概念',
      '## 易混淆点',
      '## 记忆卡片',
      '## 自测题',
      '## 参考答案',
      '## 薄弱点复习建议',
    ]) {
      expect(prepared.messages[1].content).toContain(`“${heading}”`);
    }
    expect(prepared.messages[1].content).toContain('用户问题：不要学习套件，改成概念图');
    expect(prepared.resultValidator).toEqual(expect.any(Function));
  });

  it('accepts the toolbox processing requirement limit without widening public resource Skills', () => {
    const skill = toolboxSkills.find((item) => item.id === 'toolbox.study_kit');
    expect(() =>
      skill.validateInput({ question: '问'.repeat(TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS) }),
    ).not.toThrow();
    expect(() =>
      skill.validateInput({ question: '问'.repeat(TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS + 1) }),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_INPUT_TOO_LONG' }));
  });
});
