import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANDROID_SOURCE_PERMISSIONS } from '@lightnote/shared';
import { ANDROID_RELEASE } from './androidRelease';

/**
 * 对外公示的权限清单必须与 AndroidManifest 一致。
 *
 * 这张清单会渲染在下载页上、也是备案材料的一部分（docs/android/p4-compliance-audit.md）。
 * 它和 manifest 是两个文件、靠人同步，漂移了不会有任何报错：表现是"公示少写一项"或
 * "公示多写一项"，属于合规问题而不是功能问题，所以只能靠断言锁住。
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

  it('当前发布包与源码均声明 Android 13+ 通知权限', () => {
    expect(ANDROID_SOURCE_PERMISSIONS).toContain('android.permission.POST_NOTIFICATIONS');
    expect(ANDROID_RELEASE.permissions).toContain('android.permission.POST_NOTIFICATIONS');
  });
});
