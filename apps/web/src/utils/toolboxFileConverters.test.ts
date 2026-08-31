import { describe, expect, it } from 'vitest';
import { IMAGE_TO_PDF_MAX_BYTES, IMAGE_TO_PDF_MAX_FILES, ImageToPdfError, validateImageToPdfFiles } from './imageToPdf';
import {
  PDF_TO_IMAGES_MAX_BYTES,
  PDF_TO_IMAGES_MAX_FILES,
  PdfToImagesError,
  validatePdfToImageFiles,
} from './pdfToImages';

describe('工具箱新增文件转换器输入边界', () => {
  it('图片转 PDF 仅接受声明的图片格式', () => {
    expect(() =>
      validateImageToPdfFiles([
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.png', { type: 'image/png' }),
        new File(['c'], 'c.webp', { type: 'image/webp' }),
      ]),
    ).not.toThrow();
    expect(() => validateImageToPdfFiles([new File(['x'], 'x.gif', { type: 'image/gif' })])).toThrowError(
      expect.objectContaining<ImageToPdfError>({ code: 'INVALID_TYPE' }),
    );
  });

  it('图片转 PDF 在处理前限制文件数与总大小', () => {
    const tooMany = Array.from(
      { length: IMAGE_TO_PDF_MAX_FILES + 1 },
      (_, index) => new File(['x'], `${index}.png`, { type: 'image/png' }),
    );
    expect(() => validateImageToPdfFiles(tooMany)).toThrowError(expect.objectContaining({ code: 'TOO_MANY' }));

    const tooLarge = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(tooLarge, 'size', { value: IMAGE_TO_PDF_MAX_BYTES + 1 });
    expect(() => validateImageToPdfFiles([tooLarge])).toThrowError(expect.objectContaining({ code: 'TOO_LARGE' }));
  });

  it('PDF 转图片兼容 MIME 缺失的 .pdf，并拒绝其他文件', () => {
    expect(() => validatePdfToImageFiles([new File(['pdf'], 'scan.PDF')])).not.toThrow();
    expect(() => validatePdfToImageFiles([new File(['text'], 'notes.txt', { type: 'text/plain' })])).toThrowError(
      expect.objectContaining<PdfToImagesError>({ code: 'INVALID_TYPE' }),
    );
  });

  it('PDF 转图片在解析前限制文件数与总大小', () => {
    const tooMany = Array.from(
      { length: PDF_TO_IMAGES_MAX_FILES + 1 },
      (_, index) => new File(['pdf'], `${index}.pdf`, { type: 'application/pdf' }),
    );
    expect(() => validatePdfToImageFiles(tooMany)).toThrowError(expect.objectContaining({ code: 'TOO_MANY' }));

    const tooLarge = new File(['pdf'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(tooLarge, 'size', { value: PDF_TO_IMAGES_MAX_BYTES + 1 });
    expect(() => validatePdfToImageFiles([tooLarge])).toThrowError(expect.objectContaining({ code: 'TOO_LARGE' }));
  });
});
