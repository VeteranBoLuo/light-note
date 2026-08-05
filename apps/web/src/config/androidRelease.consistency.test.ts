import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANDROID_RELEASE, ANDROID_LATEST_APK_PATH } from './androidRelease';

/**
 * 发布元数据与真实安装包的一致性。
 *
 * 发版要人工同步四处：build.gradle.kts 的版本号、public 下的 APK 文件、
 * shared 里的 ANDROID_RELEASE（版本/大小/SHA-256/下载路径）、以及下载页展示。
 * 漏改任何一处都不会报错，结果是对外公示的校验值与用户实际下到的包不符 ——
 * 那正是「下载前请核对 SHA-256」这句话失去意义的方式。
 *
 * APK 按约定不入库（.gitignore:51），所以文件缺失时跳过而不是失败：
 * 这些断言的价值在本地发版那一刻，不在 CI。
 */

const APK_PATH = resolve(__dirname, '../../public', ANDROID_RELEASE.downloadPath.replace(/^\//, ''));
const GRADLE_PATH = resolve(__dirname, '../../../android/app/build.gradle.kts');
const apkExists = existsSync(APK_PATH);

describe('Android 发布元数据一致性', () => {
  it('downloadPath 里的版本号与 versionName 一致', () => {
    expect(ANDROID_RELEASE.downloadPath).toContain(ANDROID_RELEASE.versionName);
    expect(ANDROID_RELEASE.downloadPath.endsWith('.apk')).toBe(true);
  });

  it('build.gradle.kts 的 versionName / versionCode 与公示一致', () => {
    const gradle = readFileSync(GRADLE_PATH, 'utf-8');
    expect(gradle).toContain(`versionName = "${ANDROID_RELEASE.versionName}"`);
    expect(gradle).toContain(`versionCode = ${ANDROID_RELEASE.versionCode}`);
  });

  it('永久地址是固定的、不含版本号', () => {
    // 它一旦带上版本号就失去了存在意义 —— 发到群里的链接又会被钉死在某一版
    expect(ANDROID_LATEST_APK_PATH).not.toContain(ANDROID_RELEASE.versionName);
    expect(ANDROID_LATEST_APK_PATH).toBe('/api/app/android/latest.apk');
  });

  it.skipIf(!apkExists)('公示的文件大小与真实安装包一致', () => {
    expect(statSync(APK_PATH).size).toBe(ANDROID_RELEASE.fileSizeBytes);
  });

  it.skipIf(!apkExists)('公示的 SHA-256 与真实安装包一致', () => {
    const digest = createHash('sha256').update(readFileSync(APK_PATH)).digest('hex');
    expect(digest).toBe(ANDROID_RELEASE.sha256);
  });

  it('APK 缺失时给出可见提示，而不是让上面两条静默跳过', () => {
    if (!apkExists) {
      console.warn(
        `[发布一致性] 未找到 ${ANDROID_RELEASE.downloadPath}，已跳过大小与 SHA-256 校验。` +
          '安装包按约定不入库，发版前请在本地跑一次本测试。',
      );
    }
    expect(true).toBe(true);
  });
});
