import { ANDROID_RELEASE } from '@lightnote/shared';

/**
 * 对外传播用的永久安装包地址。
 *
 * 为什么需要它：实际 APK 是 `/downloads/android/light-note-<版本>.apk`，带版本号是有意为之
 * （不可变地址 + 长缓存 + 与下载页公示的 SHA-256 一一对应）。但这个地址一发到群里、文档或
 * 二维码上就固化了，下一次发版它仍指向旧包。所以另给一个永不变化的入口，由服务端转到当前版本。
 *
 * 为什么用 302 而不是静态副本：静态目录的响应头是 `max-age=31536000, immutable`（对带版本号的
 * 文件正确），一个叫 latest.apk 的静态副本会被浏览器和中间缓存留住一年，永远发不出新版。
 * 走服务端就能把「入口不缓存」和「实际文件长缓存」分开：这里 no-store，目标文件照旧 immutable。
 */
export const redirectAndroidLatestApk = (req, res) => {
  // released 为 false 是「已备案未发布」的过渡态：此时线上没有可下载的包，不能把用户送到 404
  if (!ANDROID_RELEASE.released) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).type('text/plain').send('Android package is not published yet');
  }

  // 绝不能缓存这一跳，否则版本更新后老响应还把人带去旧包
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  // 302 而非 301：301 会被浏览器永久记住，等于把「永久地址」又钉死到某个版本上
  return res.redirect(302, ANDROID_RELEASE.downloadPath);
};
