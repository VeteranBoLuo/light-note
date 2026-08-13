import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTE_VIEW_MODE,
  getApplicationEntryPath,
  getAppHomePath,
  getDesktopHomePath,
  getHomePagePreference,
  getMobileHomePath,
  isMobileHomeRoute,
  shouldOpenNoteDirectly,
  type HomePagePreference,
} from './preferences';

describe('默认首页解析', () => {
  const desktopCases: Array<[HomePagePreference, string]> = [
    ['workbench', '/workbenches'],
    ['resourceCenter', '/search'],
    ['bookmark', '/home'],
    ['noteLibrary', '/noteLibrary'],
    ['cloudSpace', '/cloudSpace'],
  ];

  it.each(desktopCases)('桌面端保持 %s → %s', (homePage, path) => {
    expect(getDesktopHomePath({ homePage })).toBe(path);
    expect(getAppHomePath({ homePage }, false)).toBe(path);
  });

  it('缺失偏好和历史官网偏好按端迁移：桌面回书签、移动回今日', () => {
    expect(getHomePagePreference()).toBe('bookmark');
    expect(getHomePagePreference({ homePage: 'landing' })).toBe('bookmark');
    expect(getDesktopHomePath({ homePage: 'landing' })).toBe('/home');
    expect(getAppHomePath({ homePage: 'landing' }, false)).toBe('/home');
    // 移动端历史 landing 值回退到移动默认首页「今日」，桌面端仍回退书签
    expect(getAppHomePath({ homePage: 'landing' }, true)).toBe('/workbenches');
  });

  it.each([
    // workbench 在移动端渲染「今日」，已是底部一级入口，因此可以作为默认首页
    ['workbench', '/workbenches'],
    ['bookmark', '/home'],
    ['noteLibrary', '/noteLibrary'],
    ['cloudSpace', '/cloudSpace'],
  ] as const)('移动端支持 %s → %s', (homePage, path) => {
    expect(getMobileHomePath({ homePage })).toBe(path);
    expect(getAppHomePath({ homePage }, true)).toBe(path);
  });

  // 资源中心在移动端是二级页面，不能作为默认首页；landing 是历史值。
  // 两者都回退到移动端默认首页「今日」。
  it.each(['landing', 'resourceCenter'] as const)('移动端将 %s 回退到今日', (homePage) => {
    expect(getMobileHomePath({ homePage })).toBe('/workbenches');
  });

  it('移动端将缺失或异常值回退到今日', () => {
    expect(getMobileHomePath()).toBe('/workbenches');
    expect(getMobileHomePath({ homePage: 'unknown' as HomePagePreference })).toBe('/workbenches');
  });

  it('按模块识别移动端首页路由', () => {
    expect(isMobileHomeRoute('workbenches', { homePage: 'workbench' })).toBe(true);
    expect(isMobileHomeRoute('home', { homePage: 'workbench' })).toBe(false);
    expect(isMobileHomeRoute('home', { homePage: 'bookmark' })).toBe(true);
    expect(isMobileHomeRoute('home:id', { homePage: 'bookmark' })).toBe(true);
    expect(isMobileHomeRoute('home:search', { homePage: 'bookmark' })).toBe(true);
    expect(isMobileHomeRoute('noteLibrary', { homePage: 'noteLibrary' })).toBe(true);
    expect(isMobileHomeRoute('noteDetail', { homePage: 'noteLibrary' })).toBe(false);
    expect(isMobileHomeRoute('cloudSpace', { homePage: 'cloudSpace' })).toBe(true);
    expect(isMobileHomeRoute('noteLibrary', { homePage: 'cloudSpace' })).toBe(false);
  });

  it('按手机、平板和桌面视口解析统一应用入口', () => {
    expect(getApplicationEntryPath(undefined, 390)).toBe('/workbenches');
    expect(getApplicationEntryPath({ homePage: 'landing' }, 1440)).toBe('/home');
    expect(getApplicationEntryPath({ homePage: 'noteLibrary' }, 390)).toBe('/noteLibrary');
    expect(getApplicationEntryPath({ homePage: 'noteLibrary' }, 820)).toBe('/home');
    expect(getApplicationEntryPath({ homePage: 'noteLibrary' }, 1440)).toBe('/noteLibrary');
  });
});

describe('DEFAULT_NOTE_VIEW_MODE', () => {
  it('与后端建号写入的默认值一致', () => {
    // 这两处默认值曾经相反：后端写 'card'，前端在三个文件里各自兜底 'list'，
    // 结果「偏好里没有 noteViewMode」的账号(老账号、游客)拿到的是列表视图。
    // 直接读后端源码断言，避免以后有人只改一边。
    const here = dirname(fileURLToPath(import.meta.url));
    const backend = readFileSync(resolve(here, '../../../server/router_handle/userHandle.js'), 'utf8');
    const defaults = [...backend.matchAll(/noteViewMode:\s*'(\w+)'/g)].map((match) => match[1]);
    expect(defaults.length).toBeGreaterThan(0);
    for (const value of defaults) {
      expect(value).toBe(DEFAULT_NOTE_VIEW_MODE);
    }
  });

  it('前端不再散落字面量兜底，统一引用常量', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of ['../App.vue', '../components/login/LoginPage.vue', '../components/login/RegisterPage.vue']) {
      const source = readFileSync(resolve(here, file), 'utf8');
      const line = source.split('\n').find((text) => text.includes('noteViewMode ='));
      expect(line, `${file} 找不到 noteViewMode 赋值`).toBeTruthy();
      expect(line).toContain('DEFAULT_NOTE_VIEW_MODE');
    }
  });
});

describe('笔记默认打开方式', () => {
  it('PC 缺失偏好或关闭开关时先预览，只有明确开启才直接编辑', () => {
    expect(shouldOpenNoteDirectly(undefined, false)).toBe(false);
    expect(shouldOpenNoteDirectly({}, false)).toBe(false);
    expect(shouldOpenNoteDirectly({ noteDirectEdit: false }, false)).toBe(false);
    expect(shouldOpenNoteDirectly({ noteDirectEdit: true }, false)).toBe(true);
  });

  it('移动端始终直接编辑，不受 PC 偏好影响', () => {
    expect(shouldOpenNoteDirectly(undefined, true)).toBe(true);
    expect(shouldOpenNoteDirectly({ noteDirectEdit: false }, true)).toBe(true);
  });

  it('设置项仅在 PC 展示，笔记库统一通过偏好裁决打开方式', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const settings = readFileSync(resolve(here, '../view/settings/Settings.vue'), 'utf8');
    const noteLibrary = readFileSync(resolve(here, '../view/noteLibrary/NoteLibrary.vue'), 'utf8');

    expect(settings).toMatch(
      /<div v-if="!bookmark\.isMobile" class="field">[\s\S]*?t\('settings\.noteDirectEdit'\)[\s\S]*?set\('noteDirectEdit', \$event\)/u,
    );
    expect(settings).toContain(':checked="user.preferences.noteDirectEdit === true"');
    expect(settings).toContain("@change=\"set('noteDirectEdit', $event)\"");
    expect(noteLibrary).toContain('shouldOpenNoteDirectly(user.preferences, bookmark.isMobile)');
    expect(noteLibrary).toContain('return openDirectoryPage(noteId);');
  });
});
