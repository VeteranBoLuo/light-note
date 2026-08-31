import { optimizeImage, validateImageFiles } from '@/utils/imageOptimizer';
import { safeDownloadBaseName } from '@/utils/toolboxLocal';

export const IMAGE_TO_PDF_MAX_FILES = 30;
export const IMAGE_TO_PDF_MAX_BYTES = 100 * 1024 * 1024;

export type ImagePdfPageSize = 'fit' | 'a4';
export type ImagePdfOrientation = 'auto' | 'portrait' | 'landscape';

export interface ImageToPdfOptions {
  pageSize: ImagePdfPageSize;
  orientation: ImagePdfOrientation;
  margin: 0 | 24 | 48;
  quality: number;
}

export interface ImageToPdfResult {
  blob: Blob;
  fileName: string;
  pageCount: number;
}

export class ImageToPdfError extends Error {
  constructor(public readonly code: 'TOO_MANY' | 'TOO_LARGE' | 'INVALID_TYPE' | 'CONVERT_FAILED') {
    super(code);
    this.name = 'ImageToPdfError';
  }
}

export function validateImageToPdfFiles(files: File[]) {
  if (!files.length) throw new ImageToPdfError('INVALID_TYPE');
  if (files.length > IMAGE_TO_PDF_MAX_FILES) throw new ImageToPdfError('TOO_MANY');
  if (files.reduce((sum, file) => sum + file.size, 0) > IMAGE_TO_PDF_MAX_BYTES) {
    throw new ImageToPdfError('TOO_LARGE');
  }
  try {
    files.forEach((file) => validateImageFiles([file]));
  } catch {
    throw new ImageToPdfError('INVALID_TYPE');
  }
}

function a4PageSize(width: number, height: number, orientation: ImagePdfOrientation): [number, number] {
  const useLandscape = orientation === 'landscape' || (orientation === 'auto' && width > height);
  return useLandscape ? [841.89, 595.28] : [595.28, 841.89];
}

function fitPageSize(width: number, height: number, margin: number): [number, number] {
  const clamp = (value: number) => Math.min(14_400, Math.max(72, value));
  return [clamp(width * 0.75 + margin * 2), clamp(height * 0.75 + margin * 2)];
}

export async function createPdfFromImages(
  files: File[],
  options: ImageToPdfOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<ImageToPdfResult> {
  validateImageToPdfFiles(files);
  const { PDFDocument } = await import('pdf-lib');
  const document = await PDFDocument.create();
  const margin = Math.max(0, Number(options.margin) || 0);

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]!;
      const converted = await optimizeImage(file, {
        format: 'image/jpeg',
        quality: Math.min(1, Math.max(0.5, Number(options.quality) || 0.9)),
        maxDimension: 4_000,
      });
      try {
        const image = await document.embedJpg(new Uint8Array(await converted.blob.arrayBuffer()));
        const [pageWidth, pageHeight] =
          options.pageSize === 'a4'
            ? a4PageSize(converted.width, converted.height, options.orientation)
            : fitPageSize(converted.width, converted.height, margin);
        const availableWidth = Math.max(1, pageWidth - margin * 2);
        const availableHeight = Math.max(1, pageHeight - margin * 2);
        const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        const page = document.addPage([pageWidth, pageHeight]);
        page.drawImage(image, {
          x: (pageWidth - drawWidth) / 2,
          y: (pageHeight - drawHeight) / 2,
          width: drawWidth,
          height: drawHeight,
        });
      } finally {
        URL.revokeObjectURL(converted.previewUrl);
      }
      onProgress?.(index + 1, files.length);
    }

    document.setProducer('Light Note Knowledge Toolbox');
    document.setCreator('Light Note');
    const bytes = await document.save({ useObjectStreams: true });
    const baseName = files.length === 1 ? safeDownloadBaseName(files[0]!.name) : 'lightnote-images';
    return {
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      fileName: `${baseName}.pdf`,
      pageCount: files.length,
    };
  } catch (error) {
    if (error instanceof ImageToPdfError) throw error;
    throw new ImageToPdfError('CONVERT_FAILED');
  }
}
