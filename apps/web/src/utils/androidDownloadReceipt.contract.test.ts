import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainActivity = readFileSync(
  resolve(__dirname, '../../../android/app/src/main/java/top/boluo66/lightnote/MainActivity.java'),
  'utf-8',
);
const webViewSupport = readFileSync(
  resolve(__dirname, '../../../android/app/src/main/java/top/boluo66/lightnote/WebViewSupport.java'),
  'utf-8',
);

describe('Android 下载入队回执契约', () => {
  it('download 消息透传 token，并回调真实的 DownloadManager enqueue 结果', () => {
    expect(mainActivity).toContain('String token = payload.optString("token")');
    expect(mainActivity).toContain('long downloadId = WebViewSupport.download(');
    expect(mainActivity).toContain('reportDownloadEnqueueResult(token, downloadId)');
    expect(mainActivity).toContain('window.__lightNoteAndroidDownloadEnqueueResult');
  });

  it('原生下载方法返回 downloadId，非法地址或 enqueue 异常返回失败值', () => {
    expect(webViewSupport).toContain('static long download(');
    expect(webViewSupport).toContain('return downloadId;');
    expect(webViewSupport.match(/return -1L;/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
