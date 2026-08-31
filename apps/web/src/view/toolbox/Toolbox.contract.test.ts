import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLBOX_TOOL_CATALOG } from '@lightnote/shared/toolbox-protocol';
import {
  canonicalToolboxToolId,
  TOOLBOX_HOME_GROUPS,
  TOOLBOX_STARTER_TOOL_IDS,
  TOOLBOX_WORKFLOW_PRESENTATION,
  toolboxToolPath,
} from '@/config/toolbox';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function localeKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => localeKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe('知识工具箱前端边界', () => {
  it('浏览器本地工具不引用 HTTP、上传或工具箱任务 API', () => {
    for (const path of [
      'src/view/toolbox/components/PdfOrganizer.vue',
      'src/view/toolbox/components/PdfWorkbench.vue',
      'src/view/toolbox/components/PdfImageConverter.vue',
      'src/view/toolbox/components/ImageOptimizer.vue',
      'src/view/toolbox/components/ImageToPdf.vue',
      'src/view/toolbox/components/PdfToImages.vue',
      'src/view/toolbox/components/MarkdownConverter.vue',
      'src/view/toolbox/components/TextDiff.vue',
      'src/view/toolbox/components/TableConverter.vue',
      'src/view/toolbox/components/MermaidEditor.vue',
      'src/view/toolbox/components/BrowserSqlWorkbench.vue',
      'src/view/toolbox/components/CodeSnapshotWorkbench.vue',
      'src/view/toolbox/components/DatasetWorkbench.vue',
      'src/view/toolbox/components/DocumentTextWorkbench.vue',
      'src/view/toolbox/components/KnowledgeTextWorkbench.vue',
      'src/utils/pdfOrganizer.ts',
      'src/utils/imageOptimizer.ts',
      'src/utils/imageToPdf.ts',
      'src/utils/pdfToImages.ts',
      'src/utils/toolboxBrowserSql.ts',
      'src/utils/toolboxDataset.ts',
      'src/utils/toolboxDocumentText.ts',
      'src/utils/toolboxKnowledgeText.ts',
      'src/utils/toolboxLocal.ts',
      'src/utils/toolboxTextTools.ts',
    ]) {
      const content = source(path);
      expect(content).not.toMatch(/apiBase|fetch\(|uploadToolbox|createToolboxJob|createToolboxQuote/u);
    }
  });

  it('本地与知识库免费工作台统一通过注册表扩展，全部免费工具均已接入', () => {
    const registry = source('src/view/toolbox/localToolRegistry.ts');
    for (const toolId of [
      'pdf_organizer',
      'image_optimizer',
      'image_to_pdf',
      'pdf_to_images',
      'markdown_converter',
      'text_diff',
      'table_converter',
      'mermaid_editor',
      'data_workbench',
      'data_quality_report',
      'data_cleaner',
      'data_validator',
      'pivot_analysis',
      'table_diff',
      'table_merge_split',
      'data_anonymizer',
      'data_chart',
      'text_batch',
      'regex_extractor',
      'pdf_text_extractor',
      'markdown_checker',
      'frontmatter_batch',
      'citation_converter',
      'browser_sql',
      'structured_data_lab',
      'docx_to_markdown',
      'code_snapshot',
    ]) {
      expect(registry).toContain(`${toolId}:`);
    }
    const serviceRegistry = source('src/view/toolbox/serviceToolRegistry.ts');
    expect(serviceRegistry).toContain('research_workspace:');
    expect(serviceRegistry).toContain('learning_workspace:');
    expect(serviceRegistry).toContain('writing_workspace:');
    expect(serviceRegistry).toContain('knowledge_structure_audit:');
    expect(serviceRegistry).toContain('directory_index:');
    const workbench = source('src/view/toolbox/ToolboxWorkbench.vue');
    expect(workbench).toContain('localToolComponent');
    expect(workbench).toContain('getToolboxLocalComponent');
    expect(workbench).toContain('serviceToolComponent');
    expect(workbench).toContain('getToolboxServiceComponent');
    expect(workbench).toContain('recordToolboxRecentUse');
    expect(workbench).not.toContain("toolId === 'pdf_organizer'");
  });

  it('所有工具箱页面复用同一滚动基线，图片压缩明确呈现前后双预览', () => {
    const scrollMixin = source('src/view/toolbox/toolboxPageScroll.less');
    expect(scrollMixin).toContain('min-height: 0');
    expect(scrollMixin).toContain('overflow-y: auto');
    expect(scrollMixin).toContain('touch-action: pan-y');

    for (const path of [
      'src/view/toolbox/ToolboxHome.vue',
      'src/view/toolbox/ToolboxWorkbench.vue',
      'src/view/toolbox/ToolboxTask.vue',
    ]) {
      const content = source(path);
      expect(content).toContain("@import './toolboxPageScroll.less'");
      expect(content).toContain('.toolbox-page-scroll()');
    }

    const imageOptimizer = source('src/view/toolbox/components/ImageOptimizer.vue');
    expect(imageOptimizer).toContain("t('toolbox.local.before')");
    expect(imageOptimizer).toContain("t('toolbox.local.after')");
    expect(imageOptimizer).toContain(':src="entry.previewUrl"');
    expect(imageOptimizer).toContain(':src="entry.result.previewUrl"');
    expect(imageOptimizer).toContain('maxDimension: null');
    expect(imageOptimizer).not.toContain("t('toolbox.local.maxDimension')");
    expect(imageOptimizer).not.toContain("BInput from '@/components/base/BasicComponents/BInput.vue'");
  });

  it('滚动快照只在进入下一级页面前保存，不在卸载钩子中污染新历史条目', () => {
    for (const [path, rememberCall] of [
      ['src/view/toolbox/ToolboxHome.vue', 'rememberHomeScroll()'],
      ['src/view/toolbox/ToolboxWorkbench.vue', 'rememberWorkbenchScroll()'],
      ['src/view/toolbox/ToolboxTask.vue', 'rememberTaskScroll()'],
    ] as const) {
      const content = source(path);
      const unmountHook = content.match(/onBeforeUnmount\(\(\) => \{(?<body>[\s\S]*?)\n  \}\);/u)?.groups?.body || '';
      expect(content).toContain('saveToolboxScrollSnapshot');
      expect(content).toContain('restoreToolboxScrollSnapshot');
      expect(content).toContain(rememberCall);
      expect(unmountHook).not.toContain(rememberCall);
    }

    const home = source('src/view/toolbox/ToolboxHome.vue');
    const workbench = source('src/view/toolbox/ToolboxWorkbench.vue');
    const task = source('src/view/toolbox/ToolboxTask.vue');
    expect(home.indexOf('rememberHomeScroll();')).toBeLessThan(
      home.indexOf('void router.push(toolboxToolPath(tool.id))'),
    );
    expect(workbench.indexOf('rememberWorkbenchScroll();')).toBeLessThan(
      workbench.indexOf('await router.push(`/toolbox/task/${job.id}`)'),
    );
    expect(task.indexOf('rememberTaskScroll();')).toBeLessThan(
      task.indexOf('await router.push(`/noteLibrary/${encodeURIComponent(savedNoteId.value)}`)'),
    );
  });

  it('首页先从零开始，再续接已有工作，并完整展示常用/最近与全部分类目录', () => {
    const home = source('src/view/toolbox/ToolboxHome.vue');
    const homeTemplate = home.slice(0, home.indexOf('<script setup'));
    const activeToolIds = TOOLBOX_TOOL_CATALOG.filter((tool) => tool.availability.enabled)
      .map((tool) => tool.id)
      .sort();
    const groupedToolIds = TOOLBOX_HOME_GROUPS.flatMap((group) => [...group.toolIds]).sort();

    expect(groupedToolIds).toEqual(activeToolIds);
    expect(new Set(groupedToolIds).size).toBe(groupedToolIds.length);
    expect(activeToolIds).toHaveLength(20);
    expect(TOOLBOX_HOME_GROUPS.find((group) => group.id === 'prepare')?.toolIds).toEqual([
      'docx_to_markdown',
      'ocr_to_text',
      'pdf_organizer',
      'image_optimizer',
    ]);
    expect(TOOLBOX_HOME_GROUPS.find((group) => group.id === 'data')?.toolIds).toEqual([
      'data_workbench',
      'table_converter',
      'text_batch',
      'text_diff',
    ]);
    expect(home).toContain('class="toolbox-overview"');
    expect(homeTemplate).toContain('class="toolbox-asset__icon"');
    expect(home).toContain('color: #a34f00;');
    expect(home).toContain(":global([data-theme='night'] .toolbox-asset__icon)");
    expect(home).not.toContain('.toolbox-asset > :first-child');
    expect(homeTemplate).toContain('class="toolbox-section toolbox-start"');
    expect(homeTemplate).toContain('class="toolbox-section toolbox-quick"');
    expect(homeTemplate).toContain('class="toolbox-section toolbox-continue"');
    expect(homeTemplate).not.toContain('class="toolbox-section toolbox-recent"');
    expect(homeTemplate).toContain('class="toolbox-section toolbox-catalog"');
    expect(homeTemplate.indexOf('toolbox-start')).toBeLessThan(homeTemplate.indexOf('toolbox-continue'));
    expect(homeTemplate.indexOf('toolbox-continue')).toBeLessThan(homeTemplate.indexOf('toolbox-quick'));
    expect(homeTemplate.indexOf('toolbox-quick')).toBeLessThan(homeTemplate.indexOf('toolbox-catalog'));
    expect(homeTemplate).toContain('class="toolbox-quick__switch"');
    expect(homeTemplate).toContain("quickView === 'recent'");
    expect(homeTemplate).toContain("hasContinue ? '03' : '02'");
    expect(homeTemplate).toContain("hasContinue ? '04' : '03'");
    expect(homeTemplate).toContain('class="toolbox-group-filter"');
    expect(home).toContain('class="toolbox-catalog__search"');
    expect(home).not.toContain('class="toolbox-overview__search"');
    expect(homeTemplate).toContain('class="toolbox-home-groups"');
    expect(homeTemplate).toContain('class="toolbox-home-group"');
    expect(home).toContain('fetchToolboxHome');
    expect(home).toContain('overviewLoading');
    expect(home).toContain('overviewFailed');
    expect(home).toContain('v-if="isGuest" class="toolbox-guest-guide"');
    expect(home).toContain('readToolboxRecentUses');
    expect(home).toContain('readToolboxPinnedTools');
    expect(home).toContain('TOOLBOX_DEFAULT_QUICK_TOOL_IDS');
    expect(home).toContain('TOOLBOX_STARTER_TOOL_IDS');
    expect(home).toContain('PRIMARY_PRODUCTION_STUDIOS');
    expect(homeTemplate).toContain('class="toolbox-production-grid"');
    expect(homeTemplate).toContain('v-for="project in continueProjects"');
    expect(home).toContain('productionStudioForProjectType(project.projectType)');
    expect(home).toContain('continueProjects.value.length > 0');
    expect(home).toContain("query: { create: '1' }");
    expect(home).not.toContain('fetchToolboxJobs');
    expect(home).not.toContain('useAiQuotaStatus');
    expect(home).not.toContain('<BProgress');
    expect(home).toContain("value: 'free' as const");
    expect(home).toContain("value: 'points' as const");
    expect(home).toContain('tool.availability.enabled');
    expect(home).toContain('TOOLBOX_HOME_GROUPS');
    expect(homeTemplate).toContain('v-for="group in visibleGroups"');
    expect(home).toContain('navigateToToolGroup');
    expect(home).toContain('scrollIntoView');
    expect(home).not.toContain('.filter((group) => group.id === activeToolGroup.value)');
    expect(home).toContain('v-else-if="!visibleGroups.length"');
    expect(home).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(home).toContain('@media (max-width: 767px)');
    expect(home).toContain('html.light-note-mobile-rendering .toolbox-card__icon)');
    expect(home).toContain('.toolbox-catalog__search :deep(.b-input:focus-visible)');
    expect(home).toContain('handleSearchShortcut');
    expect(home).toContain('overflow-x: auto');
    expect(home).not.toContain('overflow-y: auto');
    expect(home).not.toMatch(/<input\b|<select\b|<a-/u);
  });

  it('合并型工作台只有一个公开入口，并兼容历史工具深链', () => {
    expect(canonicalToolboxToolId('image_to_pdf')).toBe('pdf_organizer');
    expect(canonicalToolboxToolId('pdf_to_images')).toBe('pdf_organizer');
    expect(canonicalToolboxToolId('pdf_text_extractor')).toBe('pdf_organizer');
    expect(toolboxToolPath('image_to_pdf')).toBe('/toolbox/pdf_organizer');
    for (const legacyId of ['image_to_pdf', 'pdf_to_images', 'pdf_text_extractor'] as const) {
      expect(TOOLBOX_TOOL_CATALOG.find((tool) => tool.id === legacyId)?.availability.enabled).toBe(false);
    }
    expect(TOOLBOX_TOOL_CATALOG.find((tool) => tool.id === 'pdf_organizer')).toMatchObject({
      availability: { enabled: true },
      input: {
        accept: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      },
    });
    for (const legacyId of [
      'data_quality_report',
      'data_cleaner',
      'data_validator',
      'pivot_analysis',
      'table_diff',
      'table_merge_split',
      'data_anonymizer',
      'data_chart',
    ] as const) {
      expect(canonicalToolboxToolId(legacyId)).toBe('data_workbench');
      expect(toolboxToolPath(legacyId)).toBe('/toolbox/data_workbench');
      expect(TOOLBOX_TOOL_CATALOG.find((tool) => tool.id === legacyId)?.availability.enabled).toBe(false);
    }
    expect(TOOLBOX_TOOL_CATALOG.find((tool) => tool.id === 'data_workbench')).toMatchObject({
      availability: { enabled: true },
      input: { maxItems: 2, maxBytes: 30 * 1024 * 1024 },
    });
  });

  it('移动端从零创建只连接真实能力，并与已有工作续接明确分区', () => {
    const home = source('src/view/toolbox/ToolboxHome.vue');
    const homeTemplate = home.slice(0, home.indexOf('<script setup'));
    const serviceRegistry = source('src/view/toolbox/serviceToolRegistry.ts');

    expect(TOOLBOX_STARTER_TOOL_IDS).toEqual([
      'writing_workspace',
      'learning_workspace',
      'research_workspace',
      'idea_to_draft',
    ]);
    for (const toolId of TOOLBOX_STARTER_TOOL_IDS) {
      expect(TOOLBOX_TOOL_CATALOG.find((tool) => tool.id === toolId)?.availability.enabled).toBe(true);
    }
    for (const toolId of ['writing_workspace', 'learning_workspace', 'research_workspace']) {
      expect(serviceRegistry).toContain(`${toolId}: KnowledgeWorkspace`);
      expect(TOOLBOX_TOOL_CATALOG.find((tool) => tool.id === toolId)?.executionMode).toBe('service');
    }
    expect(TOOLBOX_WORKFLOW_PRESENTATION.idea_to_draft).toBeTruthy();
    expect(TOOLBOX_TOOL_CATALOG.find((tool) => tool.id === 'idea_to_draft')).toMatchObject({
      executionMode: 'ai_skill',
      input: { kind: 'prompt', minItems: 0 },
    });

    expect(homeTemplate).toContain('class="toolbox-section toolbox-start"');
    expect(homeTemplate.indexOf('toolbox-start')).toBeLessThan(homeTemplate.indexOf('toolbox-quick'));
    expect(homeTemplate.indexOf('toolbox-start')).toBeLessThan(homeTemplate.indexOf('toolbox-continue'));
    expect(home).toContain("query: { create: '1' }");
    expect(home).toContain('starterAccessibleLabel(tool)');
    expect(home).toContain('min-height: 108px');
    expect(home).toContain('.toolbox-category-filter :deep(.b-chip--interactive)');
    expect(home).toContain('min-height: 44px');
    expect(home).toContain('html.light-note-mobile-rendering .toolbox-start-card.b_btn');
    expect(home).not.toMatch(/\.toolbox-start(?:-grid|-card)?[^}]*overflow-y:\s*(?:auto|scroll)/u);
  });

  it('知识库整理合并结构问题与目录索引，表格体检载入后自动运行', () => {
    const maintenance = source('src/view/toolbox/components/KnowledgeMaintenanceWorkbench.vue');
    const dataset = source('src/view/toolbox/components/DatasetWorkbench.vue');
    expect(maintenance).toContain("activeView === 'audit'");
    expect(maintenance).toContain("value: 'directory' as const");
    expect(maintenance).toContain('class="maintenance-mode-switch"');
    expect(maintenance).toContain('generateKnowledgeDirectoryIndex');
    expect(maintenance).toContain("const ALL_NOTES_SCOPE = '__all_notes__'");
    expect(dataset).toContain("activeToolId.value === 'data_quality_report'");
    expect(dataset).toContain('v-if="!isQualityTool" class="dataset-control-card"');
    expect(dataset).toContain('if (isQualityTool.value) await runTool()');
    expect(dataset).toContain('class="dataset-stagebar is-quality"');
    expect(dataset).toContain('class="dataset-operation-rail"');
    expect(dataset).toContain('class="dataset-mode-select"');
    expect(dataset).toContain("path: '/toolbox/data_workbench'");
    expect(dataset).toContain('TOOLBOX_DATASET_MAX_TOTAL_BYTES');
    expect(dataset).toContain('watch(activeToolId');
    expect(dataset).toContain('resetOutcome();');
    expect(dataset).not.toContain('() => clearAll()');
    expect(dataset).not.toMatch(/overflow-y:\s*(?:auto|scroll)/u);
  });

  it('研究、学习与写作复用同一持续工作区，并坚持单一页面主滚动', () => {
    const workspace = source('src/view/toolbox/components/KnowledgeWorkspace.vue');
    const workspaceTemplate = workspace.slice(0, workspace.indexOf('<script setup'));
    const registry = source('src/view/toolbox/serviceToolRegistry.ts');
    for (const toolId of ['research_workspace', 'learning_workspace', 'writing_workspace']) {
      expect(registry).toContain(`${toolId}: KnowledgeWorkspace`);
    }
    expect(workspace).toContain("const lanes: ToolboxWorkspaceLane[] = ['inbox', 'knowledge', 'action']");
    expect(workspace).toContain('createToolboxWorkspaceSession');
    expect(workspace).toContain('toolboxWorkspaceKind(props.toolId)');
    expect(workspace).toContain('markToolboxWorkspaceOpened');
    expect(workspace).toContain('initializationVersion');
    expect(workspace).toContain('ToolboxResourceSelector');
    expect(workspace).toContain('existing-resource-keys');
    expect(workspace).toContain('workspaceQuery');
    expect(workspace).toContain("workspaceFormMode.value = 'edit'");
    expect(workspace).toContain('await updateToolboxWorkspace');
    expect(workspace).toContain("t('toolbox.workspace.backToList')");
    expect(workspace).toContain('html.light-note-mobile-rendering');
    expect(workspaceTemplate).not.toMatch(/<input\b|<select\b|<textarea\b|<a-/u);
    expect(workspace).not.toMatch(/overflow-y:\s*(?:auto|scroll)/u);
    expect(workspace).toContain('@media (max-width: 767px)');
  });

  it('PC 搜索常驻位仅保留图标，输入框位于带焦点管理的结果浮层内', () => {
    const content = source('src/components/search/GlobalSearch.vue');
    expect(content).toContain('class="global-search__trigger"');
    expect(content).toContain('class="global-search-dialog__input"');
    expect(content).toContain('inputRef.value?.focus?.()');
    expect(content).toContain('nextTick(() => triggerElement()?.focus())');
    expect(content).not.toMatch(/<button\b/u);
    expect(content).not.toMatch(/<svg\b/u);
  });

  it('工具箱只呈现本次积分执行，长文成果统一进入笔记库，不借用笔记助手追问计费', () => {
    const workbench = source('src/view/toolbox/ToolboxWorkbench.vue');
    const task = source('src/view/toolbox/ToolboxTask.vue');
    const home = source('src/view/toolbox/ToolboxHome.vue');
    expect(workbench).toContain("'toolbox.pointsRule'");
    expect(workbench).toContain("'toolbox.promptPointsRule'");
    expect(workbench).toContain("'toolbox.workbench.promptIntentDescription'");
    expect(workbench).toContain("'toolbox.workbench.promptDetailDescription'");
    expect(workbench).toContain('question: String(question.value');
    expect(task).toContain("'toolbox.task.continueResultHint'");
    expect(task).not.toContain('createToolboxArtifactProjectRequestId');
    expect(task).not.toContain("projectType: 'document'");
    expect(task).toContain("saveArtifact('save')");
    expect(task).toContain('type="primary"');
    expect(task).not.toContain('continueWithAi');
    expect(task).not.toContain('setAiPreferredOpen');
    expect(home).not.toContain('aiQuota');
    expect(task).toContain("job.artifactState === 'expired'");
    expect(task).toContain('watch(jobId');
  });

  it('资料选择支持连续多选、批量加入和父笔记整目录展开，同时仍提交普通资源引用', () => {
    const selector = source('src/view/toolbox/components/ToolboxResourceSelector.vue');
    const selectorTemplate = selector.slice(0, selector.indexOf('<script setup'));
    const workbench = source('src/view/toolbox/ToolboxWorkbench.vue');
    const picker = source('src/components/resourcePicker/ResourcePickerPanel.vue');
    const pickerSearch = source('src/composables/useResourcePickerSearch.ts');
    expect(selector).toContain('multi-select');
    expect(selector).toContain('@select-many="addMany"');
    expect(selector).toContain('@select-scope="addNoteBranch"');
    expect(selector).toContain('fetchNoteBranchItems');
    expect(selector).toContain('selectionGroup');
    expect(selectorTemplate).toContain('class="toolbox-resource-selector__selected"');
    expect(selectorTemplate).toContain(':class="{ \'is-empty\': !selectedGroups.length }"');
    expect(selector).toContain('height: 54px');
    expect(selector).toContain('overflow-x: auto');
    expect(selector).toContain('class="toolbox-resource-selector__clear"');
    expect(selector).toContain('white-space: nowrap');
    expect(selector).toContain(':limit="8"');
    expect(selector).toContain('exhaustive-single-type');
    expect(selector).toContain(':class="{ \'is-page-scroll\': pageScroll }"');
    expect(selector).toContain(':page-scroll="pageScroll"');
    expect(selector).toContain('pageScroll?: boolean');
    expect(selector).toContain('pageScroll: true');
    expect(selector).toContain('fill');
    expect(picker).toContain('<BVirtualList');
    expect(picker).toContain('virtualizedMode');
    expect(picker).toContain(":scroll-mode=\"pageScroll ? 'ancestor' : 'self'\"");
    expect(pickerSearch).toContain("paginationMode: 'ordered'");
    expect(workbench).toContain('align-items: start');
    expect(workbench).toContain('resourceRefs: selectedResources.value.map');
    const workspace = source('src/view/toolbox/components/KnowledgeWorkspace.vue');
    expect(workspace).toContain(':page-scroll="!isMobileLayout"');
    expect(workspace).toContain('grid-template-rows: minmax(0, 1fr) auto');
  });

  it('知识工具使用配置驱动的差异化工作流，成果页不直出内部对象与伪连续进度', () => {
    const config = source('src/config/toolbox.ts');
    const workbench = source('src/view/toolbox/ToolboxWorkbench.vue');
    const task = source('src/view/toolbox/ToolboxTask.vue');
    const presentation = source('src/utils/toolboxArtifactPresentation.ts');
    const home = source('src/view/toolbox/ToolboxHome.vue');

    for (const toolId of [
      'idea_to_draft',
      'material_to_note',
      'research_brief',
      'study_kit',
      'concept_map',
      'action_plan',
      'source_comparison',
      'knowledge_audit',
    ]) {
      expect(config).toContain(`${toolId}: {`);
    }
    expect(workbench).toContain('TOOLBOX_WORKFLOW_PRESENTATION');
    expect(workbench).toContain('intent: selectedIntent.value || undefined');
    expect(workbench).not.toContain('intentInstruction()');
    expect(workbench).toContain("workflowText('questionLabel')");
    expect(workbench).toContain("tool.value?.input.kind === 'prompt'");
    expect(workbench).toContain('v-if="!isPromptTool" class="toolbox-workflow-card is-sources"');
    expect(task).toContain("job.value?.toolId === 'idea_to_draft'");
    expect(task).toContain('stagePrompt');
    expect(workbench).not.toContain('v-model:value="instruction"');
    expect(workbench).not.toContain('<BChip');
    expect(task).toContain('toolbox-stage-list');
    expect(task).toContain("job.value?.stage === 'retrying'");
    expect(task).toContain("t('toolbox.task.retryingTitle')");
    expect(task).toContain("t('toolbox.task.finalFailureMessage')");
    expect(task).toContain('v-if="refreshFailed"');
    expect(task).toContain('pollFailureCount += 1');
    expect(task).toContain('MAX_POLL_RETRY_DELAY_MS');
    expect(task).not.toContain('if (version === requestVersion) loadFailed.value = true');
    expect(task).toContain('toolboxCoverageIssueKinds');
    expect(task).toContain('toolboxArtifactSourceRecords');
    expect(task).toContain('stripAiAnalysisCitations');
    expect(task).not.toContain('<BProgress');
    expect(task).not.toContain('<BChip');
    expect(task).not.toContain('.map(String)');
    expect(presentation).toContain("value !== '[object Object]'");
    expect(task).not.toContain('artifact?.content ||');
    expect(home).not.toContain("tool.phase === 'next'");
  });

  it('工具箱与聊天室复用同一组顶栏胶囊状态样式', () => {
    const navigation = source('src/components/home/navigation/Navigation.vue');
    expect(navigation).toContain('class="navigation-pill-entry navigation-toolbox-entry"');
    expect(navigation).toContain('class="navigation-pill-entry navigation-community-entry"');
    expect(navigation).toContain('.navigation-pill-entry:hover');
    expect(navigation).toContain('.navigation-pill-entry.is-active');
  });

  it('工具箱中英文文案键保持完全一致', () => {
    expect(localeKeys(enUS.toolbox).sort()).toEqual(localeKeys(zhCN.toolbox).sort());
  });
});
