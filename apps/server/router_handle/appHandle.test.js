import { beforeEach, describe, expect, it, vi } from 'vitest';

const release = {
  versionName: '1.0.1',
  downloadPath: '/downloads/android/light-note-1.0.1.apk',
  released: true,
};

vi.mock('@lightnote/shared', () => ({
  get ANDROID_RELEASE() {
    return release;
  },
}));

const { redirectAndroidLatestApk } = await import('./appHandle.js');

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    redirectedTo: null,
    contentType: null,
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    type(v) {
      this.contentType = v;
      return this;
    },
    send(v) {
      this.body = v;
      return this;
    },
    redirect(code, url) {
      this.statusCode = code;
      this.redirectedTo = url;
      return this;
    },
  };
  return res;
}

beforeEach(() => {
  release.versionName = '1.0.1';
  release.downloadPath = '/downloads/android/light-note-1.0.1.apk';
  release.released = true;
});

describe('安装包永久地址', () => {
  it('302 到当前版本的实际文件', () => {
    const res = mockRes();
    redirectAndroidLatestApk({}, res);

    expect(res.statusCode).toBe(302);
    expect(res.redirectedTo).toBe('/downloads/android/light-note-1.0.1.apk');
  });

  it('发新版后自动跟随，不需要改这个端点', () => {
    release.versionName = '1.2.0';
    release.downloadPath = '/downloads/android/light-note-1.2.0.apk';
    const res = mockRes();
    redirectAndroidLatestApk({}, res);

    expect(res.redirectedTo).toBe('/downloads/android/light-note-1.2.0.apk');
  });

  it('这一跳必须禁止缓存 —— 否则版本更新后老响应还把人带去旧包', () => {
    const res = mockRes();
    redirectAndroidLatestApk({}, res);

    expect(res.headers['Cache-Control']).toContain('no-store');
    expect(res.headers['Pragma']).toBe('no-cache');
  });

  it('用 302 而不是 301：301 会被浏览器永久记住，等于又把永久地址钉死到某个版本', () => {
    const res = mockRes();
    redirectAndroidLatestApk({}, res);
    expect(res.statusCode).not.toBe(301);
    expect(res.statusCode).toBe(302);
  });

  it('未发布时回 503 而不是把用户送到 404', () => {
    release.released = false;
    const res = mockRes();
    redirectAndroidLatestApk({}, res);

    expect(res.statusCode).toBe(503);
    expect(res.redirectedTo).toBeNull();
    expect(res.headers['Cache-Control']).toContain('no-store');
  });
});
