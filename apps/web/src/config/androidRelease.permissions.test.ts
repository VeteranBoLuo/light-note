import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANDROID_SOURCE_PERMISSIONS } from '@lightnote/shared';
import { ANDROID_RELEASE } from './androidRelease';

/**
 * 当前源码清单必须与 AndroidManifest 一致；已发布 APK 清单必须继续反映线上文件本身。
 *
 * 两张清单都会进入下载页或备案材料（docs/android/p4-compliance-audit.md）。源码先移除权限、
 * 线上 APK 尚未替换时允许存在已知过渡差异，除此之外的漂移仍属于合规问题。
 */

const MANIFEST_PATH = resolve(__dirname, '../../../android/app/src/main/AndroidManifest.xml');

function manifestPermissions(): string[] {
  const xml = readFileSync(MANIFEST_PATH, 'utf-8');
  return Array.from(xml.matchAll(/<uses-permission\s+android:name="([^"]+)"/g)).map((m) => m[1]);
}

describe('Android 权限公示', () => {
  it('源码权限清单与 AndroidManifest 完全一致（含顺序无关的集合比较）', () => {
    expect([...ANDROID_SOURCE_PERMISSIONS].sort()).toEqual([...manifestPermissions()].sort());
  });

  it('已发布 APK 权限与当前源码权限完全一致', () => {
    expect([...ANDROID_RELEASE.permissions].sort()).toEqual([...ANDROID_SOURCE_PERMISSIONS].sort());
  });

  it('不含运行时敏感权限 —— 相机/存储/定位等一旦出现必须先过合规评审', () => {
    const sensitive = [
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_CONTACTS',
      'android.permission.READ_PHONE_STATE',
    ];
    expect(manifestPermissions().filter((p) => sensitive.includes(p))).toEqual([]);
  });

  it('声明了应用内更新所需的安装权限', () => {
    // 少了它「立即安装」会被系统直接拒绝，用户只能回到手动安装
    expect(ANDROID_RELEASE.permissions).toContain('android.permission.REQUEST_INSTALL_PACKAGES');
  });

  it('当前源码和已发布 APK 均不再申请通知权限', () => {
    expect(ANDROID_SOURCE_PERMISSIONS).not.toContain('android.permission.POST_NOTIFICATIONS');
    expect(ANDROID_RELEASE.permissions).not.toContain('android.permission.POST_NOTIFICATIONS');
  });
});
