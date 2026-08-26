import { describe, expect, it } from 'vitest';
import { extensionResourcePath, extensionResourceUrl } from './success';

describe('浏览器插件成功页资源跳转', () => {
  it.each([
    [{ type: 'bookmark', resourceId: 'bookmark-1', title: 'B' }, '/manage/editBookmark/bookmark-1'],
    [{ type: 'note', resourceId: 'note 1', title: 'N' }, '/noteLibrary/note%201'],
    [{ type: 'file', resourceId: '27', title: 'F' }, '/cloudSpace?fileId=27'],
  ] as const)('为 %s 生成站内资源地址', (result, expectedPath) => {
    expect(extensionResourcePath(result)).toBe(expectedPath);
    expect(extensionResourceUrl(result)).toBe(`https://boluo66.top${expectedPath}`);
  });

  it.each([
    [{ type: 'bookmark', title: 'B' }, '/home'],
    [{ type: 'note', title: 'N' }, '/noteLibrary'],
    [{ type: 'file', title: 'F' }, '/cloudSpace'],
  ] as const)('资源 ID 缺失时回退到 %s 对应的模块首页', (result, expectedPath) => {
    expect(extensionResourcePath(result)).toBe(expectedPath);
  });
});
