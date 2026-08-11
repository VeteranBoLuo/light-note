function unwrapCssUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('url(') || !trimmed.endsWith(')')) return '';

  let url = trimmed.slice(4, -1).trim();
  const quote = url[0];
  if ((quote === '"' || quote === "'") && url.at(-1) === quote) {
    url = url.slice(1, -1);
  }
  return url;
}

function decodeSvgDataUrl(dataUrl: string): string {
  const separatorIndex = dataUrl.indexOf(',');
  if (separatorIndex < 0 || !dataUrl.startsWith('data:image/svg+xml')) return '';

  const metadata = dataUrl.slice(0, separatorIndex);
  const body = dataUrl.slice(separatorIndex + 1);
  try {
    return metadata.includes(';base64') ? window.atob(body) : decodeURIComponent(body);
  } catch {
    return '';
  }
}

function createInlineSvg(element: HTMLElement, svg: string): SVGElement | null {
  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(svg, 'image/svg+xml');
  if (parsedDocument.querySelector('parsererror') || parsedDocument.documentElement.nodeName !== 'svg') return null;

  const svgElement = element.ownerDocument.importNode(parsedDocument.documentElement, true) as unknown as SVGElement;
  svgElement.setAttribute('width', '100%');
  svgElement.setAttribute('height', '100%');
  svgElement.setAttribute('aria-hidden', 'true');
  svgElement.style.display = 'block';
  svgElement.style.width = '100%';
  svgElement.style.height = '100%';
  return svgElement;
}

/**
 * html2canvas 无法可靠绘制 OriginalIcon 的 CSS mask。导出克隆中将 mask
 * 转为已固化 currentColor 的普通背景图，页面本身仍继续使用统一 SvgIcon。
 */
export function prepareMaskedIconsForCanvas(root: ParentNode, view?: Window | null): void {
  root.querySelectorAll<HTMLElement>('.icon-base64').forEach((element) => {
    const computedStyle = view?.getComputedStyle(element);
    const maskSource = element.style.getPropertyValue('--src') || computedStyle?.getPropertyValue('--src') || '';
    const svg = decodeSvgDataUrl(unwrapCssUrl(maskSource));
    if (!svg) return;

    const color = computedStyle?.color || element.style.color || '#f5f6fb';
    const exportSvg = createInlineSvg(element, svg.replaceAll('currentColor', color));
    if (!exportSvg) return;

    element.style.setProperty('-webkit-mask-image', 'none');
    element.style.setProperty('mask-image', 'none');
    element.style.setProperty('background-color', 'transparent');
    element.style.setProperty('background-image', 'none');
    element.replaceChildren(exportSvg);
    element.dataset.canvasExportIcon = 'ready';
  });
}
