import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMobileResourceEntryPath, useMobileNavigationState } from '@/composables/useMobileNavigationState';
import {
  getRuntimeApplicationEntryPath,
  getRuntimeApplicationHomePath,
  getRuntimeGuestEntryPath,
  getRuntimePostRegistrationPath,
} from './appEntry';

const mobileNavigation = useMobileNavigationState();

beforeEach(() => {
  mobileNavigation.setLastMobileResourcePath('/home');
});

afterEach(() => {
  mobileNavigation.setLastMobileResourcePath('/home');
});

describe('应用入口路径策略', () => {
  // 移动端首页固定为「今日」：手机浏览器、APK 和移动 PWA 的所有默认落点都一致，
  // 不再受账号首页偏好或「上次打开的资料页签」影响。
  it('移动布局与 APK 的应用落点固定为今日', () => {
    mobileNavigation.setLastMobileResourcePath('/noteLibrary');

    expect(getRuntimeApplicationHomePath({ homePage: 'bookmark' }, true, { runtime: 'browser' })).toBe('/workbenches');
    expect(getRuntimeApplicationHomePath({ homePage: 'cloudSpace' }, false, { runtime: 'android-app' })).toBe(
      '/workbenches',
    );
    expect(getRuntimeApplicationHomePath({ homePage: 'bookmark' }, true, { runtime: 'pwa-standalone' })).toBe(
      '/workbenches',
    );
  });

  it('普通桌面浏览器和桌面 PWA 按账号应用首页偏好进入', () => {
    expect(getRuntimeApplicationHomePath({ homePage: 'cloudSpace' }, false, { runtime: 'browser' })).toBe(
      '/cloudSpace',
    );
    expect(getRuntimeApplicationHomePath({ homePage: 'landing' }, false, { runtime: 'browser' })).toBe('/home');
    expect(getRuntimeApplicationHomePath({ homePage: 'workbench' }, false, { runtime: 'pwa-standalone' })).toBe(
      '/workbenches',
    );
  });

  it('按运行环境与视口解析 /app，且不再返回官网', () => {
    mobileNavigation.setLastMobileResourcePath('/noteLibrary');

    // 移动视口与 APK 一律进今日，不恢复最近资料页签
    expect(getRuntimeApplicationEntryPath(undefined, 390, { runtime: 'browser' })).toBe('/workbenches');
    expect(getRuntimeApplicationEntryPath({ homePage: 'bookmark' }, 390, { runtime: 'pwa-standalone' })).toBe(
      '/workbenches',
    );
    expect(getRuntimeApplicationEntryPath({ homePage: 'landing' }, 1440, { runtime: 'android-app' })).toBe(
      '/workbenches',
    );
    // 平板保留书签首屏，桌面按偏好
    expect(getRuntimeApplicationEntryPath({ homePage: 'noteLibrary' }, 820, { runtime: 'browser' })).toBe('/home');
    expect(getRuntimeApplicationEntryPath(undefined, 1440, { runtime: 'browser' })).toBe('/home');
    expect(getRuntimeApplicationEntryPath({ homePage: 'cloudSpace' }, 1440, { runtime: 'browser' })).toBe(
      '/cloudSpace',
    );
    expect(getRuntimeApplicationEntryPath({ homePage: 'workbench' }, 1440, { runtime: 'pwa-standalone' })).toBe(
      '/workbenches',
    );
  });

  it('注册成功后移动端进今日、桌面端进书签', () => {
    mobileNavigation.setLastMobileResourcePath('/noteLibrary');

    expect(getRuntimePostRegistrationPath(true, { runtime: 'browser' })).toBe('/workbenches');
    expect(getRuntimePostRegistrationPath(false, { runtime: 'android-app' })).toBe('/workbenches');
    // 桌面端不继承最近资料页签，固定书签首页
    expect(getRuntimePostRegistrationPath(false, { runtime: 'browser' })).toBe('/home');
  });

  it('桌面浏览器/PWA 退出回官网，APK/移动 PWA 留在今日', () => {
    mobileNavigation.setLastMobileResourcePath('/cloudSpace');

    expect(getRuntimeGuestEntryPath(undefined, { runtime: 'browser' })).toBe('/');
    expect(getRuntimeGuestEntryPath(undefined, { runtime: 'android-app' })).toBe('/workbenches');
    expect(
      getRuntimeGuestEntryPath(undefined, {
        runtime: 'pwa-standalone',
        isMobileLayout: true,
      }),
    ).toBe('/workbenches');
    expect(
      getRuntimeGuestEntryPath(
        { homePage: 'workbench' },
        {
          runtime: 'pwa-standalone',
          isMobileLayout: false,
        },
      ),
    ).toBe('/');
  });

  // 底部「资料」的会话内记忆：与首页落点无关，且新会话回到书签
  it('资料入口在会话内记住上次页签，默认书签', () => {
    expect(getMobileResourceEntryPath()).toBe('/home');
    mobileNavigation.setLastMobileResourcePath('/cloudSpace');
    expect(getMobileResourceEntryPath()).toBe('/cloudSpace');
  });
});
