/**
 * 轻笺 Android 正式发布记录。
 *
 * 下载页与设置页的版本、大小、哈希、备案号全部只从这里取,保证页面上的每个数字都来自同一次
 * 发布,不会出现"按钮指向新包、哈希还是旧包"。发新版时同时更新本文件与 public/downloads/android/
 * 下的 APK,两者必须来自同一次 Release 构建。
 *
 * 证据包(仓库外):~/Library/Application Support/Light Note/Android Releases/
 */

/** 工信部 App 备案号。与网站 ICP 备案号不是同一个,两者不能互相冒充。 */
export const APP_FILING_NUMBER = '蜀ICP备2026017699号-3A';

/** 网站备案信息由站点合规配置统一维护；这里保留转出以兼容下载页既有引用。 */
export { MIIT_QUERY_URL, WEBSITE_FILING_NAME, WEBSITE_ICP_NUMBER } from './siteCompliance.ts';

/** 唯一正式分发域名。下载页的安全提示要明确只认这个域名。后端拼绝对地址也要用它，故同在 shared。 */
export { OFFICIAL_HOST } from '@lightnote/shared';

/**
 * 发布记录本体已移到 @lightnote/shared：后端要用同一份数据把「永久下载地址」
 * （ANDROID_LATEST_APK_PATH）302 到当前版本的实际文件，两边各存一份版本号必然漂移。
 * 这里只做转出，所有 `@/config/androidRelease` 的引用方无需改动。
 */
export { ANDROID_RELEASE, ANDROID_LATEST_APK_PATH } from '@lightnote/shared';

export interface AndroidReleaseInfo {
  /** 用户可见版本号 */
  versionName: string;
  /** 内部版本号,每次发布必须递增 */
  versionCode: number;
  /** 正式包名,首次发布后不可更换 */
  packageName: string;
  /** 发布日期(本地时区,YYYY-MM-DD) */
  releaseDate: string;
  /** APK 字节数,用于展示文件大小 */
  fileSizeBytes: number;
  /** 线上 APK 的 SHA-256,必须取自最终上线文件 */
  sha256: string;
  /** 正式签名证书 SHA-256 指纹 */
  certificateSha256: string;
  /** 下载路径(带版本号的不可变地址,不用会被覆盖的匿名文件名) */
  downloadPath: string;
  /** 最低系统版本 */
  minAndroidVersion: string;
  /** 原生权限清单 */
  permissions: readonly string[];
  /**
   * APK 是否已经真的躺在线上可下载路径里。
   * false 时下载按钮显示「准备中」且不可点,用于「已备案未发布」这一过渡状态,
   * 避免按钮指向一个还没上传或只上传了一半的文件。
   */
  released: boolean;
}

/** 把字节数格式化成 MB,下载页展示文件大小用。 */
export function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
