import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const release = {
  versionName: '1.0.0',
  versionCode: 10000,
  downloadPath: '/downloads/android/light-note-1.0.0.apk',
  released: true,
};
const postAndroidMessage = vi.fn(() => true);
let userAgent = '';

vi.mock('@/config/androidRelease', () => ({
  get ANDROID_RELEASE() {
    return release;
  },
  OFFICIAL_HOST: 'boluo66.top',
}));
vi.mock('@/utils/androidBridge', () => ({
  postAndroidMessage,
  isLightNoteAndroidApp: () => /\bLightNoteAndroid\//i.test(userAgent),
  getLightNoteAndroidVersion: () => {
    const matched = /\bLightNoteAndroid\/([\w.-]+)/i.exec(userAgent);
    return matched ? matched[1] : '';
  },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@/i18n', () => ({ default: { global: { t: (key: string) => key } } }));

const { compareAppVersions, resetAndroidAppUpdateForTest, useAndroidAppUpdate } = await import(
  './useAndroidAppUpdate'
);

/** 装了 1.0.0 的 App */
const APP_UA = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36 LightNoteAndroid/1.0.0';

beforeEach(() => {
  vi.clearAllMocks();
  postAndroidMessage.mockReturnValue(true);
  userAgent = APP_UA;
  release.versionName = '1.0.0';
  release.downloadPath = '/downloads/android/light-note-1.0.0.apk';
  release.released = true;
  window.localStorage.clear();
  // dismissed 是模块级共享状态，clear() 不会把它复位，用例之间必须显式重置
  resetAndroidAppUpdateForTest();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('compareAppVersions', () => {
  it('按段比较数字，不按字典序', () => {
    // 字典序下 '1.0.10' < '1.0.9'，会让新版用户被反复劝降级
    expect(compareAppVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareAppVersions('1.0.9', '1.0.10')).toBe(-1);
    expect(compareAppVersions('2.0.0', '1.9.9')).toBe(1);
  });

  it('段数不齐时缺的段当 0', () => {
    expect(compareAppVersions('1.1', '1.1.0')).toBe(0);
    expect(compareAppVersions('1.1.1', '1.1')).toBe(1);
  });

  it('预发布后缀只取数字前缀，不产生 NaN', () => {
    expect(compareAppVersions('1.0.1-beta', '1.0.0')).toBe(1);
    expect(compareAppVersions('1.0.0', '1.0.0-rc1')).toBe(0);
  });
});

describe('useAndroidAppUpdate', () => {
  it('线上版本更高时提示更新并显示红点', () => {
    release.versionName = '1.0.1';
    const update = useAndroidAppUpdate();

    expect(update.installedVersion.value).toBe('1.0.0');
    expect(update.updateAvailable.value).toBe(true);
    expect(update.showBadge.value).toBe(true);
  });

  it('版本相同时不提示', () => {
    const update = useAndroidAppUpdate();
    expect(update.updateAvailable.value).toBe(false);
    expect(update.showBadge.value).toBe(false);
  });

  it('released 为 false 时不提示 —— 那时线上还没有可下载的包', () => {
    release.versionName = '1.0.1';
    release.released = false;
    const update = useAndroidAppUpdate();
    expect(update.updateAvailable.value).toBe(false);
  });

  it('非 App 环境不提示', () => {
    release.versionName = '1.0.1';
    userAgent = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1';
    const update = useAndroidAppUpdate();
    expect(update.isAppRuntime.value).toBe(false);
    expect(update.updateAvailable.value).toBe(false);
  });

  it('取不到 UA 版本号时不提示，不把「未知」当成「落后」', () => {
    release.versionName = '1.0.1';
    userAgent = 'Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36';
    const update = useAndroidAppUpdate();
    expect(update.updateAvailable.value).toBe(false);
  });

  it('红点看过即消，但换更高版本会重新提示', () => {
    release.versionName = '1.0.1';
    const update = useAndroidAppUpdate();
    update.dismissBadge();
    expect(update.showBadge.value).toBe(false);
    expect(update.updateAvailable.value).toBe(true);

    // 再发一个版本：dismissed 记的是版本号而非布尔，所以要重新亮起
    release.versionName = '1.0.2';
    const next = useAndroidAppUpdate();
    expect(next.showBadge.value).toBe(true);
  });

  it('下载走官方域名的绝对地址，不用当前 origin', () => {
    release.versionName = '1.0.1';
    release.downloadPath = '/downloads/android/light-note-1.0.1.apk';
    const update = useAndroidAppUpdate();

    expect(update.startUpdate()).toBe(true);
    // debug 包可能加载在局域网地址上，那里没有 APK；安装包只应来自唯一正式分发域名
    expect(postAndroidMessage).toHaveBeenCalledWith({
      type: 'download',
      url: 'https://boluo66.top/downloads/android/light-note-1.0.1.apk',
      fileName: 'light-note-1.0.1.apk',
    });
  });

  it('桥不可用时返回 false，交给浏览器兜底', () => {
    release.versionName = '1.0.1';
    postAndroidMessage.mockReturnValue(false);
    const update = useAndroidAppUpdate();
    expect(update.startUpdate()).toBe(false);
  });

  it('两处调用共享同一份 dismissed —— 底栏「我的」与页面内红点必须同时消失', () => {
    release.versionName = '1.0.1';
    // 底部导航一份、个人中心一份，模拟真实的两个组件
    const bottomNav = useAndroidAppUpdate();
    const personCenter = useAndroidAppUpdate();
    expect(bottomNav.showBadge.value).toBe(true);
    expect(personCenter.showBadge.value).toBe(true);

    // 在个人中心点「下载新版本」
    personCenter.startUpdate();

    // 若 dismissedVersion 是函数内的 ref，这一条会失败：底栏红点会一直亮到页面重载
    expect(personCenter.showBadge.value).toBe(false);
    expect(bottomNav.showBadge.value).toBe(false);
    // 消掉的只是红点，入口摘要仍要显示「有新版本」
    expect(bottomNav.updateAvailable.value).toBe(true);
  });

  it('兜底地址是固定的下载页，不是带版本号的 APK 直链', () => {
    const update = useAndroidAppUpdate();
    expect(update.downloadPageUrl).toBe('https://boluo66.top/download/android');
  });
});
