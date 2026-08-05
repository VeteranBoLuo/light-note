import { describe, expect, it } from 'vitest';
import { canSaveImage, deriveImageFileName, isBase64ImageSrc, isHttpImageSrc } from './viewerSave';

describe('canSaveImage', () => {
  it('http(s) 图在 App 和浏览器里都能存', () => {
    expect(canSaveImage('https://boluo66.top/a.png', true)).toBe(true);
    expect(canSaveImage('https://boluo66.top/a.png', false)).toBe(true);
  });

  /*
   * 回归用例：轻笺的头像是 data:image/jpeg;base64 存库的，早先这里在 App 内返回 false，
   * 导致「保存头像」这个最主要的场景连按钮都不出现。base64 图现在走原生直写通道。
   */
  it('base64 图在 App 内也要给按钮 —— 头像就是这种', () => {
    const avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(canSaveImage(avatar, true)).toBe(true);
    expect(canSaveImage(avatar, false)).toBe(true);
  });

  it('blob: 在 App 内仍然不给按钮:既不是 http 也拿不到字节', () => {
    expect(canSaveImage('blob:http://a/uuid', true)).toBe(false);
    expect(canSaveImage('blob:http://a/uuid', false)).toBe(true);
  });

  it('识别 base64 图片 src', () => {
    expect(isBase64ImageSrc('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isBase64ImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true);
    expect(isBase64ImageSrc('data:text/plain;base64,aGk=')).toBe(false);
    expect(isBase64ImageSrc('https://a/b.png')).toBe(false);
  });

  it('空 src 不显示按钮', () => {
    expect(canSaveImage('', false)).toBe(false);
    expect(canSaveImage(null, false)).toBe(false);
    expect(canSaveImage(undefined, false)).toBe(false);
  });
});

describe('deriveImageFileName', () => {
  it('带扩展名的 URL 原样取文件名', () => {
    expect(deriveImageFileName('https://boluo66.top/files/photo.jpg')).toBe('photo.jpg');
  });

  it('不带扩展名的对象名补 .png,否则相册不认', () => {
    expect(deriveImageFileName('https://boluo66.top/avatar/abc123')).toBe('abc123.png');
  });

  it('带查询参数的预签名 URL 只取 path 部分', () => {
    expect(deriveImageFileName('https://obs.example.com/bucket/head.png?AccessKeyId=x&Signature=y')).toBe('head.png');
  });

  it('URL 编码的中文名解码后返回', () => {
    expect(deriveImageFileName('https://boluo66.top/f/%E5%A4%B4%E5%83%8F.png')).toBe('头像.png');
  });

  it('SVG data URL 按 MIME 存成 .svg —— 存成 .png 会打不开', () => {
    expect(deriveImageFileName('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 1700000000000)).toBe(
      'light-note-image-1700000000000.svg',
    );
  });

  it('PNG data URL 存成 .png,jpeg 归一成 jpg', () => {
    expect(deriveImageFileName('data:image/png;base64,iVBORw0KGgo=', 1)).toBe('light-note-image-1.png');
    expect(deriveImageFileName('data:image/jpeg;base64,/9j/4AAQ', 1)).toBe('light-note-image-1.jpg');
  });

  it('路径为空或 URL 非法时回落到默认名,不抛错', () => {
    expect(deriveImageFileName('https://boluo66.top/', 2)).toBe('light-note-image-2.png');
    expect(() => deriveImageFileName('https://[bad-url', 3)).not.toThrow();
    expect(deriveImageFileName('https://[bad-url', 3)).toBe('light-note-image-3.png');
  });
});

describe('isHttpImageSrc', () => {
  it('只认 http/https', () => {
    expect(isHttpImageSrc('http://a/b.png')).toBe(true);
    expect(isHttpImageSrc('https://a/b.png')).toBe(true);
    expect(isHttpImageSrc('data:image/png;base64,x')).toBe(false);
    expect(isHttpImageSrc('blob:http://a/uuid')).toBe(false);
  });
});
