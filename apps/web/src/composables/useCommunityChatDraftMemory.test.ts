import { beforeEach, describe, expect, it } from 'vitest';
import { clearCommunityChatDraftMemory, getCommunityChatDraftSession } from './useCommunityChatDraftMemory';

describe('community chat draft memory', () => {
  beforeEach(clearCommunityChatDraftMemory);

  it('按账号与频道隔离完整的输入会话', () => {
    const general = getCommunityChatDraftSession('user-1:user', 'general');
    general.text = '未发送内容';
    general.replyTarget = {
      publicId: 'message-1',
      content: '被回复的消息',
      status: 'active',
      authorName: '薄荷',
      hasImages: false,
    };
    general.mentionTargets = [{ key: 'user:user-2', name: '菠萝', userPublicId: 'user-2' }];
    general.pendingImages = [
      {
        publicId: 'image-1',
        url: '/api/community-chat/images/image-1',
        contentType: 'image/png',
        fileSize: 12,
        width: 640,
        height: 480,
      },
    ];
    general.sending = true;
    general.pendingClientRequestId = 'request-1';

    expect(getCommunityChatDraftSession('user-1:user', 'general')).toBe(general);
    expect(getCommunityChatDraftSession('user-1:user', 'general')).toMatchObject({
      text: '未发送内容',
      replyTarget: { publicId: 'message-1' },
      mentionTargets: [{ userPublicId: 'user-2' }],
      pendingImages: [{ publicId: 'image-1' }],
      sending: true,
      pendingClientRequestId: 'request-1',
    });
    expect(getCommunityChatDraftSession('user-1:user', 'help')).not.toBe(general);
    expect(getCommunityChatDraftSession('user-2:user', 'general').text).toBe('');
  });

  it('切回同一频道复用原响应式会话，发送成功后可原位清空', () => {
    const session = getCommunityChatDraftSession('user-1:user', 'general');
    session.text = '准备发送';
    session.mentionEveryone = true;

    const restored = getCommunityChatDraftSession('user-1:user', 'general');
    expect(restored).toBe(session);
    restored.text = '';
    restored.mentionEveryone = false;
    restored.sending = false;
    restored.pendingClientRequestId = null;

    expect(getCommunityChatDraftSession('user-1:user', 'general')).toBe(session);
    expect(session.text).toBe('');
    expect(session.mentionEveryone).toBe(false);
    expect(session.sending).toBe(false);
    expect(session.pendingClientRequestId).toBeNull();
  });
});
