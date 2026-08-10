import { describe, expect, it } from 'vitest';
import { FILE_PREVIEW_STRATEGY, getFilePreviewExtension, resolveFilePreviewFormat } from '@lightnote/shared';

describe('file preview shared format registry', () => {
  it.each(['zip', 'rar', '7z', 'tar.gz', 'tgz', 'tar.bz2', 'tbz2', 'tar.xz', 'txz'])(
    'recognizes archive %s',
    (extension) => {
      expect(resolveFilePreviewFormat({ fileName: `backup.${extension}` })?.strategy).toBe(
        FILE_PREVIEW_STRATEGY.ARCHIVE_MANIFEST,
      );
    },
  );

  it.each([
    ['legacy.doc', 'legacy-word'],
    ['rich.rtf', 'legacy-word'],
    ['open.odt', 'legacy-word'],
    ['sheet.ods', 'legacy-spreadsheet'],
    ['slides.odp', 'legacy-presentation'],
  ])('routes %s through PDF conversion', (fileName, formatId) => {
    const result = resolveFilePreviewFormat({ fileName });
    expect(result?.strategy).toBe(FILE_PREVIEW_STRATEGY.CONVERTED_PDF);
    expect(result?.id).toBe(formatId);
  });

  it('keeps modern OOXML direct even when a stale MIME says legacy Office', () => {
    expect(
      resolveFilePreviewFormat({
        fileName: 'modern.docx',
        fileType: 'application/msword',
      }),
    ).toBeNull();
  });

  it('recognizes MIME only when a file has no extension and preserves compound extensions', () => {
    expect(resolveFilePreviewFormat({ fileName: 'untitled', fileType: 'application/msword' })?.id).toBe('legacy-word');
    expect(getFilePreviewExtension('backup.tar.gz')).toBe('tar.gz');
  });
});
