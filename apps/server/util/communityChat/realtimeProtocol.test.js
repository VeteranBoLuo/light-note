import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION,
  CommunityChatRealtimeProtocolError,
  createCommunityChatBroadcastEvent,
  normalizeCommunityChatBroadcastEvent,
  parseCommunityChatClientMessage,
} from './realtimeProtocol.js';

function subscription(overrides = {}) {
  return Buffer.from(
    JSON.stringify({
      protocolVersion: COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION,
      type: 'room.subscribe',
      requestId: 'subscribe-0001',
      payload: { roomSlug: 'general' },
      ...overrides,
    }),
  );
}

function onlineMembersRequest(overrides = {}) {
  return Buffer.from(
    JSON.stringify({
      protocolVersion: COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION,
      type: 'presence.members.request',
      requestId: 'presence-0001',
      payload: {},
      ...overrides,
    }),
  );
}

describe('communityChat realtime protocol', () => {
  it('只接受唯一公共房间的最小订阅消息', () => {
    expect(parseCommunityChatClientMessage(subscription())).toEqual({
      protocolVersion: 1,
      type: 'room.subscribe',
      requestId: 'subscribe-0001',
      payload: { roomSlug: 'general' },
    });
  });

  it('允许只用于游客去重的稳定客户端标识，但拒绝伪造身份或非法标识', () => {
    const parsed = parseCommunityChatClientMessage(
      subscription({ payload: { roomSlug: 'general', presenceClientId: 'device-12345678-abcd' } }),
    );
    expect(parsed.payload).toEqual({ roomSlug: 'general', presenceClientId: 'device-12345678-abcd' });
    expect(() =>
      parseCommunityChatClientMessage(subscription({ payload: { roomSlug: 'general', presenceClientId: 'short' } })),
    ).toThrowError(expect.objectContaining({ code: 'REALTIME_PRESENCE_CLIENT_ID_INVALID' }));
  });

  it('在线成员请求不允许客户端提交用户、角色或筛选条件', () => {
    expect(parseCommunityChatClientMessage(onlineMembersRequest())).toEqual({
      protocolVersion: 1,
      type: 'presence.members.request',
      requestId: 'presence-0001',
      payload: {},
    });
    expect(() =>
      parseCommunityChatClientMessage(onlineMembersRequest({ payload: { role: 'root' } })),
    ).toThrowError(expect.objectContaining({ code: 'REALTIME_PRESENCE_REQUEST_FIELDS_INVALID' }));
  });

  it('拒绝客户端提交 userId、role 或未知房间', () => {
    expect(() => parseCommunityChatClientMessage(subscription({ userId: 'root-user' }))).toThrowError(
      CommunityChatRealtimeProtocolError,
    );
    expect(() =>
      parseCommunityChatClientMessage(subscription({ payload: { roomSlug: 'general', role: 'root' } })),
    ).toThrowError(expect.objectContaining({ code: 'REALTIME_SUBSCRIPTION_FIELDS_INVALID' }));
    expect(() =>
      parseCommunityChatClientMessage(subscription({ payload: { roomSlug: 'announcements' } })),
    ).toThrowError(expect.objectContaining({ code: 'REALTIME_ROOM_UNAVAILABLE' }));
  });

  it('协议版本错误与超限载荷分别使用协议错误和消息过大关闭码', () => {
    expect(() => parseCommunityChatClientMessage(subscription({ protocolVersion: 99 }))).toThrowError(
      expect.objectContaining({ code: 'REALTIME_PROTOCOL_UNSUPPORTED', closeCode: 1002 }),
    );
    expect(() => parseCommunityChatClientMessage('x'.repeat(5000))).toThrowError(
      expect.objectContaining({ code: 'REALTIME_PAYLOAD_TOO_LARGE', closeCode: 1009 }),
    );
  });

  it('广播只携带房间与公有消息 ID，不透传额外对象', () => {
    const event = createCommunityChatBroadcastEvent('message.created', {
      roomSlug: 'general',
      messagePublicId: 'message-0001',
      userId: 'internal-user',
      content: '不应进入实时包',
    });

    expect(event.payload).toEqual({ roomSlug: 'general', messagePublicId: 'message-0001' });
    expect(JSON.stringify(event)).not.toContain('internal-user');
    expect(JSON.stringify(event)).not.toContain('不应进入实时包');
    expect(normalizeCommunityChatBroadcastEvent(event)).toEqual(event);

    const updated = createCommunityChatBroadcastEvent('message.updated', {
      roomSlug: 'general',
      messagePublicId: 'message-0001',
      reason: 'like',
      likeCount: 99,
    });
    expect(updated.payload).toEqual({ roomSlug: 'general', messagePublicId: 'message-0001', reason: 'like' });
    expect(updated.payload).not.toHaveProperty('likeCount');
  });
});
