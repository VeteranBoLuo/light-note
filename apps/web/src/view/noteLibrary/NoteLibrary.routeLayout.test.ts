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

  it('移动目录首次打开后保持挂载，关闭抽屉后仍能派发目录选择', () => {
    expect(templateSource).toContain('v-if="bookmark.isMobile && mobileDirectoryMounted"');
    const start = source.indexOf("function openMobileDirectory(tab: 'directory' | 'tags')");
    const end = source.indexOf('let consumingDirectoryOpenRequest', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const openDirectorySource = source.slice(start, end);
    expect(openDirectorySource).toContain('mobileDirectoryMounted.value = true');
    expect(openDirectorySource.indexOf('mobileDirectoryMounted.value = true')).toBeLessThan(
      openDirectorySource.indexOf('mobileDirectoryOpen.value = true'),
    );
  });

  it('桌面侧栏和移动抽屉切换目录/标签时共用账号偏好保存逻辑', () => {
    expect(templateSource).toContain('@update:mode="setNoteSidebarModeFromUser"');
    expect(templateSource).toContain('@mode-change="setNoteSidebarModeFromUser"');
    expect(source).toContain('updatePreference({ noteSidebarMode: mode })');
  });
});
