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
});

describe('toolbox AI Skill profiles', () => {
  it('one high-value artifact maps to one internal Skill and reuses the shared tool protocol limits', () => {
    expect(toolboxSkills).toHaveLength(1);
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
    const keywordStuffing = '# 普通结果\n关键证据、冲突差异、未知待核验。';
    expect(() => validateToolboxSkillResult(profileId, { content: keywordStuffing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('rejects one stuffed heading pretending to be every required section', () => {
    const headingStuffing = `# 资料笔记
## 关键证据、冲突与差异、未知与待核验
只有一段普通正文。`;
    expect(() => validateToolboxSkillResult('material_to_note', { content: headingStuffing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('ignores headings inside fenced code blocks', () => {
    const fencedStuffing = `# 资料笔记
\`\`\`markdown
## 关键证据
来源中的事实。
## 冲突与差异
暂无明确冲突。
## 未知与待核验
材料覆盖有限。
\`\`\``;
    expect(() => validateToolboxSkillResult('material_to_note', { content: fencedStuffing })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('does not treat four-space indented code as Markdown sections', () => {
    const indentedCode = `# 资料笔记
    ## 关键证据
    来源中的事实。
    ## 冲突与差异
    暂无明确冲突。
    ## 未知与待核验
    材料覆盖有限。`;
    expect(() => validateToolboxSkillResult('material_to_note', { content: indentedCode })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('does not close a fenced block when the marker has trailing info text', () => {
    const falseClosingFence = `# 资料笔记
\`\`\`markdown
\`\`\`not-a-closing-fence
## 关键证据
来源中的事实。
## 冲突与差异
暂无明确冲突。
## 未知与待核验
材料覆盖有限。
\`\`\``;
    expect(() => validateToolboxSkillResult('material_to_note', { content: falseClosingFence })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('requires every matched section to contain a substantive body', () => {
    const emptyEvidence = VALID_RESULTS.material_to_note.replace('## 关键证据\n来源中的事实。', '## 关键证据');
    expect(() => validateToolboxSkillResult('material_to_note', { content: emptyEvidence })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_PROFILE_INVALID' }),
    );
  });

  it('a user request can change focus but cannot replace the fixed artifact contract', async () => {
    const skill = toolboxSkills.find((item) => item.id === 'toolbox.material_to_note');
    const prepared = await skill.prepare({
      input: skill.validateInput({ question: '不要资料笔记，改成概念图' }),
      context: {
        identity: { subjectUserId: 'u1' },
        resourceRefs: [
          { type: 'note', id: 'n1', version: 'v1' },
          { type: 'note', id: 'n2', version: 'v1' },
        ],
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
    expect(prepared.messages[1].content).toContain('固定成果契约：交付一篇结构清晰、可继续编辑的 Markdown 笔记');
    for (const heading of ['## 关键证据', '## 冲突与差异', '## 未知与待核验']) {
      expect(prepared.messages[1].content).toContain(`“${heading}”`);
    }
    expect(prepared.messages[1].content).toContain('用户问题：不要资料笔记，改成概念图');
    expect(prepared.resultValidator).toEqual(expect.any(Function));
  });

  it('accepts the toolbox processing requirement limit without widening public resource Skills', () => {
    const skill = toolboxSkills.find((item) => item.id === 'toolbox.material_to_note');
    expect(() =>
      skill.validateInput({ question: '问'.repeat(TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS) }),
    ).not.toThrow();
    expect(() =>
      skill.validateInput({ question: '问'.repeat(TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS + 1) }),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_INPUT_TOO_LONG' }));
  });
});
