import html2canvas from 'html2canvas';
import JsPDF from 'jspdf';

// 常量定义
const A4_WIDTH_PT = 595.28; // A4 宽度 (pt)
const A4_HEIGHT_PT = 841.89; // A4 高度 (pt)
const DEFAULT_SCALE = window.devicePixelRatio * 2;
const DEFAULT_QUALITY = 1.0;

interface PDFOptions {
  orientation?: 'p' | 'l'; // 页面方向：portrait 或 landscape
  margins?: number; // 页边距 (pt)
  scale?: number; // 渲染缩放比例
  quality?: number; // 图像质量 (0-1)
  format?: 'a4' | 'a3' | 'letter'; // 页面格式
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
    const margins = options.margins ?? 0;
    const orientation = options.orientation ?? 'p';
    const format = options.format ?? 'a4';

    // 生成 canvas
    const canvas = await html2canvas(target, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: '#FFFFFF',
    });

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

    // 分页处理
    let renderedHeight = 0;
    const totalPages = Math.ceil(imgHeight / contentHeight);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      // 计算当前页高度
      const remainingHeight = imgHeight - renderedHeight;
      const currentPageHeight = Math.min(contentHeight, remainingHeight);

      // 创建页面 canvas
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = (currentPageHeight / imgHeight) * canvas.height;

      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        const sourceY = (renderedHeight / imgHeight) * canvas.height;
        ctx.drawImage(
          canvas,
          0, sourceY, canvas.width, pageCanvas.height,
          0, 0, pageCanvas.width, pageCanvas.height
        );
      }

      // 添加到 PDF
      const imgData = pageCanvas.toDataURL('image/jpeg', quality);
      pdf.addImage(
        imgData,
        'JPEG',
        margins,
        margins,
        imgWidth,
        currentPageHeight,
        undefined,
        'FAST'
      );

      renderedHeight += currentPageHeight;

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
