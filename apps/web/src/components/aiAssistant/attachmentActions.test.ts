import { describe, expect, it } from 'vitest';
import {
  buildAttachmentActionRequest,
  createAttachmentActionDraft,
  mergePromptSuggestion,
  preservesAttachmentExtension,
} from './attachmentActions';

const attachment = {
  id: 'attachment-1',
  sourceType: 'temporary' as const,
  fileName: 'avatar.png',
  fileType: 'image/png',
  fileSize: 128,
  status: 'no_text' as const,
};

describe('attachmentActions', () => {
  it('保存动作保留自定义文件名和文件夹，不退回固定提示词', () => {
    const draft = createAttachmentActionDraft('save_attachment_to_cloud', attachment, {
      fileName: '测试.png',
      folderId: 12,
    });
    expect(buildAttachmentActionRequest(draft)).toEqual({
      toolName: 'save_attachment_to_cloud',
      args: {
        attachmentId: 'attachment-1',
        fileName: '测试.png',
        folderId: '12',
        folderName: '',
        folderStrategy: 'existing',
      },
    });
  });

  it('手动输入文件夹名时以名称为准，并保留已确认的新建策略', () => {
    const draft = createAttachmentActionDraft('save_attachment_to_cloud', attachment, {
      fileName: '测试.png',
      folderName: '项目资料',
      folderStrategy: 'create_if_missing',
    });
    expect(buildAttachmentActionRequest(draft).args).toEqual({
      attachmentId: 'attachment-1',
      fileName: '测试.png',
      folderId: '',
      folderName: '项目资料',
      folderStrategy: 'create_if_missing',
    });
  });

  it('编辑已有文件夹确认时以 ID 为准，不把后端预览名称误当自定义输入', () => {
    const draft = createAttachmentActionDraft('save_attachment_to_cloud', attachment, {
      folderId: 12,
      folderName: '项目资料',
      folderStrategy: 'existing',
    });
    expect(draft.folderName).toBe('');
    expect(buildAttachmentActionRequest(draft).args).toMatchObject({
      folderId: '12',
      folderName: '',
      folderStrategy: 'existing',
    });
  });

  it('图片笔记默认使用图片文件名，并支持标题和说明覆盖', () => {
    expect(createAttachmentActionDraft('create_image_note', attachment).title).toBe('avatar');
    const draft = createAttachmentActionDraft('create_image_note', attachment, {
      noteTitle: '测试图片',
      caption: '头像说明',
    });
    expect(buildAttachmentActionRequest(draft).args).toEqual({
      attachmentId: 'attachment-1',
      title: '测试图片',
      description: '头像说明',
    });
  });

  it('提问建议只追加不覆盖已有草稿，并避免重复', () => {
    const current = '重点关注设计问题';
    const suggestion = '请总结这个文件。';
    expect(mergePromptSuggestion(current, suggestion)).toBe(`${current}\n${suggestion}`);
    expect(mergePromptSuggestion(`${current}\n${suggestion}`, suggestion)).toBe(`${current}\n${suggestion}`);
    expect(mergePromptSuggestion(`  ${current}\n`, suggestion)).toBe(`  ${current}\n${suggestion}`);
  });

  it('自定义保存名只能修改主文件名，扩展名大小写可兼容', () => {
    expect(preservesAttachmentExtension('测试.PNG', 'avatar.png')).toBe(true);
    expect(preservesAttachmentExtension('测试', 'avatar.png')).toBe(true);
    expect(preservesAttachmentExtension('测试.jpg', 'avatar.png')).toBe(false);
  });
});
