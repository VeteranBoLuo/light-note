import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  DEFAULT_UPLOAD_DIR,
  getStoredBookmarkIconFileName,
  getUploadStaticDirectories,
  resolveBookmarkIconUploadDir,
  resolveStoredBookmarkIcon,
} from './bookmarkIconStorage.js';

describe('bookmarkIconStorage', () => {
  it('未配置时沿用线上 uploads 目录且不重复挂载', () => {
    expect(resolveBookmarkIconUploadDir({})).toBe(path.resolve(DEFAULT_UPLOAD_DIR));
    expect(getUploadStaticDirectories({})).toEqual([path.resolve(DEFAULT_UPLOAD_DIR)]);
  });

  it('本地预览优先挂载自定义图标目录，并保留既有上传目录作为回退', () => {
    const env = { BOOKMARK_ICON_UPLOAD_DIR: '/tmp/light-note-bookmark-icons' };

    expect(resolveBookmarkIconUploadDir(env)).toBe('/tmp/light-note-bookmark-icons');
    expect(getUploadStaticDirectories(env)).toEqual([
      '/tmp/light-note-bookmark-icons',
      path.resolve(DEFAULT_UPLOAD_DIR),
    ]);
  });

  it('识别新版共享图标和旧版书签私有图标', () => {
    const sharedFileName = `bookmark-icon-${'a'.repeat(64)}.png`;
    expect(getStoredBookmarkIconFileName(`/uploads/${sharedFileName}`, 'bookmark-1')).toBe(sharedFileName);
    expect(
      getStoredBookmarkIconFileName('https://boluo66.top/uploads/bookmark-bookmark-1-123456abcdef.ico', 'bookmark-1'),
    ).toBe('bookmark-bookmark-1-123456abcdef.ico');

    expect(
      resolveStoredBookmarkIcon(`/uploads/${sharedFileName}`, 'bookmark-1', {
        BOOKMARK_ICON_UPLOAD_DIR: '/tmp/light-note-icons',
      }),
    ).toEqual({
      fileName: sharedFileName,
      filePath: `/tmp/light-note-icons/${sharedFileName}`,
      pathname: `/uploads/${sharedFileName}`,
      shared: true,
    });
  });

  it('拒绝目录穿越、非 uploads 路径和不属于该书签的旧文件', () => {
    expect(getStoredBookmarkIconFileName('/uploads/%2e%2e%2fsecret.png', 'bookmark-1')).toBe('');
    expect(getStoredBookmarkIconFileName('/images/bookmark-bookmark-1.png', 'bookmark-1')).toBe('');
    expect(getStoredBookmarkIconFileName('/uploads/bookmark-bookmark-2.png', 'bookmark-1')).toBe('');
  });
});
