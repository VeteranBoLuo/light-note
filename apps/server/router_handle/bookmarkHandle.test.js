import { describe, it, expect, vi } from 'vitest';

// common.js 的循环依赖链会一路拉到 router/file.js → util/obsClient.js,
// 后者在模块加载时就 new ObsClient(...),本地没有 OBS_AK/OBS_SK 时会直接抛错(同 commonHandle.test.js 的环境问题),
// mock 掉换成占位实现,不影响本文件只测 normalizeBookmarkUrl 这个纯函数。
vi.mock('../util/obsClient.js', () => ({
  default: {},
  bucketBaseUrl: 'https://mock-bucket.example.com',
  buildObjectKey: vi.fn(),
  createUploadSignedUrl: vi.fn(),
  createDownloadSignedUrl: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  copyObjectInObs: vi.fn(),
  putObjectToObs: vi.fn(),
  buildObjectUrl: vi.fn(),
}));

// bookmarkHandle.js 依赖 common.js(resultData),存在 common.js↔router↔handler 循环依赖:
// 先 import common.js 让 handler 作为叶子完成初始化,规避循环(同 auth.test.js / commonHandle.test.js)。
await import('../util/common.js');
const { normalizeBookmarkUrl } = await import('./bookmarkHandle.js');

describe('normalizeBookmarkUrl', () => {
  it('裸域名补 https://', () => {
    expect(normalizeBookmarkUrl('keep.com')).toBe('https://keep.com');
  });

  it('已带 http:// 时保持不变(不重复补)', () => {
    expect(normalizeBookmarkUrl('http://keep.com')).toBe('http://keep.com');
  });

  it('已带 https:// 时保持不变', () => {
    expect(normalizeBookmarkUrl('https://keep.com')).toBe('https://keep.com');
  });

  it('大小写不敏感(HTTPS://)', () => {
    expect(normalizeBookmarkUrl('HTTPS://keep.com')).toBe('https://keep.com');
  });

  it('去除首尾空格后再判断', () => {
    expect(normalizeBookmarkUrl('  keep.com  ')).toBe('https://keep.com');
  });

  it('显式传入空地址时直接拒绝', () => {
    for (const value of ['', '   ', undefined, null]) {
      expect(() => normalizeBookmarkUrl(value)).toThrow('网址不能为空');
    }
  });

  it('拒绝错误拼接和分享文案，不能仅凭 https 前缀放行', () => {
    expect(() => normalizeBookmarkUrl('https://%20keep.com')).toThrow('识别到候选地址');
    expect(() => normalizeBookmarkUrl('https://网址放这里→ https:// keep.com')).toThrow('识别到候选地址');
    expect(() => normalizeBookmarkUrl('javascript:alert(1)')).toThrow('仅支持 HTTP 或 HTTPS 地址');
  });
});
