import { describe, expect, it } from 'vitest';
import { getAiAttachmentPresentation } from './attachmentPresentation';

describe('getAiAttachmentPresentation', () => {
  it.each(['queued', 'parsing'] as const)('%s 状态突出后台文字提取，同时保留原文件可用提示', (status) => {
    expect(getAiAttachmentPresentation(status)).toMatchObject({
      isProcessing: true,
      showOriginalReady: true,
      tone: 'processing',
    });
  });

  it('文字提取完成后切换为稳定的成功状态', () => {
    expect(getAiAttachmentPresentation('ready')).toEqual({
      isProcessing: false,
      showOriginalReady: true,
      statusKey: 'ai.attachmentStatus.ready',
      tone: 'success',
    });
  });

  it.each([
    ['no_text', 'warning'],
    ['failed', 'error'],
  ] as const)('%s 不会把仍可用的原文件误判为不可用', (status, tone) => {
    expect(getAiAttachmentPresentation(status)).toMatchObject({
      isProcessing: false,
      showOriginalReady: true,
      tone,
    });
  });

  it('上传尚未完成时不提前宣告原文件可用', () => {
    expect(getAiAttachmentPresentation('awaiting_upload')).toMatchObject({
      isProcessing: false,
      showOriginalReady: false,
      tone: 'neutral',
    });
  });
});
