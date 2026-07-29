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

  it('将旧版官网首页偏好迁移为应用工作台', () => {
    expect(getHomePagePreference({ homePage: 'landing' })).toBe('workbench');
    expect(getDesktopHomePath({ homePage: 'landing' })).toBe('/workbenches');
    expect(getAppHomePath({ homePage: 'landing' }, false)).toBe('/workbenches');
  });

  it.each([
    ['bookmark', '/home'],
    ['noteLibrary', '/noteLibrary'],
    ['cloudSpace', '/cloudSpace'],
  ] as const)('移动端支持 %s → %s', (homePage, path) => {
    expect(getMobileHomePath({ homePage })).toBe(path);
    expect(getAppHomePath({ homePage }, true)).toBe(path);
  });

  it.each(['landing', 'workbench', 'resourceCenter'] as const)('移动端将 %s 回退到书签', (homePage) => {
    expect(getMobileHomePath({ homePage })).toBe('/home');
  });

  it('移动端将缺失或异常值回退到书签', () => {
    expect(getMobileHomePath()).toBe('/home');
    expect(getMobileHomePath({ homePage: 'unknown' as HomePagePreference })).toBe('/home');
  });

  it('按模块识别移动端首页路由', () => {
    expect(isMobileHomeRoute('home', { homePage: 'bookmark' })).toBe(true);
    expect(isMobileHomeRoute('home:id', { homePage: 'bookmark' })).toBe(true);
    expect(isMobileHomeRoute('home:search', { homePage: 'bookmark' })).toBe(true);
    expect(isMobileHomeRoute('noteLibrary', { homePage: 'noteLibrary' })).toBe(true);
    expect(isMobileHomeRoute('noteDetail', { homePage: 'noteLibrary' })).toBe(false);
    expect(isMobileHomeRoute('cloudSpace', { homePage: 'cloudSpace' })).toBe(true);
    expect(isMobileHomeRoute('noteLibrary', { homePage: 'cloudSpace' })).toBe(false);
  });

  it('按手机、平板和桌面视口解析统一应用入口', () => {
    expect(getApplicationEntryPath({ homePage: 'noteLibrary' }, 390)).toBe('/noteLibrary');
    expect(getApplicationEntryPath({ homePage: 'noteLibrary' }, 820)).toBe('/home');
    expect(getApplicationEntryPath({ homePage: 'noteLibrary' }, 1440)).toBe('/noteLibrary');
    expect(getApplicationEntryPath({ homePage: 'landing' }, 1440)).toBe('/workbenches');
  });
});
