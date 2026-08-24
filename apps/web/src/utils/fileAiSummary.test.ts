import { describe, expect, it } from 'vitest';
import { resolveFileAiSummaryPresentation } from './fileAiSummary';

describe('文件 AI 总结展示语义', () => {
  it('图片使用提取文字并总结语义', () => {
    expect(resolveFileAiSummaryPresentation({ fileName: 'screenshot.jpg' })).toEqual({
      isImage: true,
      labelKey: 'cloudSpace.aiExtractAndSummarizeImage',
      instructionKey: 'cloudSpace.aiExtractAndSummarizeImageInstruction',
    });
  });

  it.each(['report.pdf', 'proposal.docx'])('%s 使用文档总结语义', (fileName) => {
    expect(resolveFileAiSummaryPresentation({ fileName })).toMatchObject({
      isImage: false,
      labelKey: 'cloudSpace.aiSummarizeFile',
      instructionKey: 'cloudSpace.aiSummarizeInstruction',
    });
  });
});
