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

/** 网站 ICP 备案号,与上面的 App 备案号并列展示时用。 */
export const WEBSITE_ICP_NUMBER = '蜀ICP备2026017699号-1';

/** 工信部备案查询入口。 */
export const MIIT_QUERY_URL = 'https://beian.miit.gov.cn';

/** 唯一正式分发域名。下载页的安全提示要明确只认这个域名。 */
export const OFFICIAL_HOST = 'boluo66.top';

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
  permissions: string[];
  /**
   * APK 是否已经真的躺在线上可下载路径里。
   * false 时下载按钮显示「准备中」且不可点,用于「已备案未发布」这一过渡状态,
   * 避免按钮指向一个还没上传或只上传了一半的文件。
   */
  released: boolean;
}

export const ANDROID_RELEASE: AndroidReleaseInfo = {
  versionName: '1.0.1',
  versionCode: 10001,
  packageName: 'top.boluo66.lightnote',
  releaseDate: '2026-08-06',
  fileSizeBytes: 1771377,
  sha256: '7e070054237c82c49d3d96f9b4e7ee88ce39b23e68b58ff5cebce30d9e053f13',
  certificateSha256: '23:D3:65:AA:C9:33:A3:8D:71:07:0E:0C:2B:DD:C0:CD:B7:E1:7B:41:67:7F:FC:5E:45:2C:96:D8:9A:1C:77:B4',
  downloadPath: '/downloads/android/light-note-1.0.1.apk',
  minAndroidVersion: '8.0',
  permissions: [
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    // 应用内更新:把已下载的轻笺安装包交给系统安装器。仅限来自本域名的自身安装包,
    // 是否安装由系统确认页决定,不具备静默安装能力。与 AndroidManifest 必须一致。
    'android.permission.REQUEST_INSTALL_PACKAGES',
  ],
  released: true,
};

/** 把字节数格式化成 MB,下载页展示文件大小用。 */
export function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
