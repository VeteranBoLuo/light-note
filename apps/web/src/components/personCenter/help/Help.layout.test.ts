import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import icon from '@/config/icon';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('帮助中心布局契约', () => {
  const helpSource = readSource('src/components/personCenter/help/Help.vue');
  const panelSource = readSource('src/components/aiSkills/AiSkillPanel.vue');

  it('首页发现态与文章阅读态复用同一个搜索工作区', () => {
    const workspaceStart = helpSource.indexOf('<main class="help-content-workspace">');
    const workspaceEnd = helpSource.indexOf('<aside class="help-tools"', workspaceStart);
    const workspace = helpSource.slice(workspaceStart, workspaceEnd);

    expect(workspaceStart).toBeGreaterThan(-1);
    expect(workspace).toContain('class="help-workspace-header"');
    expect(workspace).toContain('class="help-topic-grid"');
    expect(workspace).toContain('class="search-results-panel"');
    expect(workspace).toContain('id="view-body"');
    expect(workspace).not.toContain('class="help-outline"');
  });

  it('主题、左侧栏目和栏目文章列表统一来自服务端 helpSection 元数据', () => {
    expect(helpSource).toContain("from './helpCatalog'");
    expect(helpSource).toContain('groupHelpArticles(serverOptions.value');
    expect(helpSource).toContain('v-for="section in catalogGroups"');
    expect(helpSource).toContain('v-for="group in catalogGroups"');
    expect(helpSource).toContain('v-else-if="isSectionView && activeSection"');
    expect(helpSource).toContain('route.query.section');
    expect(helpSource).not.toContain('CATALOG_CLASSIFIERS');
    expect(helpSource).not.toContain('CATALOG_GROUP_ORDER');
    expect(helpSource).not.toContain('landingTopics');
    expect(helpSource).not.toContain('searchValue.value = topic.query');
  });

  it('桌面辅助区合并自然高度 AI 与内容大纲，不再形成第四栏', () => {
    const toolsStart = helpSource.indexOf('<aside class="help-tools"');
    const toolsEnd = helpSource.indexOf('</aside>', toolsStart);
    const tools = helpSource.slice(toolsStart, toolsEnd);

    expect(toolsStart).toBeGreaterThan(-1);
    expect(tools).toContain('<AiSkillPanel');
    expect(tools).toContain('class="help-tools-outline"');
    expect(tools).toContain('<HelpOutlineList');
    expect(helpSource).not.toContain('presentation="sidebar"');
    expect(helpSource).toContain("grid-template-areas: 'catalog content tools'");
  });

  it('窄桌面折叠辅助工具，移动端目录与大纲继续使用正常文档流', () => {
    expect(helpSource).toContain("'is-desktop-compact': isCompactDesktopLayout");
    expect(helpSource).toContain('class="help-tools-compact-actions"');
    expect(helpSource).toContain('class="help-compact-tool"');
    expect(helpSource).toContain('class="help-mobile-actions"');
    expect(helpSource).toContain('class="help-mobile-action"');
    expect(helpSource).toContain(':src="icon.noteDetail.catalogue"');
    expect(helpSource).toContain(':src="icon.filterPanel.list"');
    expect(helpSource).toContain('class="help-compact-outline"');
    expect(helpSource).not.toContain('class="help-compact-outline-trigger"');
    expect(helpSource).not.toMatch(/\.help-compact-outline\s*\{[^}]*position:\s*fixed/s);
  });

  it('问答区复用通用自然高度形态，并保留输入重置与隐去来源能力', () => {
    expect(helpSource).toContain(':prompt-rows="2"');
    expect(helpSource).toContain(':show-grounding="false"');
    expect(helpSource).toContain(':clear-prompt-on-success="true"');
    expect(helpSource).not.toContain(':empty-text="t(\'help.aiEmpty\')"');
    expect(panelSource).toContain("presentation?: 'default' | 'sidebar'");
    expect(panelSource).toContain(':rows="promptRows"');
    expect(panelSource).toContain('.ai-skill-panel.is-sidebar');
  });

  it('目录、搜索与加载状态统一复用 B 系列组件和图标配置', () => {
    expect(helpSource).not.toContain('import BList');
    expect(helpSource).toContain('<BInput');
    expect(helpSource).toContain('<BButton');
    expect(helpSource).toContain('<BLoading');
    expect(helpSource).toContain(':src="icon.help_document"');
    expect(helpSource).toContain('v-else-if="helpConfigError"');
    expect(helpSource).toContain('v-else-if="!serverOptions.length"');
    expect(helpSource).not.toContain('<input');
    expect(helpSource).not.toContain('<button');

    const configuredIcons = [
      icon.arrow_left,
      icon.noteDetail.catalogue,
      icon.filterPanel.list,
      icon.common.magicWand,
      icon.common.question,
      icon.help_document,
      icon.navigation.search,
    ];
    expect(configuredIcons.every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
    expect(configuredIcons).not.toContain(icon.nullImg);
  });
});
