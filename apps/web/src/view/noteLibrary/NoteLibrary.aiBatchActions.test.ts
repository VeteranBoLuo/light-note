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

describe('笔记库批量 AI 操作语义', () => {
  it('桌面与移动端都区分“添加到 AI 助手”和“AI 智能整理”', () => {
    expect(source).toContain("$t('ai.entry.addSelectedToAssistant')");
    expect(source).toContain("$t('bookmarkMg.aiOrganizeBtn')");
    expect(source).toContain("key: 'assistant'");
    expect(source).toContain("key: 'smartOrganize'");
    expect(source).toContain('icon: icon.ai.materials');
    expect(source).toContain('icon: icon.ai.organize');
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
    expect(source).toMatch(/function toggleTreeNoteTop[\s\S]*toggleNoteTop\(note, true\)/);
    expect(cardSource).toMatch(/class="note-footer-chips"[\s\S]*class="note-tags"[\s\S]*class="note-child-count"/);
    expect(listItemSource).toMatch(/\.note-tags\s*\{[\s\S]{0,120}order: -1/);
    expect(listItemSource).toMatch(/&\.is-mobile[\s\S]*\.note-tags\s*\{[\s\S]{0,80}order: 0/);
  });

  it('详情页把当前页作为父节点和子节点的移动入口分开，并将子页面压缩为紧凑导航条', () => {
    expect(detailSource).toContain('@move-self="openMoveSelf"');
    expect(detailSource).toContain('<NoteMoveModal');
    expect(detailSource).toContain(':note="moveSelfNote"');
    expect(subpageSource).toContain("t('note.moveExistingUnderThisPage')");
    expect(subpageSource).toContain("t('note.moveThisPageUnderAnother')");
    expect(subpageSource).toContain('grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))');
    expect(subpageSource).toContain('max-height: min(18dvh, 108px)');
    expect(subpageSource).not.toContain('class="note-subpage-empty"');
  });

  it('详情页父级面包屑直接打开父正文，根节点才返回笔记库列表', () => {
    expect(detailSource).toContain('@click="openBreadcrumbPage(item.id)"');
    expect(detailSource).toMatch(/function openBreadcrumbPage[\s\S]*openNoteDetailPage\(pageId\)/);
    expect(detailSource).toMatch(/function openNoteDetailPage[\s\S]*`\/noteLibrary\/\$\{encodeURIComponent\(id\)\}`/);
    expect(detailSource).not.toContain('function openBreadcrumbDirectory');
  });
});
