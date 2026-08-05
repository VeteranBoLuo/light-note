import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const release = {
  versionName: '1.0.0',
  versionCode: 10000,
  downloadPath: '/downloads/android/light-note-1.0.0.apk',
  released: true,
};
const postAndroidMessage = vi.fn(() => true);
const installApkViaAndroid = vi.fn();
/** 原生下载进度的订阅者，用来手工投递「下载完成」事件 */
const progressListeners: Array<(p: unknown) => void> = [];
let userAgent = '';

function emitDownloadProgress(payload: Record<string, unknown>) {
  progressListeners.forEach((listener) => listener(payload));
}

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
  installApkViaAndroid,
  onAndroidDownloadProgress: (listener: (p: unknown) => void) => {
    progressListeners.push(listener);
    return () => {};
  },
}));
const messageMock = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({ default: messageMock }));
const alertMock = vi.fn();
vi.mock('@/components/base/BasicComponents/BModal/Alert.ts', () => ({ default: { alert: alertMock } }));
const copyTextToClipboard = vi.fn();
vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard }));
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
  progressListeners.length = 0;
  installApkViaAndroid.mockResolvedValue({ ok: true });
  // dismissed 与「已挂上完成监听」都是模块级共享状态，clear() 不会复位，用例之间必须显式重置
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

  it('下载完成后弹「立即安装」，确认即请求原生拉起安装器', async () => {
    release.versionName = '1.0.1';
    release.downloadPath = '/downloads/android/light-note-1.0.1.apk';
    const update = useAndroidAppUpdate();
    update.startUpdate();

    emitDownloadProgress({ id: '42', fileName: 'light-note-1.0.1.apk', status: 'success', percent: 100 });
    expect(alertMock).toHaveBeenCalledTimes(1);

    await alertMock.mock.calls[0][0].onOk();
    expect(installApkViaAndroid).toHaveBeenCalledWith('42');
  });

  it('只认自己那个更新包，别的下载完成不弹安装', () => {
    release.versionName = '1.0.1';
    release.downloadPath = '/downloads/android/light-note-1.0.1.apk';
    useAndroidAppUpdate().startUpdate();

    // 用户可能同时在下导出件或云空间文件
    emitDownloadProgress({ id: '7', fileName: '周报.pdf', status: 'success', percent: 100 });
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('下载中途的进度事件不弹安装，只有 success 才弹', () => {
    release.versionName = '1.0.1';
    release.downloadPath = '/downloads/android/light-note-1.0.1.apk';
    useAndroidAppUpdate().startUpdate();

    emitDownloadProgress({ id: '42', fileName: 'light-note-1.0.1.apk', status: 'running', percent: 40 });
    emitDownloadProgress({ id: '42', fileName: 'light-note-1.0.1.apk', status: 'failed', percent: -1 });
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('未授权安装时提示去系统设置开权限，而不是笼统失败', async () => {
    release.versionName = '1.0.1';
    release.downloadPath = '/downloads/android/light-note-1.0.1.apk';
    installApkViaAndroid.mockResolvedValue({ ok: false, reason: 'need_permission' });
    useAndroidAppUpdate().startUpdate();

    emitDownloadProgress({ id: '42', fileName: 'light-note-1.0.1.apk', status: 'success', percent: 100 });
    await alertMock.mock.calls[0][0].onOk();

    expect(messageMock.warning).toHaveBeenCalledWith('appUpdate.installNeedPermission');
  });

  it('旧版 App 没有安装通道时退回手动安装引导', async () => {
    release.versionName = '1.0.1';
    release.downloadPath = '/downloads/android/light-note-1.0.1.apk';
    installApkViaAndroid.mockResolvedValue({ ok: false, reason: 'unsupported' });
    useAndroidAppUpdate().startUpdate();

    emitDownloadProgress({ id: '42', fileName: 'light-note-1.0.1.apk', status: 'success', percent: 100 });
    await alertMock.mock.calls[0][0].onOk();

    expect(messageMock.warning).toHaveBeenCalledWith('appUpdate.installFallbackManual');
  });

  it('复制成功时只给一句轻提示', async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const update = useAndroidAppUpdate();

    await expect(update.copyDownloadPageUrl()).resolves.toBe(true);
    expect(copyTextToClipboard).toHaveBeenCalledWith('https://boluo66.top/download/android');
    expect(messageMock.success).toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('复制失败时把完整地址留在弹框里 —— 这是第三层兜底，没有下一层了', async () => {
    // 鸿蒙「卓易通」实测：Clipboard API 与 execCommand 都不可用
    copyTextToClipboard.mockResolvedValue(false);
    const update = useAndroidAppUpdate();

    await expect(update.copyDownloadPageUrl()).resolves.toBe(false);
    // 一闪而过的 message 记不住也来不及抄，必须是能停留、能长按选中的弹框
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(String(alertMock.mock.calls[0][0].content)).toContain('https://boluo66.top/download/android');
  });
});
