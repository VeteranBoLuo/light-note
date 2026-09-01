import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  exportPdfPages,
  parsePdfFiles,
  PDF_ORGANIZER_MAX_BYTES,
  PDF_ORGANIZER_MAX_FILES,
  PDF_ORGANIZER_MAX_PAGES,
  PdfOrganizerError,
} from './pdfOrganizer';

async function pdfFile(name: string, pageCount: number) {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) document.addPage([300 + index, 500]);
  return new File([await document.save()], name, { type: 'application/pdf' });
}

describe('PDF 整理器本地内核', () => {
  it('解析多份 PDF，并按页面模型导出重排与旋转后的单一文件', async () => {
    const workspace = await parsePdfFiles([await pdfFile('a.pdf', 2), await pdfFile('b.pdf', 1)]);
    expect(workspace.sources.map((source) => source.pageCount)).toEqual([2, 1]);
    expect(workspace.pages).toHaveLength(3);

    const reordered = [workspace.pages[2], workspace.pages[0]];
    reordered[0].rotation = 90;
    const output = await exportPdfPages(workspace.sources, reordered);
    const exported = await PDFDocument.load(await output.blob.arrayBuffer());

    expect(exported.getPageCount()).toBe(2);
    expect(exported.getPage(0).getRotation().angle).toBe(90);
    expect(output.fileName).toBe('lightnote-merged-organized.pdf');
  });

  it('拒绝非 PDF 输入，不把文件发送到任何服务端路径', async () => {
    const file = new File(['plain'], 'notes.txt', { type: 'text/plain' });
    await expect(parsePdfFiles([file])).rejects.toMatchObject<PdfOrganizerError>({ code: 'INVALID_TYPE' });
  });

  it('在解析前拒绝超过文件数和总体积上限的批次', async () => {
    const tooMany = Array.from(
      { length: PDF_ORGANIZER_MAX_FILES + 1 },
      (_, index) => new File(['pdf'], `${index}.pdf`, { type: 'application/pdf' }),
    );
    await expect(parsePdfFiles(tooMany)).rejects.toMatchObject<PdfOrganizerError>({ code: 'TOO_MANY' });

    const tooLarge = new File(['pdf'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(tooLarge, 'size', { value: PDF_ORGANIZER_MAX_BYTES + 1 });
    await expect(parsePdfFiles([tooLarge])).rejects.toMatchObject<PdfOrganizerError>({ code: 'TOO_LARGE' });
  });

  it('拒绝超过页面上限的 PDF，避免缩略图任务耗尽浏览器资源', async () => {
    await expect(
      parsePdfFiles([await pdfFile('huge.pdf', PDF_ORGANIZER_MAX_PAGES + 1)]),
    ).rejects.toMatchObject<PdfOrganizerError>({ code: 'TOO_MANY_PAGES' });
  });
});
