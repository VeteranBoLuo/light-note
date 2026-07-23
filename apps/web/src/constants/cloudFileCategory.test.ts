import { describe, expect, it } from 'vitest';
import { getCloudPreviewType, isLegacyOfficeFile } from './cloudFileCategory';

describe('cloudFileCategory preview compatibility', () => {
  it.each([
    ['legacy.doc', 'application/msword'],
    ['legacy.xls', 'application/vnd.ms-excel'],
    ['legacy.ppt', 'application/vnd.ms-powerpoint'],
  ])('旧版 Office 文件 %s 不进入 OOXML 渲染器', (fileName, fileType) => {
    const file = { fileName, fileType };
    expect(isLegacyOfficeFile(file)).toBe(true);
    expect(getCloudPreviewType(file)).toBe('unsupported');
  });

  it.each([
    ['modern.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word'],
    ['modern.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'excel'],
    ['modern.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'ppt'],
  ])('新版 Office 文件 %s 继续使用本地渲染器', (fileName, fileType, previewType) => {
    const file = { fileName, fileType, category: previewType };
    expect(isLegacyOfficeFile(file)).toBe(false);
    expect(getCloudPreviewType(file)).toBe(previewType);
  });

  it('文件扩展名优先于错误的旧版 MIME，避免把 docx 误判成 doc', () => {
    const file = { fileName: 'report.docx', fileType: 'application/msword', category: 'word' };
    expect(isLegacyOfficeFile(file)).toBe(false);
    expect(getCloudPreviewType(file)).toBe('word');
  });
});
