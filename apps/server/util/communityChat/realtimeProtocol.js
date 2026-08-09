import { randomUUID } from 'node:crypto';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG } from '../communityChatFeature.js';

export const COMMUNITY_CHAT_REALTIME_PATH = '/realtime/chat';
export const COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION = 1;
export const COMMUNITY_CHAT_REALTIME_MAX_CLIENT_PAYLOAD_BYTES = 4096;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{8,64}$/;
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9-]{1,36}$/;
const CLIENT_MESSAGE_KEYS = new Set(['protocolVersion', 'type', 'requestId', 'payload']);
const SUBSCRIBE_PAYLOAD_KEYS = new Set(['roomSlug']);
const BROADCAST_TYPES = new Set(['message.created', 'message.removed', 'runtime.changed', 'access.changed']);

export class CommunityChatRealtimeProtocolError extends Error {
  constructor(code, message, closeCode = 1008) {
    super(message);
    this.name = 'CommunityChatRealtimeProtocolError';
    this.code = code;
    this.closeCode = closeCode;
  }
}

const protocolError = (code, message, closeCode) => new CommunityChatRealtimeProtocolError(code, message, closeCode);

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function assertExactKeys(value, allowedKeys, code) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw protocolError(code, 'Realtime payload contains unsupported fields');
  }
}

function rawPayloadToString(raw) {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  throw protocolError('REALTIME_PAYLOAD_INVALID', 'Realtime payload must be UTF-8 JSON');
}

/**
 * 客户端目前只允许订阅唯一公共房间。身份、角色和内部 ID 没有可提交字段，
 * 因而即使恶意客户端尝试附带这些声明，也会因额外字段而失败关闭。
 */
export function parseCommunityChatClientMessage(raw) {
  const text = rawPayloadToString(raw);
  if (Buffer.byteLength(text, 'utf8') > COMMUNITY_CHAT_REALTIME_MAX_CLIENT_PAYLOAD_BYTES) {
    throw protocolError('REALTIME_PAYLOAD_TOO_LARGE', 'Realtime payload is too large', 1009);
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw protocolError('REALTIME_JSON_INVALID', 'Realtime payload must be valid JSON');
  }
  if (!isPlainObject(value)) throw protocolError('REALTIME_MESSAGE_INVALID', 'Realtime message must be an object');
  assertExactKeys(value, CLIENT_MESSAGE_KEYS, 'REALTIME_MESSAGE_FIELDS_INVALID');
  if (value.protocolVersion !== COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION) {
    throw protocolError('REALTIME_PROTOCOL_UNSUPPORTED', 'Unsupported realtime protocol version', 1002);
  }
  if (value.type !== 'room.subscribe') {
    throw protocolError('REALTIME_MESSAGE_TYPE_UNSUPPORTED', 'Unsupported realtime message type');
  }
  if (!REQUEST_ID_PATTERN.test(String(value.requestId || ''))) {
    throw protocolError('REALTIME_REQUEST_ID_INVALID', 'Realtime request identifier is invalid');
  }
  if (!isPlainObject(value.payload)) {
    throw protocolError('REALTIME_SUBSCRIPTION_INVALID', 'Realtime subscription payload is invalid');
  }
  assertExactKeys(value.payload, SUBSCRIBE_PAYLOAD_KEYS, 'REALTIME_SUBSCRIPTION_FIELDS_INVALID');
  if (value.payload.roomSlug !== COMMUNITY_CHAT_PRIMARY_ROOM_SLUG) {
    throw protocolError('REALTIME_ROOM_UNAVAILABLE', 'Realtime room is unavailable');
  }

  return {
    protocolVersion: COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION,
    type: 'room.subscribe',
    requestId: value.requestId,
    payload: { roomSlug: COMMUNITY_CHAT_PRIMARY_ROOM_SLUG },
  };
}

function assertPublicMessageId(value) {
  if (!PUBLIC_ID_PATTERN.test(String(value || ''))) {
    throw protocolError('REALTIME_EVENT_INVALID', 'Realtime event contains an invalid message identifier');
  }
}

function normalizeBroadcastPayload(type, payload) {
  if (!isPlainObject(payload)) throw protocolError('REALTIME_EVENT_INVALID', 'Realtime event payload is invalid');
  if (type === 'message.created' || type === 'message.removed') {
    if (payload.roomSlug !== COMMUNITY_CHAT_PRIMARY_ROOM_SLUG) {
      throw protocolError('REALTIME_EVENT_INVALID', 'Realtime event contains an invalid room');
    }
    assertPublicMessageId(payload.messagePublicId);
    return {
      roomSlug: COMMUNITY_CHAT_PRIMARY_ROOM_SLUG,
      messagePublicId: String(payload.messagePublicId),
      ...(type === 'message.removed' ? { reason: String(payload.reason || 'moderation').slice(0, 32) } : {}),
    };
  }
  if (type === 'runtime.changed') {
    return {
      postingEnabled: Boolean(payload.postingEnabled),
      emergencyReadOnly: Boolean(payload.emergencyReadOnly),
    };
  }
  if (type === 'access.changed') {
    return {
      reason: String(payload.reason || 'permissions_changed').slice(0, 64),
      disconnect: Boolean(payload.disconnect),
    };
  }
  throw protocolError('REALTIME_EVENT_TYPE_UNSUPPORTED', 'Unsupported realtime event type');
}

export function createCommunityChatServerEvent(type, payload = {}, options = {}) {
  const eventId = String(options.eventId || randomUUID());
  const serverTime = String(options.serverTime || new Date().toISOString());
  if (!PUBLIC_ID_PATTERN.test(eventId)) {
    throw protocolError('REALTIME_EVENT_ID_INVALID', 'Realtime event identifier is invalid');
  }
  if (!type || typeof type !== 'string') {
    throw protocolError('REALTIME_EVENT_TYPE_INVALID', 'Realtime event type is invalid');
  }
  return {
    protocolVersion: COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION,
    type,
    eventId,
    serverTime,
    ...(options.requestId ? { requestId: String(options.requestId).slice(0, 64) } : {}),
    payload,
  };
}

export function createCommunityChatBroadcastEvent(type, payload, options = {}) {
  if (!BROADCAST_TYPES.has(type)) {
    throw protocolError('REALTIME_EVENT_TYPE_UNSUPPORTED', 'Unsupported realtime event type');
  }
  return createCommunityChatServerEvent(type, normalizeBroadcastPayload(type, payload), options);
}

export function normalizeCommunityChatBroadcastEvent(value) {
  if (!isPlainObject(value) || value.protocolVersion !== COMMUNITY_CHAT_REALTIME_PROTOCOL_VERSION) {
    throw protocolError('REALTIME_EVENT_INVALID', 'Realtime event is invalid');
  }
  if (!BROADCAST_TYPES.has(value.type)) {
    throw protocolError('REALTIME_EVENT_TYPE_UNSUPPORTED', 'Unsupported realtime event type');
  }
  return createCommunityChatBroadcastEvent(value.type, value.payload, {
    eventId: value.eventId,
    serverTime: value.serverTime,
  });
}

export const __test__ = {
  BROADCAST_TYPES,
  isPlainObject,
  normalizeBroadcastPayload,
  rawPayloadToString,
};
