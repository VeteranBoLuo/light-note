import { describe, expect, it } from 'vitest';
import {
  analyzeNoteFormatConversion,
  buildNoteFormatConversionAnalysisHash,
  serializeNoteFormatConversionHashInput,
} from './noteFormatConversion';

describe('analyzeNoteFormatConversion', () => {
  it('HTML 转 Markdown 会识别颜色、对齐、合并单元格和下划线风险', () => {
    const report = analyzeNoteFormatConversion(
      '<h2>标题</h2><p style="color:red;text-align:center"><u>正文</u></p><table><tr><td colspan="2">A</td></tr></table>',
      'html',
    );
    expect(report.targetType).toBe('markdown');
    expect(report.preserved).toBeGreaterThan(0);
    expect(report.standardized).toBeGreaterThan(0);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        { key: 'textColor', count: 1 },
        { key: 'alignment', count: 1 },
        { key: 'mergedCells', count: 1 },
        { key: 'underline', count: 1 },
      ]),
    );
  });

  it('Markdown 的 GFM 结构可保留，并单独提示原生 HTML', () => {
    const report = analyzeNoteFormatConversion(
      '# 标题\n\n- [x] 完成\n\n```mermaid\nflowchart TD\nA-->B\n```\n\n<span style="color:red">HTML</span>',
      'markdown',
    );
    expect(report.targetType).toBe('html');
    expect(report.preserved).toBeGreaterThan(0);
    expect(report.standardized).toBeGreaterThan(0);
    expect(report.issues).toContainEqual({ key: 'rawHtml', count: 1 });
  });

  it('移动端调整过尺寸的图片属于受支持结构，不误报为原生 HTML 风险', () => {
    const report = analyzeNoteFormatConversion(
      '<img src="/api/file/image.png" alt="截图" data-ln-size="medium" />',
      'markdown',
    );

    expect(report.preserved).toBe(1);
    expect(report.potentialLoss).toBe(0);
    expect(report.issues).not.toContainEqual(expect.objectContaining({ key: 'rawHtml' }));
  });

  it('转换预览指纹稳定绑定目标格式、正文和 baseRevision', async () => {
    const input = { targetType: 'markdown' as const, convertedContent: '# 标题\n', baseRevision: 7 };
    expect(serializeNoteFormatConversionHashInput(input)).toBe(
      '{"version":1,"targetType":"markdown","baseRevision":7,"convertedContent":"# 标题\\n"}',
    );
    const first = await buildNoteFormatConversionAnalysisHash(input);
    const second = await buildNoteFormatConversionAnalysisHash(input);
    const changed = await buildNoteFormatConversionAnalysisHash({ ...input, baseRevision: 8 });
    expect(first).toMatch(/^(?:sha256:[a-f0-9]{64}|fnv1a32:[a-f0-9]{8})$/u);
    expect(second).toBe(first);
    expect(changed).not.toBe(first);
  });
});
