/**
 * 轻笺 Android App 的应用内更新检查。
 *
 * 为什么整套检测都在前端、不走后端接口:
 * - 用户装的版本从 UA 里取(`LightNoteAndroid/x.y.z`),最新发布版本就是前端常量
 *   `ANDROID_RELEASE.versionName`,两边都在手上,比较是纯本地计算;
 * - APK 内不注册 PWA Service Worker(见 apps/android/README.md),每次冷启动都会拉线上最新
 *   前端,所以那个常量天然是最新的。发新版只需改 androidRelease.ts + 部署前端,所有旧包
 *   下次打开就能看到红点,不需要用户先升级到某个"支持更新检查"的版本。
 *
 * 这一点决定了实现形状:更新提示的服务对象恰恰是旧版本用户,任何依赖"新增原生桥能力"的
 * 方案都会陷入鸡生蛋 —— 第一批装机永远收不到提示。所以这里只用 UA + 已有的 download 桥。
 */

import { computed, ref } from 'vue';
import { ANDROID_RELEASE, OFFICIAL_HOST } from '@/config/androidRelease';
import { getLightNoteAndroidVersion, isLightNoteAndroidApp, postAndroidMessage } from '@/utils/androidBridge';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import i18n from '@/i18n';

/** 记住"这个版本的红点已经看过了"。换成更高版本会重新提示。 */
const DISMISSED_STORAGE_KEY = 'light-note:android-update-dismissed';

/**
 * 语义化比较两个 versionName，返回 >0 / 0 / <0。
 *
 * 不能按字符串比:`'1.0.10' < '1.0.9'` 在字典序下成立,会让 1.0.10 的用户被反复提示
 * 降级到 1.0.9。按段取整数比较,段数不齐时缺的段当 0（`1.1` 与 `1.1.0` 等价）。
 * 预发布后缀（`1.0.0-beta`）只取前面的数字部分,够用且不会把 NaN 带进比较。
 */
export function compareAppVersions(left: string, right: string): number {
  const parse = (value: string) =>
    String(value || '')
      .split('.')
      .map((segment) => {
        const digits = /^\d+/.exec(segment.trim());
        return digits ? Number(digits[0]) : 0;
      });
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function readDismissedVersion(): string {
  try {
    return window.localStorage.getItem(DISMISSED_STORAGE_KEY) || '';
  } catch {
    // 隐私模式/存储被禁时读不到,退化成"每次都提示"而不是报错
    return '';
  }
}

/**
 * 模块级共享状态,不能放进 useAndroidAppUpdate() 里。
 *
 * 红点同时挂在底部导航的「我的」和个人中心的「版本更新」两处;若每次调用各建一个 ref,
 * 在个人中心消掉红点只会更新它自己那份,底栏那颗要等页面重载才消失 —— 表现为"点了更新
 * 底下红点还在"。共享同一个 ref 才能让两处联动。
 */
const dismissedVersion = ref(readDismissedVersion());

/** 仅测试用:模块级状态不会随 localStorage.clear() 复位,用例之间必须显式重置。 */
export function resetAndroidAppUpdateForTest() {
  dismissedVersion.value = readDismissedVersion();
}

export function useAndroidAppUpdate() {
  /** 只在轻笺 App 内出现:手机浏览器和桌面端不该看到"更新 App"。 */
  const isAppRuntime = computed(() => isLightNoteAndroidApp());
  const installedVersion = computed(() => getLightNoteAndroidVersion());
  const latestVersion = computed(() => ANDROID_RELEASE.versionName);

  /**
   * 有没有新版本。
   * `released` 为 false 是"已备案未发布"的过渡态 —— 那时线上还没有可下载的包，提示了也拿不到。
   * 取不到 UA 版本号（老版本 UA 里没写、或非 App 环境）时不提示，避免把"未知"当成"落后"。
   */
  const updateAvailable = computed(() => {
    if (!isAppRuntime.value || !ANDROID_RELEASE.released) return false;
    if (!installedVersion.value) return false;
    return compareAppVersions(latestVersion.value, installedVersion.value) > 0;
  });

  /** 红点：有新版且用户还没看过这个版本的提示。 */
  const showBadge = computed(() => updateAvailable.value && dismissedVersion.value !== latestVersion.value);

  /**
   * APK 与下载页都固定用官方域名拼，不用 window.location.origin：
   * debug 包可能加载在局域网地址上，那里没有 APK 文件；而且安装包只应来自唯一正式分发域名
   * （下载页的安全提示就是这么写的）。下载页路径是固定的，APK 文件名带版本号会变。
   */
  const apkUrl = computed(() => `https://${OFFICIAL_HOST}${ANDROID_RELEASE.downloadPath}`);
  const downloadPageUrl = `https://${OFFICIAL_HOST}/download/android`;
  const apkFileName = computed(() => ANDROID_RELEASE.downloadPath.split('/').pop() || 'light-note.apk');

  /** 看过就不再红。存的是版本号而不是布尔，下个版本才能重新提示。 */
  function dismissBadge() {
    dismissedVersion.value = latestVersion.value;
    try {
      window.localStorage.setItem(DISMISSED_STORAGE_KEY, latestVersion.value);
    } catch {
      // 存不下只影响红点会再出现一次，不影响更新本身
    }
  }

  /**
   * 交给系统 DownloadManager 下载新包。
   *
   * 落盘之后的安装是三层降级：通知栏点击 → 文件管理器点击 → 复制地址去手机浏览器下载。
   * 第一层可能被系统拦（Android 8+ 由 App 唤起安装器需要 REQUEST_INSTALL_PACKAGES，
   * 而轻笺没有声明这个权限），第二层来源是系统文件管理器、第三层来源是浏览器，都自带安装能力。
   * 所以提示文案必须同时给出前两层，不能只说"去通知栏点"。
   */
  function startUpdate(): boolean {
    const delivered = postAndroidMessage({
      type: 'download',
      url: apkUrl.value,
      fileName: apkFileName.value,
    });
    if (delivered) {
      dismissBadge();
      message.success(i18n.global.t('appUpdate.downloadStarted'));
      return true;
    }
    // 桥不可用（极旧的 App 或 WebView 异常）：只剩浏览器这条路
    message.warning(i18n.global.t('appUpdate.bridgeUnavailable'));
    return false;
  }

  /** 兜底：把下载页地址交给用户，自己在手机浏览器打开 —— 浏览器自带安装权限，一定能装。 */
  async function copyDownloadPageUrl(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(downloadPageUrl);
      message.success(i18n.global.t('appUpdate.pageUrlCopied'));
      return true;
    } catch (error) {
      console.error('复制下载页地址失败:', error);
      message.error(i18n.global.t('appUpdate.pageUrlCopyFailed'));
      return false;
    }
  }

  return {
    isAppRuntime,
    installedVersion,
    latestVersion,
    updateAvailable,
    showBadge,
    apkUrl,
    downloadPageUrl,
    startUpdate,
    dismissBadge,
    copyDownloadPageUrl,
  };
}
