import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('帮助中心布局契约', () => {
  const helpSource = readSource('src/components/personCenter/help/Help.vue');
  const panelSource = readSource('src/components/aiSkills/AiSkillPanel.vue');

  it('正文与桌面大纲属于同一个阅读工作区', () => {
    const workspaceStart = helpSource.indexOf('<div class="help-content-workspace">');
    const workspaceEnd = helpSource.indexOf('<AiSkillPanel', workspaceStart);
    const workspace = helpSource.slice(workspaceStart, workspaceEnd);

    expect(workspaceStart).toBeGreaterThan(-1);
    expect(workspace).toContain('id="view-body"');
    expect(workspace).toContain('class="help-outline"');
    expect(workspace).toContain('<HelpOutlineList');
  });

  it('移动端大纲使用正常文档流，不再通过固定定位遮挡问答区', () => {
    expect(helpSource).toContain('class="help-mobile-actions"');
    expect(helpSource).toContain('class="help-mobile-action"');
    expect(helpSource).toContain(':src="icon.catalogue"');
    expect(helpSource).toContain(':src="icon.navigation.list"');
    expect(helpSource).toContain('class="help-compact-outline"');
    expect(helpSource).not.toContain('class="help-compact-outline-trigger"');
    expect(helpSource).not.toMatch(/\.help-compact-outline\s*\{[^}]*position:\s*fixed/s);
  });

  it('问答区复用通用侧栏形态并支持可配置输入高度', () => {
    expect(helpSource).toContain('presentation="sidebar"');
    expect(helpSource).toContain(':prompt-rows="3"');
    expect(helpSource).not.toContain(':empty-text="t(\'help.aiEmpty\')"');
    expect(panelSource).toContain("presentation?: 'default' | 'sidebar'");
    expect(panelSource).toContain(':rows="promptRows"');
    expect(panelSource).toContain('.ai-skill-panel.is-sidebar');
  });
});
