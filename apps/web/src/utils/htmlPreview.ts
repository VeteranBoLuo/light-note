/**
 * 上传的 HTML 属于不可信内容。只允许文件自身脚本与 3D 场景常用的指针锁定，
 * 不开放同源身份、表单、弹窗、下载或顶层导航，避免预览内容接触轻笺登录态。
 */
export const HTML_PREVIEW_SANDBOX = 'allow-scripts allow-pointer-lock';

export const HTML_PREVIEW_REFERRER_POLICY = 'no-referrer' as const;

const HTML_PREVIEW_ANCHOR_BRIDGE_MARKER = 'data-light-note-anchor-bridge';

const HTML_PREVIEW_ANCHOR_BRIDGE = `<script ${HTML_PREVIEW_ANCHOR_BRIDGE_MARKER}>
  (() => {
    const resolveAnchorTarget = (rawHash) => {
      const candidates = [rawHash];
      try {
        const decodedHash = decodeURIComponent(rawHash);
        if (decodedHash !== rawHash) candidates.push(decodedHash);
      } catch {}

      for (const candidate of candidates) {
        const idTarget = document.getElementById(candidate);
        if (idTarget) return idTarget;
        const nameTarget = document.getElementsByName(candidate)[0];
        if (nameTarget) return nameTarget;
      }
      return null;
    };

    document.addEventListener(
      'click',
      (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        const source = event.target;
        const anchor = source && typeof source.closest === 'function' ? source.closest('a[href]') : null;
        const href = anchor?.getAttribute('href')?.trim() || '';
        if (!href.startsWith('#')) return;

        const rawHash = href.slice(1);
        if (!rawHash) {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        const target = resolveAnchorTarget(rawHash);
        if (!target) return;
        event.preventDefault();
        const anchorOffset = 10;
        const currentScrollTop = document.scrollingElement?.scrollTop || window.scrollY || 0;
        const targetTop = currentScrollTop + target.getBoundingClientRect().top;
        window.scrollTo({ top: Math.max(0, targetTop - anchorOffset), behavior: 'smooth' });
      },
      true,
    );
  })();
</script>`;

/**
 * HTML 预览运行在无同源权限的 Blob sandbox 中，浏览器无法稳定处理旧式
 * `href="#..."` → `<a name="...">` 片段导航。将桥接脚本放在 head 最前面，
 * 直接在隔离文档内部完成滚动，不需要开放 allow-same-origin 或访问主应用 DOM。
 */
export function injectHtmlPreviewAnchorBridge(source: string) {
  if (!source || source.includes(HTML_PREVIEW_ANCHOR_BRIDGE_MARKER)) return source;

  const headMatch = /<head(?:\s[^>]*)?>/i.exec(source);
  if (headMatch?.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return `${source.slice(0, insertAt)}${HTML_PREVIEW_ANCHOR_BRIDGE}${source.slice(insertAt)}`;
  }

  const htmlMatch = /<html(?:\s[^>]*)?>/i.exec(source);
  if (htmlMatch?.index !== undefined) {
    const insertAt = htmlMatch.index + htmlMatch[0].length;
    return `${source.slice(0, insertAt)}${HTML_PREVIEW_ANCHOR_BRIDGE}${source.slice(insertAt)}`;
  }

  const doctypeMatch = /^\s*<!doctype[^>]*>/i.exec(source);
  if (doctypeMatch) {
    const insertAt = doctypeMatch[0].length;
    return `${source.slice(0, insertAt)}${HTML_PREVIEW_ANCHOR_BRIDGE}${source.slice(insertAt)}`;
  }

  return `${HTML_PREVIEW_ANCHOR_BRIDGE}${source}`;
}
