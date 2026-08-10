import { describe, expect, it } from 'vitest';
import { getOfficePdfExportFilter, validateConvertibleOfficeSignature } from './office.js';

describe('convertible Office signature validation', () => {
  it('accepts OLE, RTF and ODF containers for their declared extensions', () => {
    expect(() =>
      validateConvertibleOfficeSignature(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'doc'),
    ).not.toThrow();
    expect(() => validateConvertibleOfficeSignature(Buffer.from('{\\rtf1 test}'), 'rtf')).not.toThrow();
    expect(() => validateConvertibleOfficeSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'odt')).not.toThrow();
  });

  it('rejects mislabeled content before LibreOffice starts', () => {
    expect(() => validateConvertibleOfficeSignature(Buffer.from('plain text'), 'doc')).toThrow('FILE_CONTENT_INVALID');
    expect(() => validateConvertibleOfficeSignature(Buffer.from('plain text'), 'rtf')).toThrow('FILE_CONTENT_INVALID');
  });

  it('selects the native PDF export filter for Writer, Calc and Impress files', () => {
    expect(getOfficePdfExportFilter('doc')).toBe('pdf:writer_pdf_Export');
    expect(getOfficePdfExportFilter('ods')).toBe('pdf:calc_pdf_Export');
    expect(getOfficePdfExportFilter('ppt')).toBe('pdf:impress_pdf_Export');
    expect(() => getOfficePdfExportFilter('docx')).toThrow('FILE_CONTENT_INVALID');
  });
});
