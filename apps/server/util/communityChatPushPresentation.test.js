import { describe, expect, it, vi } from 'vitest';
import { communityChatPushPresentation, readCommunityChatPushPresentations } from './communityChatPushPresentation.js';

const env = { COMMUNITY_CHAT_ACCESS_MODE: 'public', COMMUNITY_CHAT_MESSAGING_ENABLED: 'true' };
const id = '11111111-1111-4111-8111-111111111111';
const notification = { id: 'n', type: 'community_chat', source_type: 'community_chat_message', source_id: id,
  meta: { kind: 'mention' } };

describe('chat notification preview', () => {
  it('bounds plain text and uses types for non-text messages', () => {
    expect(communityChatPushPresentation({ sender_name: '小明', content: '你好\n世界' }, 'mention'))
      .toEqual({ title: '小明提及了你', body: '你好 世界', visibility: 'SECRET' });
    expect(communityChatPushPresentation({ sender_name: '小明', has_image: 1 }, 'reply').body).toBe('[图片]');
    expect(communityChatPushPresentation({ sender_name: '小明', has_file: 1 }, 'reply').body).toBe('[文件]');
    expect(communityChatPushPresentation({ sender_name: '小明', message_kind: 'sticker' }, 'reply').body).toBe('[表情]');
    expect(communityChatPushPresentation({ sender_name: '小明', message_kind: 'poll', content: '选择时间' }, 'reply').body)
      .toBe('[投票] 选择时间');
    expect(Array.from(communityChatPushPresentation({ sender_name: 'a'.repeat(100), content: 'x'.repeat(300) }, 'reply').body))
      .toHaveLength(100);
  });
  it('requires current target, source and access checks before exposing message text', async () => {
    const db = { query: vi.fn().mockResolvedValue([[{
      public_id: id, sender_name: '小明', content: '请看这条消息', message_kind: 'text', has_image: 0, has_file: 0,
    }]]) };
    const result = await readCommunityChatPushPresentations(db, 'recipient', [notification], env);
    expect(result.get('n')).toMatchObject({ title: '小明提及了你', body: '请看这条消息' });
    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual(['recipient', [id]]);
    for (const check of ["message.status = 'active'", "room.status = 'active'", 'community_chat_blocks',
      'community_chat_message_deletions', 'message.mentioned_user_id = recipient.id',
    ]) expect(sql).toContain(check.replace('message.mentioned_user_id', 'mention.mentioned_user_id'));
    db.query.mockResolvedValueOnce([[]]);
    expect((await readCommunityChatPushPresentations(db, 'recipient', [notification], env)).size).toBe(0);
    expect((await readCommunityChatPushPresentations(db, 'recipient', [notification],
      { COMMUNITY_CHAT_ACCESS_MODE: 'closed' })).size).toBe(0);
  });
});
