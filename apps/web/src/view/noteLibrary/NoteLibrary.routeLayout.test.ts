import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteLibrary.vue'), 'utf8');
const templateSource = source.match(/^<template>\s*([\s\S]*)\s*<\/template>\s*<script/)?.[1]?.trim() || '';

describe('笔记库路由布局根节点', () => {
  it('保持 ResourcePageShell 单根结构以继承路由视图的桌面定位样式', () => {
    expect(templateSource.startsWith('<ResourcePageShell')).toBe(true);
    expect(templateSource.endsWith('</ResourcePageShell>')).toBe(true);
    expect(templateSource.match(/<ResourcePageShell\b/g)).toHaveLength(1);
  });

  it('笔记详情跳转不再使用 fixed 整页骨架遮住真实详情顶栏', () => {
    expect(templateSource).not.toContain('note-detail-navigation-loading');
    expect(source).not.toContain('paintNoteNavigationFeedback');
    expect(source).toContain('openingNoteId.value = normalizedId');
  });

  it('移动端先启动详情预取，再同步保存列表位置且不阻塞导航', () => {
    const start = source.indexOf('async function openDirectoryPage(noteId: string)');
    const end = source.indexOf('function openLibraryNote(noteOrId: any)', start);
    const openSource = source.slice(start, end);

    expect(openSource.indexOf('prefetchNoteDetail(user, normalizedId)')).toBeGreaterThan(-1);
    expect(openSource.indexOf('prefetchNoteDetail(user, normalizedId)')).toBeLessThan(
      openSource.indexOf('captureMobileReturnScroll()'),
    );
    expect(openSource.indexOf('captureMobileReturnScroll()')).toBeLessThan(
      openSource.indexOf('await openTreeDirectoryPage(normalizedId)'),
    );
    expect(openSource).not.toContain('await captureMobileReturnScroll()');
  });

  it('分页列表请求 v2 服务端预览，避免每张卡片在 WebView 主线程解析正文', () => {
    expect(source).toMatch(/pageSize:\s*RESOURCE_LIST_PAGE_SIZE,[\s\S]*?previewVersion:\s*2/u);
  });

  it('移动端后台只预热轻量详情路由，用户点击后才加载当前笔记对应的编辑器', () => {
    const warmupStart = source.indexOf('function scheduleNoteDetailWarmup(notes: any[])');
    const warmupEnd = source.indexOf('\n  watch(', warmupStart);
    const warmupSource = source.slice(warmupStart, warmupEnd);
    const openStart = source.indexOf('async function openDirectoryPage(noteId: string)');
    const openEnd = source.indexOf('function openLibraryNote(noteOrId: any)', openStart);
    const openSource = source.slice(openStart, openEnd);

    expect(warmupSource).toContain("name: 'noteDetail'");
    expect(warmupSource).not.toContain('preloadNoteEditorRuntime');
    expect(source).not.toContain('noteEditorRuntimeWarmupTimer');
    expect(openSource).toContain('preloadNoteEditorRuntime(source?.type)');
  });

  it('普通目录切换仍回到顶部，只有匹配的详情返回快照会恢复旧位置', () => {
    expect(source).toContain('if (returnScrollSnapshot) scheduleMobileReturnScrollRestore(returnScrollSnapshot, true)');
    expect(source).toContain('else if (bookmark.isMobile) scheduleMobileListScrollReset()');
    expect(source).toContain(
      'if (returnScrollSnapshot) scheduleMobileReturnScrollRestore(returnScrollSnapshot, false)',
    );
    expect(source).toContain('else scheduleMobileListScrollReset()');
  });

  it('移动目录首次打开后保持挂载，关闭抽屉后仍能派发目录选择', () => {
    expect(templateSource).toContain('v-if="bookmark.isMobile && mobileDirectoryMounted"');
    const start = source.indexOf('function openMobileDirectory()');
    const end = source.indexOf('let consumingDirectoryOpenRequest', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const openDirectorySource = source.slice(start, end);
    expect(openDirectorySource).toContain('mobileDirectoryMounted.value = true');
    expect(openDirectorySource.indexOf('mobileDirectoryMounted.value = true')).toBeLessThan(
      openDirectorySource.indexOf('mobileDirectoryOpen.value = true'),
    );
  });

  it('移动端禁用卡片固有高度占位，避免弱网返回时滚动锚点把首卡顶出视口', () => {
    expect(source).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.note-library-body > \*[\s\S]*?content-visibility:\s*visible/u,
    );
    expect(source).toMatch(/\.note-library-body > \*[\s\S]*?contain-intrinsic-size:\s*none/u);
    expect(source).toMatch(/\.note-library-body[\s\S]*?overflow-anchor:\s*none/u);
  });

  it('标签作为独立筛选入口，预览侧栏在页面与大纲之间切换', () => {
    expect(templateSource).toContain('<TagFilterSelector :all-tags="visibleNoteTags"');
    expect(templateSource).toContain('v-model:mode="librarySidebarMode"');
    expect(templateSource).toContain(':outline-enabled="desktopPreviewOpen"');
    expect(templateSource).toContain('<NoteOutlineList');
    expect(source).not.toContain('setNoteSidebarModeFromUser');
  });
});
