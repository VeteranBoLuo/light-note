import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMobileNavigationState } from '@/composables/useMobileNavigationState';
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
  it('手机浏览器、APK 和移动 PWA 都恢复最近访问的资料模块', () => {
    mobileNavigation.setLastMobileResourcePath('/noteLibrary');

    expect(getRuntimeApplicationHomePath({ homePage: 'bookmark' }, true, { runtime: 'browser' })).toBe('/noteLibrary');
    expect(getRuntimeApplicationHomePath({ homePage: 'workbench' }, false, { runtime: 'android-app' })).toBe(
      '/noteLibrary',
    );
    expect(getRuntimeApplicationHomePath({ homePage: 'workbench' }, true, { runtime: 'pwa-standalone' })).toBe(
      '/noteLibrary',
    );
  });

  it('普通桌面浏览器和桌面 PWA 按账号应用首页偏好进入', () => {
    expect(getRuntimeApplicationHomePath({ homePage: 'cloudSpace' }, false, { runtime: 'browser' })).toBe(
      '/cloudSpace',
    );
    expect(getRuntimeApplicationHomePath({ homePage: 'landing' }, false, { runtime: 'browser' })).toBe('/workbenches');
    expect(getRuntimeApplicationHomePath({ homePage: 'workbench' }, false, { runtime: 'pwa-standalone' })).toBe(
      '/workbenches',
    );
  });

  it('按运行环境与视口解析 /app，且不再返回官网', () => {
    mobileNavigation.setLastMobileResourcePath('/noteLibrary');

    expect(getRuntimeApplicationEntryPath(undefined, 390, { runtime: 'browser' })).toBe('/noteLibrary');
    expect(getRuntimeApplicationEntryPath({ homePage: 'noteLibrary' }, 820, { runtime: 'browser' })).toBe('/home');
    expect(getRuntimeApplicationEntryPath({ homePage: 'cloudSpace' }, 1440, { runtime: 'browser' })).toBe(
      '/cloudSpace',
    );
    expect(getRuntimeApplicationEntryPath({ homePage: 'workbench' }, 1440, { runtime: 'pwa-standalone' })).toBe(
      '/workbenches',
    );
    expect(getRuntimeApplicationEntryPath({ homePage: 'workbench' }, 390, { runtime: 'pwa-standalone' })).toBe(
      '/noteLibrary',
    );
    expect(getRuntimeApplicationEntryPath({ homePage: 'landing' }, 1440, { runtime: 'android-app' })).toBe(
      '/noteLibrary',
    );
  });

  it('注册成功后所有运行环境都固定进入书签 /home', () => {
    mobileNavigation.setLastMobileResourcePath('/noteLibrary');

    expect(getRuntimePostRegistrationPath()).toBe('/home');
  });

  it('桌面浏览器/PWA 退出回官网，APK/移动 PWA 留在资料区', () => {
    mobileNavigation.setLastMobileResourcePath('/cloudSpace');

    expect(getRuntimeGuestEntryPath(undefined, { runtime: 'browser' })).toBe('/');
    expect(getRuntimeGuestEntryPath(undefined, { runtime: 'android-app' })).toBe('/cloudSpace');
    expect(
      getRuntimeGuestEntryPath(undefined, {
        runtime: 'pwa-standalone',
        isMobileLayout: true,
      }),
    ).toBe('/cloudSpace');
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
});
