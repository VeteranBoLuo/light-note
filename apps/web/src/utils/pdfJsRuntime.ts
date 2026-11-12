import type { PDFDocumentLoadingTask, TextLayer } from 'pdfjs-dist';
import type { DocumentInitParameters } from 'pdfjs-dist/types/src/display/api';
import cMapUrl from 'virtual:lightnote-pdf-cmaps';

type PdfJsRuntime = {
  TextLayer: typeof TextLayer;
  getDocument(options: DocumentInitParameters): PDFDocumentLoadingTask;
};

let pdfRuntimePromise: Promise<PdfJsRuntime> | null = null;

/**
 * PDF.js 的统一浏览器运行时入口。
 *
 * `?url` 会保留上游 `.mjs` 后缀；部分静态服务器未声明该 MIME 时，模块
 * Worker 会被浏览器拒绝。让 Vite 把 Worker 作为独立入口构建，最终产物使用
 * 普遍受支持的 `.js` 后缀，同时保持 Worker 与主包分离、按需加载。
 */
export function loadPdfJsRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url'),
    ]).then(([pdfjs, workerModule]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      return {
        TextLayer: pdfjs.TextLayer,
        getDocument(options: DocumentInitParameters) {
          return pdfjs.getDocument({ ...options, cMapUrl, cMapPacked: true });
        },
      };
    });
  }
  return pdfRuntimePromise;
}
