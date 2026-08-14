import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteLibrary.vue'), 'utf8');
const detailSource = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteDetail.vue'), 'utf8');
const subpageSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/NoteSubpageSection.vue'),
  'utf8',
);
const cardSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/library/NoteCard.vue'), 'utf8');
const listItemSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/library/NoteListItem.vue'),
  'utf8',
);
const readonlyPreviewSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/library/NoteReadonlyPreview.vue'),
  'utf8',
);
const noteLibrarySidebarSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/tree/NoteLibrarySidebar.vue'),
  'utf8',
);
const mobilePageListSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/workspace/NoteMobilePageLevelList.vue'),
  'utf8',
);
const mobileNavigationDrawerSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/workspace/NoteMobileNavigationDrawer.vue'),
  'utf8',
);
const treeRowSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/tree/NoteTreeRow.vue'), 'utf8');
const workspaceShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/workspace/NoteWorkspaceShell.vue'),
  'utf8',
);
const noteHeaderSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/NoteHeader.vue'),
  'utf8',
);
const aiReplySource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/detail/AiReply.vue'), 'utf8');
const zhLocaleSource = readFileSync(resolve(process.cwd(), 'src/i18n/locales/zh-CN.ts'), 'utf8');
const enLocaleSource = readFileSync(resolve(process.cwd(), 'src/i18n/locales/en-US.ts'), 'utf8');

describe('笔记库批量 AI 操作语义', () => {
  it('首次列表请求启动前保持加载态，避免目录功能快照期间闪出空状态', () => {
    expect(source).toContain('const loading = ref(true);');
    expect(source).toMatch(
      /v-if="!desktopPreviewOpen && loading && currentViewMode === 'card'"[\s\S]*?note-card-skeleton-wrap/,
    );
    expect(source).toContain('v-if="!desktopPreviewOpen && !loading && !visibleDragNoteList.length"');
  });

  it('桌面与移动端都区分“添加到 AI 助手”和“AI 智能整理”', () => {
    expect(source).toContain("t('ai.entry.addSelectedToAssistant')");
    expect(source).toContain("$t('bookmarkMg.aiOrganizeBtn')");
    expect(source).toContain("key: 'assistant'");
    expect(source).toContain("key: 'smartOrganize'");
    expect(source).toContain('icon: icon.ai.materials');
    expect(source).toContain('icon: icon.ai.organize');
  });

  it('桌面批量工具栏只保留高频动作，低频动作收进更多菜单', () => {
    expect(source).toContain(':menu-options="desktopBatchMoreOptions"');
    expect(source).toMatch(/const desktopBatchMoreOptions = computed\(\(\) => \[[\s\S]*key: 'assistant'/);
    expect(source).toMatch(/const desktopBatchMoreOptions = computed\(\(\) => \[[\s\S]*key: 'addTags'/);
    expect(source).toMatch(/const desktopBatchMoreOptions = computed\(\(\) => \[[\s\S]*key: 'removeTags'/);
    expect(source).toMatch(/const desktopBatchMoreOptions = computed\(\(\) => \[[\s\S]*key: 'export'/);
    expect(source).not.toContain('@click="openSelectedNotesAi(\'organize\')"');
    expect(source).not.toContain('@click="openBatchTags(\'add\')"');
    expect(source).not.toContain('@click="openBatchTags(\'remove\')"');
    expect(source).not.toContain('@click="openBatchExportModal"');
    expect(source).toContain("{{ $t('note.batchDone') }}");
    expect(zhLocaleSource).toContain("batchDone: '完成'");
    expect(enLocaleSource).toContain("batchDone: 'Done'");
  });

  it('AI 智能整理把当前所选笔记 ID 交给自动打标签弹窗', () => {
    expect(source).toContain(':selected-ids="selectedAiOrganizeIds"');
    expect(source).toMatch(/function openSelectedAiOrganize\(\)[\s\S]*selectedAiOrganizeIds\.value = selectedIds/);
    expect(source).toMatch(/action\.key === 'smartOrganize'[\s\S]*openSelectedAiOrganize\(\)/);
  });

  it('普通态与批量态的 AI 智能整理共用系统主紫色强调样式', () => {
    expect(source).toMatch(/class="note-action-button note-ai-button"[\s\S]{0,180}@click="openSelectedAiOrganize"/);
    expect(source).toMatch(/class="note-action-button note-ai-button"[\s\S]{0,180}@click="openGlobalAiOrganize"/);

    const aiButtonRule = source.match(/\.note-ai-button\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
    expect(aiButtonRule).toContain('border: 1px solid var(--primary-color');
    expect(aiButtonRule).toContain('color: var(--primary-color');
    expect(aiButtonRule).toContain('background: color-mix(in srgb, var(--primary-color');
    expect(aiButtonRule).not.toContain('--resource-note-color');
  });
});

describe('笔记库页面树交互接线', () => {
  it('目录折叠入口位于工作区分隔线中部，笔记库和详情顶栏不再重复展示', () => {
    expect(workspaceShellSource).toContain('note-workspace-shell__sidebar-boundary-toggle--close');
    expect(workspaceShellSource).toContain('top: 50%');
    expect(workspaceShellSource).toContain('icon.arrow_left');
    expect(workspaceShellSource).toContain('icon.arrow_right');
    expect(source).not.toContain('class="note-action-button note-sidebar-toggle"');
    expect(detailSource).not.toContain('@toggle-sidebar="toggleDetailSidebar"');
  });

  it('桌面目录栏常驻并平滑收展，拖拽热区不再额外绘制粗分隔线', () => {
    expect(workspaceShellSource).toContain('v-if="hasSidebar && effectiveSidebarPresentation === \'dock\'"');
    expect(workspaceShellSource).toContain(':class="{ \'is-collapsed\': !sidebarOpen }"');
    expect(workspaceShellSource).toContain('transition: grid-template-columns 240ms');
    expect(workspaceShellSource).toContain('grid-template-columns: 0 minmax(680px, 1fr)');
    expect(workspaceShellSource).toContain('note-workspace-shell__sidebar-content');
    expect(workspaceShellSource).not.toContain('width: 2px;\n      height: 42px;');
    expect(source).toContain('--note-workspace-divider-color: var(--note-workspace-frame-color)');
    expect(source).toMatch(/\.note-sidebar-panel\s*\{[\s\S]*?border-right: 0;/);
  });

  it('目录栏拖拽热区支持双击恢复统一默认宽度', () => {
    expect(workspaceShellSource).toContain('@dblclick.stop.prevent="resetSidebarWidth"');
    expect(workspaceShellSource).toContain("t('note.resetPageSidebarWidthHint')");
    expect(workspaceShellSource).toContain("emit('update:sidebarWidth', NOTE_WORKSPACE_DEFAULT_SIDEBAR_WIDTH)");
  });

  it('平板笔记库使用独立临时目录覆盖层，布局切换时自动收起', () => {
    expect(source).toContain(':sidebar-overlay-open="librarySidebarOverlayOpen"');
    expect(source).toContain('@update:sidebar-overlay-open="setLibrarySidebarOverlayOpen"');
    expect(source).toContain('@layout-change="handleLibraryLayoutChange"');
    expect(source).toMatch(
      /function handleLibraryLayoutChange[\s\S]*libraryWorkspaceMode\.value !== layout\.mode[\s\S]*librarySidebarOverlayOpen\.value = false/,
    );
  });

  it('平板折叠目录不再保留宽轨道，仍可从内容边界重新展开', () => {
    expect(workspaceShellSource).toContain('.note-workspace-shell.has-sidebar-rail');
    expect(workspaceShellSource).toContain('grid-template-columns: 0 minmax(0, 1fr)');
    expect(workspaceShellSource).toMatch(
      /effectiveSidebarPresentation\.value === 'overlay' \|\| effectiveSidebarPresentation\.value === 'rail'/,
    );
    expect(workspaceShellSource).not.toContain('note-workspace-shell__rail-button');
  });

  it('AI 助手使用紫色 AI 语义边界按钮，详情顶栏不再重复提供入口', () => {
    expect(workspaceShellSource).toContain('note-workspace-shell__ai-boundary-toggle--open');
    expect(workspaceShellSource).toContain('note-workspace-shell__ai-boundary-toggle--close');
    expect(workspaceShellSource).toContain('<SvgIcon :src="icon.ai.organize" size="18"');
    expect(workspaceShellSource).toContain('@click.stop="openAi"');
    expect(workspaceShellSource).toContain('@click.stop="closeAi"');
    expect(workspaceShellSource).toMatch(
      /\.note-workspace-shell__ai-boundary-toggle\.b_btn\s*\{[\s\S]*?border-color: var\(--primary-color[\s\S]*?color: var\(--primary-color/,
    );
    expect(workspaceShellSource).toMatch(
      /\.note-workspace-shell__ai-boundary-toggle--open\.b_btn\s*\{[\s\S]*?width: 34px;[\s\S]*?border-right: 0;/,
    );
    expect(noteHeaderSource).not.toContain('note-header-ai-toggle');
    expect(noteHeaderSource).not.toContain("'toggleAi'");
    expect(detailSource).not.toContain(':show-ai-toggle');
    expect(detailSource).not.toContain('@toggle-ai');
  });

  it('笔记根节点在中英文界面统一命名为“笔记库”', () => {
    expect(zhLocaleSource).toContain("knowledgeRoot: '笔记库'");
    expect(zhLocaleSource).toContain("useRoot: '改存到笔记库'");
    expect(zhLocaleSource).not.toContain("knowledgeRoot: '我的知识库'");
    expect(enLocaleSource).toContain("knowledgeRoot: 'Note Library'");
    expect(enLocaleSource).toContain("useRoot: 'Move to Note Library'");
  });

  it('宽屏 AI 侧栏以稳定零宽轨道平滑收展，不再用 display none 瞬切', () => {
    expect(workspaceShellSource).toMatch(
      /\.note-workspace-shell\.has-ai-dock\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 0;/,
    );
    expect(workspaceShellSource).toMatch(
      /\.note-workspace-shell\.has-sidebar-dock\.has-ai-dock\s*\{[\s\S]*?grid-template-columns: 0 minmax\(680px, 1fr\) 0;/,
    );
    expect(workspaceShellSource).toMatch(
      /\.note-workspace-shell__ai--dock\s*\{[\s\S]*?opacity 150ms ease[\s\S]*?transform 240ms/,
    );
    expect(workspaceShellSource).toMatch(
      /\.note-workspace-shell__ai--dock\.is-collapsed\s*\{[\s\S]*?transform: translateX\(12px\);/,
    );
    expect(workspaceShellSource).not.toMatch(
      /\.note-workspace-shell__ai--dock\.is-collapsed\s*\{[\s\S]*?display: none;/,
    );
  });

  it('AI 内容铺满侧栏，并以实色分区描边强化浅色主题层次', () => {
    const aiSlotRule = detailSource.match(/\.note-detail-ai-slot\s*\{([^}]*)\}/)?.[1] || '';
    expect(aiSlotRule).toContain('height: 100%');
    expect(aiSlotRule).toContain('box-sizing: border-box');
    expect(aiSlotRule).not.toContain('padding: 16px');
    expect(aiReplySource).toMatch(/\.ai-container\s*\{[\s\S]*?border-radius: 0;[\s\S]*?border: 0;/);
    expect(aiReplySource).toMatch(/\.ai-note-meta\s*\{[\s\S]*?border: 1px solid var\(--ai-section-border\);/);
    expect(aiReplySource).toMatch(/\.action-btn\s*\{[\s\S]*?border: 1px solid var\(--ai-section-border\);/);
  });

  it('暗色目录覆盖层和 AI 外壳使用主题表面背景与边框', () => {
    expect(workspaceShellSource).toMatch(
      /\.note-workspace-shell__ai--dock\s*\{[\s\S]*?border-left: 1px solid var\(--surface-border-color[\s\S]*?background: var\(--workspace-panel-bg-color/,
    );
    expect(workspaceShellSource).toMatch(
      /\.note-workspace-shell__sidebar--overlay\s*\{[\s\S]*?border-right: 1px solid var\(--surface-border-color/,
    );
    expect(workspaceShellSource).toMatch(
      /\.note-workspace-shell__ai--overlay\s*\{[\s\S]*?border-left: 1px solid var\(--surface-border-color/,
    );
  });

  it('移动端唯一范围入口按当前分类只显示目录或标签，不把两套范围拼在一起', () => {
    expect(source).toContain('<span>{{ mobileScopeLabel }}</span>');
    expect(source).toContain('const activeMobileTagLabel = computed(() => {');
    expect(source).toMatch(
      /const mobileScopeLabel = computed[\s\S]*noteSidebarMode\.value === 'tags'[\s\S]*activeMobileTagLabel/,
    );
    expect(source).not.toMatch(/`\$\{directory\} · \$\{activeMobileTagLabel\.value\}`/);
    expect(source).not.toContain('class="note-mobile-tag"');
  });

  it('目录与标签请求互斥，切换分类时会清理另一套 URL 范围', () => {
    expect(source).toContain("noteSidebarMode.value === 'directory'");
    expect(source).toContain("tagId: noteSidebarMode.value === 'tags' ? getActiveNoteTagId() : undefined");
    expect(source).toMatch(/function selectMobileDirectoryTag[\s\S]*delete query\.parent/);
    expect(source).toMatch(/const handleNodeTypeChange[\s\S]*delete query\.parent/);
  });

  it('功能开关快照还在加载时保留账号的默认目录偏好', () => {
    expect(source).toContain(':directory-enabled="!noteTreeFeaturesReady || noteTreeReadEnabled"');
    expect(source).toMatch(
      /function initialNoteClassificationMode[\s\S]*user\.preferences\.noteSidebarMode === 'tags'[\s\S]*'directory'/,
    );
  });

  it('目录能力快照返回前先渲染主区标题栏，避免骨架列表纵向跳动', () => {
    expect(source).toContain('v-else-if="showDesktopDirectoryHeader"');
    expect(source).toMatch(
      /const showDesktopDirectoryHeader = computed\([\s\S]*!bookmark\.isMobile[\s\S]*noteSidebarMode\.value === 'directory'[\s\S]*!noteTreeFeaturesReady\.value \|\| noteTreeReadEnabled\.value/,
    );
    expect(source).toMatch(/\.note-directory-header\s*\{[\s\S]*?flex: 0 0 auto;/);
  });

  it('按本地目录展开偏好预留首帧侧栏宽度，并连续显示目录骨架', () => {
    expect(source).toContain(':has-sidebar="showNoteWorkspaceSidebar"');
    expect(source).toMatch(
      /const showNoteWorkspaceSidebar = computed\([\s\S]*noteTreeReadEnabled\.value \|\|[\s\S]*!bookmark\.isMobile[\s\S]*!noteTreeFeaturesReady\.value[\s\S]*noteSidebarExpanded\.value/,
    );
    expect(source).toMatch(
      /const sidebarTreeLoadingKeys = computed\([\s\S]*!noteTreeFeaturesReady\.value[\s\S]*showNoteWorkspaceSidebar\.value[\s\S]*new Set\(\[NOTE_TREE_ROOT_KEY\]\)/,
    );
    expect(noteLibrarySidebarSource).toContain('class="note-tree-skeleton-row"');
    expect(noteLibrarySidebarSource).toContain('v-for="n in 8"');
  });

  it('目录恢复直接呈现子树，只有用户手动点击的节点播放展开动画', () => {
    expect(source).toContain(':motion-expansion-ids="treeMotionExpansionIds"');
    expect(source).toMatch(
      /async function toggleTreeNode[\s\S]*treeMotionExpansionIds\.value = new Set\([\s\S]*await toggleTreeNodeBase\(node\)[\s\S]*next\.delete\(nodeId\)/,
    );
    expect(noteLibrarySidebarSource).toContain(':motion-expansion-ids="motionExpansionIds"');
    expect(treeRowSource).toContain('<Transition name="note-tree-children" :css="animateChildren">');
    expect(treeRowSource).toMatch(
      /const animateChildren = computed\([\s\S]*!props\.motionExpansionIds \|\| props\.motionExpansionIds\.has\(props\.node\.id\)/,
    );
  });

  it('只在固定预览顶栏展示笔记标题，正文直接从用户内容开始', () => {
    expect(readonlyPreviewSource).toContain("<h2>{{ displayNote.title || t('note.untitled') }}</h2>");
    expect(readonlyPreviewSource).not.toContain("<h1>{{ displayNote.title || t('note.untitled') }}</h1>");
    expect(readonlyPreviewSource).toContain(
      'class="note-readonly-preview__content note-rich-content is-image-preview-enabled"',
    );
    expect(readonlyPreviewSource).toMatch(/\.note-readonly-preview__content[\s\S]*:deep\(> :first-child\)/);
  });

  it('目录树同时支持中央移入、前后插入和根层最前落点', () => {
    expect(source).toContain(':data-note-drop-parent="String(note.id)"');
    expect(source).toContain(':data-note-drop-parent="NOTE_TREE_ROOT_KEY"');
    expect(source).toContain('const nestedTarget = dragDropTarget.value');
    expect(source).toContain('@drag-start="onTreeDragStart"');
    expect(source).toContain('setCompactTreeDragImage');
    expect(source).toContain('event.dataTransfer.setDragImage(preview, 18, 16)');
    expect(source).toContain("window.addEventListener('dragover', onTreeNativeDragOver, true)");
    expect(source).toContain("'/api/note/moveNoteNode'");
    expect(source).toContain('previousId: target.previousId');
    expect(source).toContain('nextId: target.nextId');
    expect(source).toContain('buildTreeNodeDropTarget');
    expect(source).toContain('buildRootStartDropTarget');
    expect(source).toContain("t('note.moveBeforeSuccess'");
    expect(source).toContain("t('note.moveAfterSuccess'");
    expect(source).toContain("t('note.moveRootStartSuccess'");
    expect(source).toContain("t('note.moveIntoSuccess'");
  });

  it('目录拖拽先乐观更新，接口失败回滚，成功后不清空整树重载', () => {
    expect(source).toMatch(
      /moveNoteTreeNodeOptimistically\(previousTree,[\s\S]*childrenByParent\.value = optimisticMove\.childrenByParent[\s\S]*await apiBasePost\('\/api\/note\/moveNoteNode'/,
    );
    expect(source).toMatch(
      /catch \(error\) \{[\s\S]{0,180}childrenByParent\.value = previousTree[\s\S]{0,80}throw error/,
    );
    expect(source).toMatch(
      /response\.status !== 200[\s\S]{0,180}childrenByParent\.value = previousTree[\s\S]{0,180}return false/,
    );
    const moveFunction =
      source.match(/async function moveNoteIntoTarget[\s\S]*?\n  function onTreeNativeDrop/)?.[0] || '';
    expect(moveFunction).not.toContain('refreshTree()');
  });

  it('当前父页面为空时明确提供新建子页面和关联已有页面', () => {
    expect(source).toContain("$t('note.noSubpagesForCurrent')");
    expect(source).toContain("$t('note.noSubpagesHint'");
    expect(source).toContain('@click="openAttachPages(currentDirectoryNode)"');
  });

  it('桌面顶部新建笔记固定创建到根层，与当前目录的新建子页面分开', () => {
    expect(source).toContain('class="note-action-button note-create-button note-root-create-button"');
    expect(source).toContain('@click="showRootNotePicker"');
    expect(source).toMatch(/function showRootNotePicker\(\)[\s\S]*createParentOverride\.value = null/);
    expect(source).toMatch(/class="note-new-child-page"[\s\S]{0,180}@click="showNewNotePicker"/);
  });

  it('页面菜单和详情入口均可关联已有页面', () => {
    expect(source).toContain("{ key: 'attach', label: t('note.addExistingPages')");
    expect(source).toContain('<NoteAttachPagesModal');
    expect(source).toContain('@attach="openAttachPages"');
  });

  it('目录菜单支持置顶切换，卡片和列表把标签与层级信息放在稳定区域', () => {
    expect(source).toContain('@toggle-top="toggleTreeNoteTop"');
    expect(source).toMatch(/function toggleTreeNoteTop[\s\S]*toggleNoteTop\(note\)/);
    expect(source).toMatch(
      /noteWorkspace\.updateNoteMetadata\(noteId, \{ isTop: note\.isTop \}\)[\s\S]*Promise\.all\(\[reloadNotes\(\), refreshTree\(\)\]\)/,
    );
    expect(source).toMatch(/noteList\.value = groupedNotes;[\s\S]{0,180}await refreshTree\(\)/);
    expect(cardSource).toMatch(/class="note-footer-chips"[\s\S]*class="note-tags"[\s\S]*class="note-child-count"/);
    expect(listItemSource).toMatch(/\.note-tags\s*\{[\s\S]{0,120}order: -1/);
    expect(listItemSource).toMatch(/&\.is-mobile[\s\S]*\.note-tags\s*\{[\s\S]{0,80}order: 0/);
  });

  it('移动端详情移除底部子页面条，页面关系操作统一由顶部页面导航承载', () => {
    expect(detailSource).not.toContain('<NoteSubpageSection');
    expect(detailSource).not.toContain('import NoteSubpageSection from');
    expect(detailSource).toContain('@open-navigation="openMobileNavigation()"');
    expect(detailSource).toContain('@move-page="openMoveSelf"');
    expect(detailSource).toContain('<NoteMoveModal');
    expect(detailSource).toContain(':note="moveTargetNote"');
    expect(subpageSource).toContain("t('note.moveExistingUnderThisPage')");
    expect(subpageSource).toContain("t('note.moveThisPageUnderAnother')");
  });

  it('详情页父级面包屑直接打开父正文，根节点才返回笔记库列表', () => {
    expect(detailSource).toContain('@click="openBreadcrumbPage(item.id)"');
    expect(detailSource).toMatch(/function openBreadcrumbPage[\s\S]*openNoteDetailPage\(pageId\)/);
    expect(detailSource).toMatch(
      /function openNoteDetailPage[\s\S]*`\/noteLibrary\/\$\{encodeURIComponent\(normalizedId\)\}`/,
    );
    expect(detailSource).not.toContain('function openBreadcrumbDirectory');
  });

  it('编辑页先预取未缓存目标再切换路由，且快速连点只进入最后目标', () => {
    const openFunction = detailSource.match(/async function openNoteDetailPage[\s\S]*?\n  }/)?.[0] || '';
    expect(openFunction.indexOf('await prefetchNoteDetail(user, normalizedId)')).toBeGreaterThan(-1);
    expect(openFunction.indexOf('await router.push')).toBeGreaterThan(
      openFunction.indexOf('await prefetchNoteDetail(user, normalizedId)'),
    );
    expect(openFunction).toContain('const requestVersion = ++noteOpenRequestVersion');
    expect(openFunction).toContain('if (requestVersion !== noteOpenRequestVersion) return;');
    expect(openFunction).toContain('normalizedId === openingPageId.value');
    expect(detailSource).not.toContain(':opening-page-id="openingPageId"');
    expect(noteLibrarySidebarSource).not.toContain(':opening-page-id="openingPageId"');
    expect(treeRowSource).not.toContain(':loading="opening"');
    expect(treeRowSource).not.toContain('props.openingPageId === props.node.id');
  });

  it('编辑页切换笔记前保存页面树滚动位置，新目录实例挂载后恢复', () => {
    const persistFunction = detailSource.match(/async function persistBeforeLeave[\s\S]*?\n  }/)?.[0] || '';
    expect(persistFunction).toContain('captureDetailTreeScroll();');
    expect(detailSource).toContain(':tree-scroll-top="detailTreeScrollTop"');
    expect(noteLibrarySidebarSource).toContain('ref="treeScrollRef"');
    expect(noteLibrarySidebarSource).toContain("props.surface !== 'detail'");
    expect(noteLibrarySidebarSource).toContain('element.scrollTop = Math.max(0, Number(props.treeScrollTop || 0));');
  });

  it('新建草稿首次保存后直接写入目录与面包屑，不强制刷新完整目录', () => {
    const promoteFunction = detailSource.match(/function promoteSavedDraftInTree\(\)[\s\S]*?\n  }/)?.[0] || '';
    expect(promoteFunction).toContain('noteWorkspace.insertCreatedNote');
    expect(promoteFunction).toContain('noteWorkspace.seedBreadcrumb');
    expect(promoteFunction).toContain("treeError.value = ''");
    expect(promoteFunction).toContain('activePageId: createdId');
    expect(promoteFunction).not.toContain('loadTreeChildren(createdParentId, true)');
    expect(promoteFunction).toContain('if (!canSeedBreadcrumb)');
    expect(promoteFunction).toContain('await loadDetailBreadcrumb(createdId)');
    expect(detailSource).toMatch(/if \(res\.status === 200 && res\.data\?\.id\)[\s\S]*?promoteSavedDraftInTree\(\)/);
  });

  it('详情顶栏返回键在所有设备一次回到进入正文前的笔记库范围', () => {
    const backFunction = detailSource.match(/async function back\(\)[\s\S]*?\n  }/)?.[0] || '';
    expect(backFunction).toContain('returnToSource();');
    expect(backFunction).not.toContain('openNoteDetailPage(parentId)');
    expect(backFunction).not.toContain('router.back()');
  });

  it('详情内容加载后保留独立 key，但不再让整个正文做进场位移动画', () => {
    const stablePanelStart = detailSource.indexOf('class="note-body-header editor-panel"');
    const breadcrumbStart = detailSource.indexOf('class="note-detail-breadcrumb"', stablePanelStart);
    const keyedContentStart = detailSource.indexOf(':key="noteContentKey"', breadcrumbStart);

    expect(stablePanelStart).toBeGreaterThan(-1);
    expect(breadcrumbStart).toBeGreaterThan(stablePanelStart);
    expect(keyedContentStart).toBeGreaterThan(breadcrumbStart);
    expect(detailSource).not.toContain('<Transition name="note-content-switch"');
    expect(detailSource).toContain('v-if="canShowPrivateNavigation || (showInboxOrganizer && !bookmark.isMobile)"');
    expect(detailSource).toContain('v-if="canShowPrivateNavigation"\n              class="note-detail-breadcrumb"');
    expect(detailSource).not.toContain('canShowPrivateNavigation && detailBreadcrumb.length');
    expect(detailSource).toContain('v-for="item in detailBreadcrumbTailDisplay"');
    expect(detailSource).toContain('class="note-detail-content"');
    expect(detailSource).toContain('const detailInstanceRouteId = routeNoteLoadKey.value.split');
    expect(detailSource).toContain('if (id !== detailInstanceRouteId && !isPromotedCurrentDraft) return;');
  });

  it('桌面端按偏好进入库内预览或编辑，移动端仍直接打开正文', () => {
    expect(treeRowSource).toContain('@click="emit(\'open\', node.id)"');
    expect(treeRowSource).not.toContain("key: 'open'");
    expect(source).toContain('@open="openLibraryNote"');
    expect(source).toContain('shouldOpenNoteDirectly(user.preferences, bookmark.isMobile)');
    expect(source).toContain('return openDirectoryPage(noteId)');
    expect(source).toContain('<NoteReadonlyPreview');
    expect(cardSource).toContain("emit('open')");
    expect(listItemSource).toContain("emit('open')");
    expect(mobilePageListSource).toMatch(/function selectItem[\s\S]*emit\('openPage', item\.id\)/);
    expect(mobilePageListSource).toContain("emit('toggleTop', item)");
    expect(mobilePageListSource).toContain("emit('create', item)");
    expect(mobilePageListSource).toContain("emit('attach', item)");
    expect(mobilePageListSource).toContain("emit('rename', item)");
    expect(mobilePageListSource).toContain("emit('move', item)");
    expect(mobilePageListSource).toContain("emit('copyLink', item)");
    expect(mobilePageListSource).toContain("emit('delete', item)");
    expect(detailSource).toContain(':write-enabled="noteTreeWriteEnabled && !readonly"');
    expect(detailSource).toContain(':drag-enabled="false"');
  });

  it('移动端目录范围顶部始终提供当前页面正文卡片，空目录也能直接进入正文', () => {
    expect(source).toContain('class="note-mobile-current-page-card"');
    expect(source).toContain("$t('note.currentPageShort')");
    expect(source).toContain('@click="openDirectoryPage(currentParentId)"');
    expect(source).toMatch(/note-mobile-current-page-card[\s\S]{0,700}note\.openPageBody/);
  });

  it('移动端笔记更多操作统一使用底部抽屉，不再在卡片上悬浮下拉菜单', () => {
    expect(source).toContain('v-model:open="mobileNoteActionsOpen"');
    expect(source).toContain(':actions="mobileNoteActions"');
    expect(cardSource).toContain("emit('action', 'more')");
    expect(listItemSource).toContain("emit('action', 'more')");
    expect(cardSource).not.toContain('<BDropdown');
    expect(listItemSource).not.toContain('<BDropdown');
  });

  it('移动端从详情返回知识库会打开根目录抽屉，抽屉内层级跳转会等待遮罩历史释放', () => {
    expect(detailSource).toContain("query: { openDirectory: '1' }");
    expect(source).toContain('router.currentRoute.value.query.openDirectory');
    expect(source).toContain("openMobileDirectory('directory')");
    expect(mobileNavigationDrawerSource).toContain('closeCurrentMobileOverlayThen');
    expect(mobileNavigationDrawerSource).toMatch(
      /async function openPage[\s\S]*closeCurrentMobileOverlayThen[\s\S]*emit\('openPage', id\)/,
    );
  });

  it('移动端导航切换栏与搜索区保留独立间距，列表占用抽屉剩余高度', () => {
    expect(mobileNavigationDrawerSource).toContain('class="note-mobile-navigation-drawer__switcher"');
    expect(mobileNavigationDrawerSource).toMatch(
      /\.note-mobile-navigation-drawer__switcher\s*\{[\s\S]*?padding: 0 16px 12px/,
    );
    expect(mobileNavigationDrawerSource).toMatch(/\.note-mobile-navigation-drawer__pages,[\s\S]*?flex: 1 1 auto/);
  });

  it('批量导出可选择原格式、HTML、Markdown 或 PDF，并统一打包为 ZIP', () => {
    expect(source).toContain(':title="$t(\'note.batchExportTitle\')"');
    expect(source).toContain("key: 'original'");
    expect(source).toContain("key: 'html'");
    expect(source).toContain("key: 'markdown'");
    expect(source).toContain("key: 'pdf'");
    expect(source).toContain("apiBasePost('/api/note/getNotesForExport'");
    expect(source).toContain("import('@/utils/noteBatchExport')");
    expect(source).toContain("format: 'zip'");
    expect(source).not.toContain("backupKind: 'selected_notes_export'");
    expect(zhLocaleSource).toContain("batchExportOriginal: '按每篇默认格式'");
    expect(enLocaleSource).toContain("batchExportOriginal: 'Use Each Note’s Format'");
  });
});
