import html2canvas from 'html2canvas';
import JsPDF from 'jspdf';

// 常量定义
const A4_WIDTH_PT = 595.28; // A4 宽度 (pt)
const A4_HEIGHT_PT = 841.89; // A4 高度 (pt)
const DEFAULT_SCALE = window.devicePixelRatio * 2;
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
 * 从 HTML 元素生成 PDF
 * @param title PDF 文件名
 * @param selector CSS 选择器，目标元素
 * @param options 配置选项
 */
export async function generatePDF(title: string, selector: string, options: PDFOptions = {}): Promise<void> {
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

    // 生成 canvas(渲染期间原文档 zoom 归一,克隆文档固定浅色主题)
    const canvas = await withNormalizedZoom(() =>
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
    );

    // 创建 PDF 实例
    const pdf = new JsPDF(orientation, 'pt', format);

    // 计算页面尺寸
    const pageWidth = orientation === 'l' ? A4_HEIGHT_PT : A4_WIDTH_PT;
    const pageHeight = orientation === 'l' ? A4_WIDTH_PT : A4_HEIGHT_PT;
    const contentWidth = pageWidth - margins * 2;
    const contentHeight = pageHeight - margins * 2;

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

    // 保存 PDF
    pdf.save(`${title}.pdf`);
  } catch (error) {
    console.error('PDF 生成失败:', error);
    throw new Error(`PDF 生成失败: ${(error as Error).message}`);
  }
}
