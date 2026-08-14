import { reactive } from 'vue';
import type { CommunityChatImage, CommunityChatMessageReply } from '@/api/communityChatApi';

const MAX_REMEMBERED_DRAFTS = 32;

export interface CommunityChatDraftMentionTarget {
  key: string;
  name: string;
  communityId?: string;
  userPublicId?: string;
  messagePublicId?: string;
}

export interface CommunityChatComposerDraftSession {
  identityKey: string;
  roomSlug: string;
  text: string;
  replyTarget: CommunityChatMessageReply | null;
  mentionTargets: CommunityChatDraftMentionTarget[];
  mentionEveryone: boolean;
  pendingImages: CommunityChatImage[];
  imageUploadsInFlight: number;
  sending: boolean;
  pendingClientRequestId: string | null;
  updatedAt: number;
}

const draftMemory = new Map<string, CommunityChatComposerDraftSession>();

function draftKey(identityKey: string, roomSlug: string) {
  return `${String(identityKey || '').trim()}::${String(roomSlug || '').trim()}`;
}

function createDraftSession(identityKey = '', roomSlug = ''): CommunityChatComposerDraftSession {
  return reactive({
    identityKey,
    roomSlug,
    text: '',
    replyTarget: null,
    mentionTargets: [],
    mentionEveryone: false,
    pendingImages: [],
    imageUploadsInFlight: 0,
    sending: false,
    pendingClientRequestId: null,
    updatedAt: Date.now(),
  });
}

function sessionOwnsPendingUpload(session: CommunityChatComposerDraftSession) {
  return session.pendingImages.length > 0 || session.imageUploadsInFlight > 0 || session.sending;
}

function trimDraftMemory() {
  while (draftMemory.size > MAX_REMEMBERED_DRAFTS) {
    // 已上传但尚未发送的图片由服务器绑定当前用户并设置过期时间。运行期内不能为了 LRU
    // 直接丢弃这类会话，否则用户切回页面时会无提示地丢失附件；优先淘汰无附件会话。
    const oldestDisposableKey = [...draftMemory.entries()].find(
      ([, session]) => !sessionOwnsPendingUpload(session),
    )?.[0];
    if (!oldestDisposableKey) break;
    draftMemory.delete(oldestDisposableKey);
  }
}

/**
 * 创建尚未绑定账号和聊天室的占位会话，仅供组件 setup 首帧使用，不进入全局运行期缓存。
 */
export function createCommunityChatDraftSession() {
  return createDraftSession();
}

/**
 * 获取账号 + 聊天室隔离的运行期输入会话。同一 key 始终返回同一个响应式对象，
 * 因此页面切换只需重新绑定，无需复制/反序列化文字、回复、提及和待发送图片。
 */
export function getCommunityChatDraftSession(identityKey: string, roomSlug: string) {
  const normalizedIdentityKey = String(identityKey || '').trim();
  const normalizedRoomSlug = String(roomSlug || '').trim();
  if (!normalizedIdentityKey || !normalizedRoomSlug) return createDraftSession();

  const key = draftKey(normalizedIdentityKey, normalizedRoomSlug);
  const existing = draftMemory.get(key);
  if (existing) {
    touchCommunityChatDraftSession(existing);
    return existing;
  }

  const session = createDraftSession(normalizedIdentityKey, normalizedRoomSlug);
  draftMemory.set(key, session);
  trimDraftMemory();
  return session;
}

export function touchCommunityChatDraftSession(session: CommunityChatComposerDraftSession) {
  session.updatedAt = Date.now();
  const key = draftKey(session.identityKey, session.roomSlug);
  if (!session.identityKey || !session.roomSlug || draftMemory.get(key) !== session) return;
  draftMemory.delete(key);
  draftMemory.set(key, session);
  trimDraftMemory();
}

/** 测试和身份环境重置使用；正常路由切换不应调用。 */
export function clearCommunityChatDraftMemory() {
  draftMemory.clear();
}
