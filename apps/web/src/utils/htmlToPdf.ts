import html2canvas from 'html2canvas';
import JsPDF from 'jspdf';

// 常量定义
/** 各纸张的 [宽, 高](pt)。原实现无论 format 传什么都按 A4 算尺寸,这里一并纠正。 */
const PAGE_SIZE_PT = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  letter: [612, 792],
} as const;
/** 1pt = 1/72 inch,CSS 1px = 1/96 inch */
const PT_TO_CSS_PX = 96 / 72;
/**
 * 固定渲染倍率,不跟随 devicePixelRatio:
 * Retina(dpr=2)会得到 4 倍图、普通屏只有 2 倍图,同一篇笔记的清晰度与文件体积
 * 在不同电脑上差一倍(实测 4.1MB vs 2MB)。2 倍图对 A4 约 178 DPI,打印足够。
 */
const DEFAULT_SCALE = 2;
const DEFAULT_QUALITY = 1.0;
/** 为避开文字允许向上回退的最大比例(相对每页可容纳高度)。回退越多越不会截字,但页尾留白也越多。 */
const MAX_CUT_BACKTRACK_RATIO = 0.22;
/** 判定「空白行」的通道下限:html2canvas 以 #FFFFFF 铺底,文字反锯齿边缘会略低于纯白。 */
const BLANK_CHANNEL_MIN = 250;
/** 逐行检查时的水平采样步长。文字笔画在 scale>=2 下宽于 2px,隔一列取样不会漏检。 */
const BLANK_SCAN_STEP = 2;

interface PDFOptions {
  orientation?: 'p' | 'l'; // 页面方向：portrait 或 landscape
  margins?: number; // 页边距 (pt)
  scale?: number; // 渲染缩放比例
  quality?: number; // 图像质量 (0-1)
  format?: 'a4' | 'a3' | 'letter'; // 页面格式
}

/**
 * html2canvas 无法解析 Chromium 为原生勾选框计算出的 CSS Color 4 `color(...)` 值。
 * PDF 只需要呈现结果，因此在克隆文档中将待办勾选框转为等价的静态字符，
 * 既保留勾选状态，也避免原生控件的浏览器私有样式参与渲染。
 */
/**
 * PDF 固定浅色导出:PDF 是印刷品语义,不跟随站内深浅主题;
 * 白底同时保证分页「空白行」检测有效(深色底找不到近白行,会退化为硬切)。
 * 颜色不参与布局测量,在克隆文档里改就够了,用户页面不闪色。
 */
export function forcePdfLightTheme(clonedDocument: Document) {
  clonedDocument.documentElement?.setAttribute('data-theme', 'day');
}

/**
 * 渲染期间把目标元素宽度固定为「纸张内容宽」,结束后恢复。
 *
 * html2canvas 渲染的是元素在当前设备上的真实布局:窗口越宽,同一段文字换行越少、
 * 长图越矮;而放置时又把长图等比缩到纸宽,于是同一篇笔记在 14 寸 Mac 上是 2 页、
 * 在 2560 宽屏上被压成半页(字也随之小一半)。
 *
 * 把渲染宽度固定成纸张内容宽后,1 CSS px 恰好对应 0.75pt:排版、页数、字号
 * 在所有设备上一致,且与屏幕 100% 缩放时看到的一样。
 * 用 border-box 锁定外框宽度,避免元素自身 padding 把内容顶出纸面。
 */
export function withPrintWidth<T>(target: HTMLElement, widthPx: number, run: () => Promise<T>): Promise<T> {
  const style = target.style;
  const saved = {
    width: style.getPropertyValue('width'),
    widthPriority: style.getPropertyPriority('width'),
    minWidth: style.getPropertyValue('min-width'),
    minWidthPriority: style.getPropertyPriority('min-width'),
    maxWidth: style.getPropertyValue('max-width'),
    maxWidthPriority: style.getPropertyPriority('max-width'),
    flex: style.getPropertyValue('flex'),
    flexPriority: style.getPropertyPriority('flex'),
    boxSizing: style.getPropertyValue('box-sizing'),
    boxSizingPriority: style.getPropertyPriority('box-sizing'),
  };
  const px = `${widthPx}px`;
  style.setProperty('box-sizing', 'border-box', 'important');
  style.setProperty('width', px, 'important');
  style.setProperty('min-width', px, 'important');
  style.setProperty('max-width', px, 'important');
  // 父级是 flex 容器时,flex-basis/grow 会把宽度重新拉回去
  style.setProperty('flex', '0 0 auto', 'important');
  return run().finally(() => {
    const restore = (prop: string, value: string, priority: string) => {
      if (value) style.setProperty(prop, value, priority);
      else style.removeProperty(prop);
    };
    restore('box-sizing', saved.boxSizing, saved.boxSizingPriority);
    restore('width', saved.width, saved.widthPriority);
    restore('min-width', saved.minWidth, saved.minWidthPriority);
    restore('max-width', saved.maxWidth, saved.maxWidthPriority);
    restore('flex', saved.flex, saved.flexPriority);
  });
}

/**
 * 渲染期间把「原文档」的界面缩放临时归一,返回恢复函数。
 *
 * 轻笺的界面缩放是 <html> 的 CSS zoom,而 html2canvas 不支持 zoom:
 * 它的布局测量读原文档的 rect(视觉像素、被 zoom 缩放),文字度量却按字体尺寸
 * (布局像素)计算,两套坐标一叠加,缩放≠100% 时整篇字距错乱、叠字甚至丢字。
 * 只改克隆文档没用 —— rect 测量发生在原文档上,必须在渲染前归一、渲染后恢复
 * (导出瞬间页面缩放会闪一下,属可接受代价)。
 */
export function withNormalizedZoom<T>(run: () => Promise<T>): Promise<T> {
  const rootStyle = document.documentElement.style;
  const bodyStyle = document.body.style;
  const prevRoot = rootStyle.zoom;
  const prevBody = bodyStyle.zoom;
  rootStyle.zoom = '1';
  bodyStyle.zoom = '1';
  return run().finally(() => {
    rootStyle.zoom = prevRoot;
    bodyStyle.zoom = prevBody;
  });
}

function replacePdfCheckboxes(clonedDocument: Document) {
  const documents = [clonedDocument];
  clonedDocument.querySelectorAll('iframe').forEach((frame) => {
    if (frame.contentDocument) documents.push(frame.contentDocument);
  });

  documents.forEach((document) => {
    document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
      const checkbox = document.createElement('span');
      const checked = input.checked || input.hasAttribute('checked');

      checkbox.className = 'note-pdf-checkbox';
      checkbox.textContent = checked ? '☑' : '☐';
      checkbox.setAttribute('aria-hidden', 'true');
      checkbox.style.cssText =
        'display:inline-block;margin-right:6px;color:#615ced;font-family:Arial,sans-serif;font-size:1em;line-height:1;vertical-align:middle;';

      input.replaceWith(checkbox);
    });
  });
}

/**
 * 在一条像素带里,从下往上找最靠近底部的「空白行」(整行都是背景色)。
 * 抽成纯函数是为了能脱离 canvas 直接测:入参就是 RGBA 连续数组。
 *
 * @returns 空白行在该带内的行号;整条带都有内容时返回 -1。
 */
export function findBlankRowInBand(data: Uint8ClampedArray, width: number, height: number): number {
  for (let row = height - 1; row >= 0; row -= 1) {
    const rowStart = row * width * 4;
    let blank = true;
    for (let x = 0; x < width; x += BLANK_SCAN_STEP) {
      const i = rowStart + x * 4;
      // 全透明像素等同背景;否则要求 RGB 三通道都接近纯白
      if (
        data[i + 3] !== 0 &&
        (data[i] < BLANK_CHANNEL_MIN || data[i + 1] < BLANK_CHANNEL_MIN || data[i + 2] < BLANK_CHANNEL_MIN)
      ) {
        blank = false;
        break;
      }
    }
    if (blank) return row;
  }
  return -1;
}

/**
 * 把理想切割位置挪到附近最近的空白行(行间距 / 段落间距 / 元素之间的留白)。
 *
 * 长图按页高机械等分时,切线会落在某一行文字的中腰,上一页留上半截、下一页留下半截。
 * 找不到空白行(通栏大图、超过一页的长表格)时返回理想位置,退化为原来的硬切 ——
 * 那种情况下被切开的是图形而非文字,观感可接受。
 */
function findSafeCutY(canvas: HTMLCanvasElement, idealY: number, maxBacktrack: number): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return idealY;
  const bottom = Math.floor(idealY);
  const top = Math.max(0, Math.floor(idealY - maxBacktrack));
  const height = bottom - top;
  if (height <= 0) return idealY;

  let band: ImageData;
  try {
    band = ctx.getImageData(0, top, canvas.width, height);
  } catch {
    // canvas 被跨域图片污染时读像素会抛 SecurityError,放弃优化而不是让整个导出失败
    return idealY;
  }

  const row = findBlankRowInBand(band.data, band.width, height);
  return row < 0 ? idealY : top + row;
}

/**
 * 从 HTML 元素渲染出 PDF 文档对象。
 *
 * 只负责渲染，不负责交付：桌面端直接 `save()` 下载即可，移动端必须拿到 Blob
 * 走「系统分享 / blob 下载」的统一链路（见 `utils/fileDelivery.ts`）。
 * @param selector CSS 选择器，目标元素
 * @param options 配置选项
 */
async function renderPdfDocument(selector: string, options: PDFOptions): Promise<JsPDF> {
  try {
    // 获取目标元素
    const target = document.querySelector(selector) as HTMLElement;
    if (!target) {
      throw new Error(`Element with selector "${selector}" not found`);
    }

    // 配置选项
    const scale = options.scale ?? DEFAULT_SCALE;
    const quality = options.quality ?? DEFAULT_QUALITY;
    // 默认留 24pt(≈8.5mm)页边距:内容不贴纸边,分页切点处的下一页首行也不再顶着页顶
    const margins = options.margins ?? 24;
    const orientation = options.orientation ?? 'p';
    const format = options.format ?? 'a4';

    // 先算纸张与内容区尺寸:渲染宽度要按它来固定,才能做到设备无关
    const [shortEdge, longEdge] = PAGE_SIZE_PT[format];
    const pageWidth = orientation === 'l' ? longEdge : shortEdge;
    const pageHeight = orientation === 'l' ? shortEdge : longEdge;
    const contentWidth = pageWidth - margins * 2;
    const contentHeight = pageHeight - margins * 2;
    // 纸张内容宽换算成 CSS 像素:按此宽度渲染,放置时缩放比恰为 1
    const printWidthPx = Math.round(contentWidth * PT_TO_CSS_PX);

    // 生成 canvas(渲染期间固定元素宽度 + 原文档 zoom 归一,克隆文档固定浅色主题)
    const canvas = await withPrintWidth(target, printWidthPx, () =>
      withNormalizedZoom(() =>
        html2canvas(target, {
          scale,
          useCORS: true,
          logging: false,
          backgroundColor: '#FFFFFF',
          onclone: (clonedDocument: Document) => {
            forcePdfLightTheme(clonedDocument);
            replacePdfCheckboxes(clonedDocument);
          },
        }),
      ),
    );

    // 创建 PDF 实例
    const pdf = new JsPDF(orientation, 'pt', format);

    // 计算图像尺寸
    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * contentWidth) / canvas.width;

    // 分页处理:在 canvas 像素坐标里推进,每页高度按实际切点浮动(不再机械等分)
    const pxPerPt = canvas.height / imgHeight; // 1pt 对应多少 canvas 像素
    const maxPageHeightPx = contentHeight * pxPerPt;
    const maxBacktrackPx = maxPageHeightPx * MAX_CUT_BACKTRACK_RATIO;

    let sourceY = 0;
    let isFirstPage = true;

    while (sourceY < canvas.height) {
      const remainingPx = canvas.height - sourceY;
      let slicePx = Math.min(maxPageHeightPx, remainingPx);

      // 只有「这一页装不下剩余内容」时才需要挑切点;最后一页整块放完,不必回退
      if (slicePx < remainingPx) {
        const cutY = findSafeCutY(canvas, sourceY + slicePx, maxBacktrackPx);
        // 切点必须真的向前推进,否则会原地死循环
        if (cutY > sourceY) slicePx = cutY - sourceY;
      }
      slicePx = Math.max(1, Math.round(slicePx));

      if (!isFirstPage) pdf.addPage();
      isFirstPage = false;

      // 创建页面 canvas(高度即本页实际切片高度,页尾留白由 PDF 页面本身承担)
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = slicePx;

      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, sourceY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
      }

      // 添加到 PDF(高度换算回 pt,保持与宽度同一缩放比,避免图像被拉伸)
      const imgData = pageCanvas.toDataURL('image/jpeg', quality);
      pdf.addImage(imgData, 'JPEG', margins, margins, imgWidth, slicePx / pxPerPt, undefined, 'FAST');

      sourceY += slicePx;

      // 清理临时 canvas
      pageCanvas.remove();
    }

    return pdf;
  } catch (error) {
    console.error('PDF 生成失败:', error);
    throw new Error(`PDF 生成失败: ${(error as Error).message}`);
  }
}

/**
 * 从 HTML 元素生成 PDF，产出 Blob。
 *
 * 只产出内容、不负责落盘：文件名清洗与「系统分享 / 下载」的选择统一由
 * `utils/fileDelivery.ts` 决定，桌面与移动端因此共用同一条交付链路。
 */
export async function generatePdfBlob(selector: string, options: PDFOptions = {}): Promise<Blob> {
  const pdf = await renderPdfDocument(selector, options);
  return pdf.output('blob');
}
