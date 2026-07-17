import { describe, expect, it } from 'vitest';
import { buildLocalizedAttachmentConfirmationPreview } from './attachmentConfirmationPreview';

const labels = {
  rootFolder: 'Cloud Space root',
  noDescription: 'None',
  unknownValue: 'Unknown',
  saveImpact: 'The original file will be saved.',
  saveCreateFolderImpact: 'The folder will be created, then the original file will be saved.',
  saveAlreadySavedImpact: 'The file is already saved.',
  createImageNoteImpact: 'A new image note will be created.',
};

describe('buildLocalizedAttachmentConfirmationPreview', () => {
  it('使用服务端准备后的权威参数生成英文保存预览', () => {
    const preview = buildLocalizedAttachmentConfirmationPreview(
      {
        token: 'token',
        id: 'confirmation-1',
        sessionId: 'session-1',
        toolName: 'save_attachment_to_cloud',
        expiresIn: 120,
        args: {
          attachmentId: 'attachment-1',
          sourceFileName: 'avatar.png',
          fileName: 'test.png',
          folderName: null,
          fileSize: 2048,
          alreadySaved: false,
        },
      },
      labels,
    );
    expect(preview).toEqual({
      target: 'Cloud Space root / test.png',
      impact: 'The original file will be saved.',
      details: [
        { key: 'originalFileName', value: 'avatar.png' },
        { key: 'fileName', value: 'test.png' },
        { key: 'folder', value: 'Cloud Space root' },
        { key: 'fileSize', value: '2.0 KB' },
      ],
    });
  });

  it('新建文件夹策略在最终确认中明确展示额外写入影响', () => {
    const preview = buildLocalizedAttachmentConfirmationPreview(
      {
        token: 'token',
        id: 'confirmation-create-folder',
        sessionId: 'session-1',
        toolName: 'save_attachment_to_cloud',
        expiresIn: 120,
        args: {
          attachmentId: 'attachment-1',
          sourceFileName: 'avatar.png',
          fileName: 'test.png',
          folderName: 'Project files',
          folderStrategy: 'create_if_missing',
          fileSize: 2048,
        },
      },
      labels,
    );
    expect(preview?.impact).toBe('The folder will be created, then the original file will be saved.');
  });

  it('图片笔记的空说明使用本地化值', () => {
    const preview = buildLocalizedAttachmentConfirmationPreview(
      {
        token: 'token',
        id: 'confirmation-2',
        sessionId: 'session-1',
        toolName: 'create_image_note',
        expiresIn: 120,
        args: {
          attachmentId: 'attachment-1',
          sourceFileName: 'avatar.png',
          title: 'Avatar',
          description: '',
          fileSize: 128,
        },
      },
      labels,
    );
    expect(preview?.impact).toBe('A new image note will be created.');
    expect(preview?.details?.find((item) => item.key === 'description')?.value).toBe('None');
  });

  it('未知工具保留服务端原预览', () => {
    expect(
      buildLocalizedAttachmentConfirmationPreview(
        {
          token: 'token',
          id: 'confirmation-3',
          sessionId: 'session-1',
          toolName: 'create_note',
          expiresIn: 120,
          args: { title: 'Test' },
        },
        labels,
      ),
    ).toBeUndefined();
  });
});
