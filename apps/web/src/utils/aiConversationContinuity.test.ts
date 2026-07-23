import { describe, expect, it } from 'vitest';
import {
  compareAiConversationRecency,
  decideAiConversationContinuity,
  type AiConversationRecency,
} from './aiConversationContinuity';

const conversation = (id: string, lastMessageAt: string): AiConversationRecency => ({ id, lastMessageAt });

describe('aiConversationContinuity', () => {
  it('新设备没有当前会话时直接加载云端最新会话', () => {
    expect(
      decideAiConversationContinuity({
        current: null,
        latest: conversation('latest', '2026-07-23T10:00:00.000Z'),
        checkpoint: null,
      }),
    ).toBe('load_latest');
  });

  it('当前设备已在云端最新会话时不提示切换', () => {
    const latest = conversation('same', '2026-07-23T10:00:00.000Z');
    expect(decideAiConversationContinuity({ current: latest, latest, checkpoint: null })).toBe('keep_current');
  });

  it('另一个会话在本设备上次检查后更新时提示切换', () => {
    expect(
      decideAiConversationContinuity({
        current: conversation('current', '2026-07-23T09:00:00.000Z'),
        latest: conversation('remote', '2026-07-23T10:00:00.000Z'),
        checkpoint: conversation('current', '2026-07-23T09:00:00.000Z'),
      }),
    ).toBe('offer_latest');
  });

  it('用户已经选择留在当前会话后，同一云端更新不再重复提示', () => {
    const latest = conversation('remote', '2026-07-23T10:00:00.000Z');
    expect(
      decideAiConversationContinuity({
        current: conversation('current', '2026-07-23T09:00:00.000Z'),
        latest,
        checkpoint: latest,
      }),
    ).toBe('keep_current');
  });

  it('同一秒更新使用服务端相同的 id 次序稳定比较', () => {
    const older = conversation('conversation-a', '2026-07-23T10:00:00.000Z');
    const newer = conversation('conversation-b', '2026-07-23T10:00:00.000Z');
    expect(compareAiConversationRecency(newer, older)).toBeGreaterThan(0);
  });
});
