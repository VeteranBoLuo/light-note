import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentRoot = resolve(process.cwd(), 'src/components/cloudSpace');
const desktopSource = readFileSync(resolve(componentRoot, 'CloudFolder.vue'), 'utf8');
const mobileSource = readFileSync(resolve(componentRoot, 'MobileCloudFolderDrawer.vue'), 'utf8');
const pickerSource = readFileSync(resolve(componentRoot, 'CloudFolderPicker.vue'), 'utf8');
const moveFileSource = readFileSync(resolve(componentRoot, 'MoveFile.vue'), 'utf8');
const uploadSource = readFileSync(resolve(componentRoot, 'HandleBtnGroup.vue'), 'utf8');
const fileListSource = readFileSync(resolve(componentRoot, 'fieldList.vue'), 'utf8');
const pageSource = readFileSync(resolve(process.cwd(), 'src/view/cloudSpace/cloudSpace.vue'), 'utf8');

describe('云空间目录树紧凑布局', () => {
  it('根据完整目录快照切换平铺与树形模式，树形模式下同层图标保持对齐', () => {
    expect(desktopSource).toContain(`:class="{ 'is-tree-mode': folderTreeMode }"`);
    expect(desktopSource).toContain(
      'const folderTreeMode = computed(() => cloud.folderList.some((folder) => folder.parentId !== null))',
    );
    expect(desktopSource).toMatch(/v-if="folderTreeMode && folder\.hasChildren"\s+class="cloud-folder-row__chevron"/u);
    expect(desktopSource).toContain(
      'v-else-if="folderTreeMode" class="cloud-folder-row__chevron-placeholder" aria-hidden="true"',
    );
    expect(desktopSource).toContain(
      'v-if="folderTreeMode" class="cloud-folder-row__chevron-placeholder" aria-hidden="true"',
    );
    expect(desktopSource).not.toContain('cloud-folder-row__root-marker');
    expect(desktopSource).not.toContain('cloud-folder-row__current-check');
    expect(mobileSource).not.toContain('mobile-cloud-folder-drawer__check');
    expect(pickerSource).not.toContain('cloud-folder-picker__check');
    expect(desktopSource).not.toContain('position: absolute;\n    left: calc(4px');
    expect(desktopSource).not.toContain('.folder-list.is-tree-mode .cloud-folder-row--all');
    expect(desktopSource).toContain('(var(--cloud-folder-depth, 1) - 1) * 16px');
    expect(desktopSource).not.toContain('(var(--cloud-folder-depth, 1) - 1) * 29px');
    expect(desktopSource).toContain("{{ folder.directFileCount || '—' }}");
    expect(desktopSource).toContain('{{ cloud.allFileCount }}');
    expect(desktopSource).toContain('border-color: var(--resource-file-color, #ff8a00)');
  });

  it('折叠箭头向右、展开向下，hover 不显示方块背景', () => {
    expect(desktopSource).toContain('.cloud-folder-row__chevron:hover');
    expect(desktopSource).toContain('background: transparent !important');
    expect(desktopSource).toContain('transform: rotate(-90deg)');
    expect(desktopSource).toContain('.cloud-folder-row__chevron.is-expanded .cloud-folder-row__chevron-icon');
    expect(desktopSource).toContain('transform: rotate(0deg)');
    expect(desktopSource).not.toContain('.cloud-folder-row__chevron.is-expanded {');
  });

  it('移动端复用同一列结构、右向/下向箭头和右对齐计数', () => {
    expect(mobileSource).toContain('show-handle');
    expect(mobileSource).toContain(`:class="{ 'is-tree-mode': folderTreeMode }"`);
    expect(mobileSource).not.toContain('mobile-cloud-folder-drawer__root-marker');
    expect(mobileSource).toContain(
      'v-if="folderTreeMode" class="mobile-cloud-folder-drawer__toggle-spacer" aria-hidden="true"',
    );
    expect(mobileSource).toContain("{{ folder.directFileCount || '—' }}");
    expect(mobileSource).toContain('{{ allFileCount }}');
    expect(pageSource).toContain(':all-file-count="cloud.allFileCount"');
    expect(mobileSource).toContain('.mobile-cloud-folder-drawer__toggle-icon');
    expect(mobileSource).toContain('transform: rotate(-90deg)');
    expect(mobileSource).toContain(
      '.mobile-cloud-folder-drawer__toggle.is-expanded .mobile-cloud-folder-drawer__toggle-icon',
    );
    expect(mobileSource).toContain('transform: rotate(0deg)');
    expect(mobileSource).toContain('text-align: right');
  });

  it('移动端整行可选择文件夹，父级箭头只负责展开，目录切换等待抽屉 history 释放', () => {
    expect(mobileSource).toContain('@click="selectFolder(folder)"');
    expect(mobileSource).toContain('@click.stop="emit(\'toggle\', folder.id)"');
    expect(mobileSource).toContain('@keydown.enter.self.prevent="selectFolder(folder)"');
    expect(mobileSource).not.toMatch(/function select(?:All|Folder)[\s\S]*?emit\('update:open', false\)/u);
    expect(pageSource).toMatch(
      /async function selectMobileFolderFromTree[\s\S]*?closeCurrentMobileOverlayThen[\s\S]*?mobileFolderDrawerOpen\.value = false;[\s\S]*?cloud\.folder =[\s\S]*?await cloud\.queryFieldList\(\)/u,
    );
  });

  it('文件夹操作在桌面和中宽布局均可通过悬停或右键打开，拖拽支持跨层排序、移入和返回第一层', () => {
    expect(desktopSource).toContain("const folderMenuTriggers: BActionMenuTrigger[] = ['hover', 'contextmenu']");
    expect(desktopSource).not.toContain('class="cloud-folder-row__actions"');
    expect(desktopSource).toContain("{ key: 'move', label: t('cloudSpace.moveFolder'), icon: icon.noteTree.move }");
    expect(desktopSource).not.toContain(':disabled="!bookmark.isDesktop');
    expect(desktopSource).toContain(':draggable="!bookmark.isTouchDevice"');
    expect(desktopSource).not.toContain(':draggable="bookmark.isDesktop"');
    expect(desktopSource).toContain('@click.stop="folderClick(folder)"');
    expect(desktopSource).toContain("position === 'inside'");
    expect(desktopSource).toContain("'/api/file/moveFolder'");
    expect(desktopSource).toContain("'is-folder-drop-target'");
    expect(desktopSource).toContain('await moveFolderByDrop(source, target, position)');
    expect(desktopSource).toContain("folderDropTarget.value = { id: 'all', position: 'top-level' }");
    expect(desktopSource).toContain('{ id: source.id, parentId, anchorId, position: anchorPosition }');
    expect(desktopSource).toContain("t('cloudSpace.folderDropBefore'");
    expect(desktopSource).toContain("t('cloudSpace.folderDropInside'");
    expect(desktopSource).toContain("t('cloudSpace.folderDropAfter'");
    expect(desktopSource).toContain("t('cloudSpace.folderDropTopLevel')");
    expect(desktopSource).toContain('class="cloud-folder-drop-hint__action"');
    expect(desktopSource).toContain('class="cloud-folder-drop-hint__target"');
    expect(desktopSource).toContain('class="cloud-folder-drop-hint__relation"');
    expect(desktopSource).toContain("t('cloudSpace.folderDropRelationBefore')");
    expect(desktopSource).toContain("t('cloudSpace.folderDropRelationInside')");
    expect(desktopSource).toContain("t('cloudSpace.folderDropRelationAfter')");
    expect(desktopSource).toContain(`:class="{ 'is-ready': Boolean(folderDropTarget) }"`);
    expect(desktopSource).toContain('<BButton v-else class="cloud-folder-create"');
    expect(desktopSource).toMatch(/\.cloud-folder-drop-hint \{\s+flex: 0 0 40px/u);
    expect(desktopSource).toContain('padding: 0 12px');
    expect(desktopSource).toMatch(/\.cloud-folder-drop-hint__target[\s\S]*?text-overflow: ellipsis/u);
    expect(desktopSource).toContain('&.is-ready');
    expect(desktopSource).not.toContain("'/api/file/updateFolderSort'");
    expect(desktopSource).toContain('await cloud.refreshAfterFileMutation()');
  });

  it('文件新增、移动和删除后统一刷新目录计数快照', () => {
    expect(moveFileSource).toContain('await cloud.refreshAfterFileMutation()');
    expect(uploadSource).toContain('await cloud.refreshAfterFileMutation()');
    expect(fileListSource.match(/cloud\.refreshAfterFileMutation\(\)/gu)).toHaveLength(2);
  });

  it('删除父文件夹时明确确认并让整棵子目录的文件回到全部文件', () => {
    expect(desktopSource).toContain("'cloudSpace.deleteFolderTreeConfirm'");
    expect(pageSource).toContain("'cloudSpace.deleteFolderTreeConfirm'");
    expect(desktopSource).toContain('collectCloudFolderDescendantIds(cloud.folderList, folder.id)');
    expect(pageSource).toContain('collectCloudFolderDescendantIds(cloud.folderList, folder.id)');
    expect(desktopSource).toContain('{ id: folder.id, recursive: true }');
    expect(pageSource).toContain('{ id: folder.id, recursive: true }');
    expect(pageSource).toContain('!deletedFolderIds.has(String(item.id))');
  });

  it('桌面端和移动端共用目录文件清空弹窗，菜单语义明确且移动端先关闭抽屉', () => {
    const clearModalSource = readFileSync(resolve(componentRoot, 'CloudFolderClearModal.vue'), 'utf8');
    const mobileActionsSource = readFileSync(resolve(componentRoot, 'MobileCloudSpaceActionsDrawer.vue'), 'utf8');
    expect(desktopSource).toContain("key: 'clear-files'");
    expect(desktopSource).toContain('<CloudFolderClearModal');
    expect(mobileActionsSource).toContain("'clear-folder-files': [folder: CloudFolderNode]");
    expect(mobileActionsSource).toContain("emit('clear-folder-files', folder)");
    expect(pageSource).toContain('@clear-folder-files="openMobileFolderClear"');
    expect(pageSource).toMatch(
      /function openMobileFolderClear[\s\S]*?closeCurrentMobileOverlayThen[\s\S]*?mobileFolderClearVisible\.value = true/u,
    );
    expect(clearModalSource).toContain("'/api/file/clearFolderFiles'");
    expect(clearModalSource).toContain('<BCheckbox v-model="deleteFolders"');
    expect(clearModalSource).toContain('deleteFolders.value = false');
    expect(clearModalSource).toContain('await cloud.refreshAfterFileMutation()');
    expect(clearModalSource).toContain("cloud.folder = { id: 'all'");
  });
});
