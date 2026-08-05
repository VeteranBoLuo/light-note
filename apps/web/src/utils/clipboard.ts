/**
 * 复制到剪贴板，带 WebView 降级。
 *
 * 为什么不能只用 `navigator.clipboard.writeText`：它在部分 Android WebView 里直接抛异常
 * 或静默失败 —— 鸿蒙「卓易通」兼容层实测就复制不了（表现为一句"复制失败"）。轻笺 App 内
 * 的复制是很多功能的最后退路（导出落不了盘时复制正文、更新装不上时复制下载页地址），
 * 这一环失败就等于没有兜底了。
 *
 * 降级用老的 `document.execCommand('copy')`：它要求选区来自一个真实可选中的元素，
 * 所以那个临时 textarea 不能用 `display:none` / `visibility:hidden` 藏起来（那样
 * `select()` 拿不到选区），只能靠 `opacity:0` + 1px 尺寸移出视觉。
 */

function copyViaExecCommand(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // readonly 防止移动端聚焦时弹出软键盘
  textarea.setAttribute('readonly', '');
  textarea.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    // iOS Safari 只认 setSelectionRange，select() 对它无效
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

/**
 * 复制文本。先试异步 Clipboard API，不行再退 execCommand。
 * 返回是否成功 —— 调用方必须处理 false，不能假设复制一定成功。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // 权限被拒/WebView 不支持：继续走 execCommand，不在这里报错
    }
  }
  return copyViaExecCommand(value);
}
