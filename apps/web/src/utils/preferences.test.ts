import { describe, expect, it } from 'vitest';
import {
  getApplicationEntryPath,
  getAppHomePath,
  getDesktopHomePath,
  getHomePagePreference,
  getMobileHomePath,
  isMobileHomeRoute,
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
