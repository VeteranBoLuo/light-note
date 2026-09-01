import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const bottomNavigationSource = readSource('src/components/mobile/MobileBottomNav.vue');
const shellSource = readSource('src/components/mobile/MobileAppShell.vue');
const createLayerSource = readSource('src/components/mobile/MobileFormalCreateLayer.vue');
const todaySource = readSource('src/view/workbenches/MobileTodayView.vue');
const noteLibrarySource = readSource('src/view/noteLibrary/NoteLibrary.vue');
const cloudSpaceSource = readSource('src/view/cloudSpace/cloudSpace.vue');

describe('移动端正式新建与快速收集的职责边界', () => {
  it('今日继续负责快速收集，底部新建通过壳体打开原地创建层', () => {
    expect(todaySource).toContain('inbox.openQuickCapture');
    expect(bottomNavigationSource).not.toContain('inbox.openQuickCapture');
    expect(bottomNavigationSource).toContain("emit('formalCreate', action.key)");
    expect(shellSource).toContain('@formal-create="openFormalCreate"');
    expect(shellSource).toContain('MobileFormalCreateLayer');
  });

  it('笔记和文件由原地创建层承接，书签与待办保留独立完整页面', () => {
    expect(createLayerSource).toContain('MobileFormalNoteCreateModal');
    expect(createLayerSource).toContain('MobileCloudUploadDrawer');
    expect(createLayerSource).not.toContain('MobileBookmarkCreateDrawer');
    expect(createLayerSource).not.toContain('TodoEditorModal');
    expect(bottomNavigationSource).toContain("router.push({ name: 'bookmarkEditMg', params: { id: 'add' } })");
    expect(bottomNavigationSource).toContain("router.push({ name: 'todoCreate' })");
    expect(bottomNavigationSource).not.toContain('resolveMobileCreateTarget');
  });

  it('全局笔记始终新建到根级，模块顶部加号仍保留当前目录上下文', () => {
    const noteCreateSource = readSource('src/components/mobile/MobileFormalNoteCreateModal.vue');
    expect(noteCreateSource).toContain("router.push({ path: '/noteLibrary/add', query })");
    expect(noteCreateSource).not.toContain('parent');
    expect(noteLibrarySource).toContain('onAdd: showNewNotePicker');
    expect(noteLibrarySource).not.toContain('consumeFormalNoteCreateIntent');
  });

  it('全局上传允许选择文件夹并按入口计算默认值，模块顶部加号仍继承当前文件夹', () => {
    expect(createLayerSource).toContain('defaultUploadFolderId');
    expect(createLayerSource).toContain('uploadSelectedFiles(files, folderId)');
    expect(cloudSpaceSource).toContain('onAdd: () => openCurrentFolderUpload()');
    expect(cloudSpaceSource).not.toContain('consumeFormalFileCreateIntent');
  });
});
