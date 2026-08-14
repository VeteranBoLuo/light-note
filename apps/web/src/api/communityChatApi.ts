import { apiBaseGet, apiBasePost, apiBasePut } from '@/http/request';

export type CommunityChatAccessStatus =
  'login_required' | 'read_only' | 'closed' | 'not_invited' | 'requested' | 'rules_required' | 'active' | 'restricted';

export interface CommunityChatAccess {
  accessMode: 'closed' | 'invite_only' | 'public';
  waitlistEnabled: boolean;
  messagingEnabled: boolean;
  realtimeEnabled: boolean;
  postingEnabled: boolean;
  emergencyReadOnly: boolean;
  environmentReadOnly: boolean;
  notificationsDefaultEnabled: true;
  rulesVersion: string;
  authenticated: boolean;
  canManage: boolean;
  canRead: boolean;
  canPost: boolean;
  canEnter: boolean;
  canRequest: boolean;
  canAcceptRules: boolean;
  status: CommunityChatAccessStatus;
  requestStatus: 'pending' | 'approved' | 'rejected' | null;
  memberRole: 'member' | 'moderator' | 'admin' | null;
  notificationsEnabled: boolean;
  notificationLevel: CommunityChatNotificationLevel;
}

export interface CommunityChatRoom {
  slug: string;
  name: string;
  description: string;
  type: 'announcement' | 'text';
  status: 'active';
  notificationLevel: CommunityChatNotificationLevel | 'none';
  slowModeSeconds: number;
  sortOrder: number;
  unreadCount: number;
  mentionCount: number;
}

export type CommunityChatNotificationLevel = 'official' | 'mentions_only' | 'mentions' | 'all';

export interface CommunityChatNotificationSettings {
  enabled: boolean;
  level: CommunityChatNotificationLevel;
  defaultEnabled: true;
  replyCountsAsMention: true;
  channels: {
    inApp: { available: true; enabled: boolean };
    browser: { available: false; enabled: false };
    android: { available: false; enabled: false };
  };
}

export interface CommunityChatRoomDirectory {
  access: CommunityChatAccess;
  messagingEnabled: boolean;
  items: CommunityChatRoom[];
}

export interface CommunityChatMessageAuthor {
  name: string;
  userPublicId?: string;
  communityId?: string;
  role: 'member' | 'moderator' | 'official';
  avatar: string;
  frameId: string | null;
  frameRarity?: 'basic' | 'rare' | 'epic' | 'legendary' | null;
  level: number;
  levelName: string;
  title: string | null;
}

export interface CommunityChatPublicAchievement {
  key: string;
  group: 'checkin' | 'create' | 'action' | 'organize' | 'level' | 'tenure' | string;
}

export interface CommunityChatAuthorProfile extends CommunityChatMessageAuthor {
  bio: string;
  communityTenureLabel: string | null;
  achievements: CommunityChatPublicAchievement[];
  achievementCount: number;
  hasMoreAchievements: boolean;
}

export interface CommunityChatAchievementCollection {
  achievements: CommunityChatPublicAchievement[];
  achievementCount: number;
}

export interface CommunityChatOwnProfile {
  bio: string;
  showCommunityTenure: boolean;
  featuredAchievementKeys: string[];
  revision: number;
  usesDefaultFeaturedAchievements: boolean;
  availableAchievements: CommunityChatPublicAchievement[];
  publicPreview: CommunityChatAuthorProfile;
}

export interface CommunityChatMessageReply {
  publicId: string;
  content: string;
  status: 'active' | 'deleted' | 'hidden' | 'unavailable' | string;
  authorName: string;
  hasImages: boolean;
  hasSticker?: boolean;
}

export interface CommunityChatImage {
  publicId: string;
  url: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
  width: number;
  height: number;
}

export interface CommunityChatMentionItem {
  userPublicId: string;
  displayName: string;
  communityId: string;
}

export interface CommunityChatSticker {
  source: 'custom';
  key: string;
  url: string;
}

export interface CommunityChatMemberSearchItem {
  userPublicId: string;
  communityId: string;
  displayName: string;
  avatar: string;
  frameId: string | null;
  level: number;
  levelName: string;
  role: 'member' | 'moderator' | 'official';
  reason: 'official' | 'recent' | 'member';
}

export interface CommunityChatCustomSticker {
  publicId: string;
  name: string;
  url: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
  width: number;
  height: number;
  createdAt: string | null;
}

export interface CommunityChatMessage {
  publicId: string;
  content: string;
  messageKind?: 'text' | 'sticker';
  stickerSource?: 'custom' | null;
  stickerKey?: string | null;
  sticker?: CommunityChatSticker | null;
  status: 'active' | 'recalled';
  createdAt: string;
  editedAt: string | null;
  recalledAt: string | null;
  recalledByAdmin: boolean;
  canViewRecalledContent: boolean;
  canRecall: boolean;
  recallExpired: boolean;
  canDelete: boolean;
  recallDeadlineAt: string | null;
  isOwn: boolean;
  images: CommunityChatImage[];
  mentionEveryone?: boolean;
  mentions: string[];
  mentionItems?: CommunityChatMentionItem[];
  likeCount: number;
  likedByMe: boolean;
  likePreview: string[];
  deliveryState?: 'sending';
  author: CommunityChatMessageAuthor;
  reply: CommunityChatMessageReply | null;
}

export interface CommunityChatMessagePage {
  roomSlug: string;
  items: CommunityChatMessage[];
  hasMore: boolean;
  nextBefore: string | null;
  focusPublicId: string | null;
  hasNewer: boolean;
  realtimeEnabled: boolean;
  pollingAfterMs: number | null;
  serverTime: string;
}

export interface CommunityChatPinnedMessage {
  roomSlug: string;
  message: CommunityChatMessage | null;
}

export interface SendCommunityChatMessageInput {
  clientRequestId: string;
  content: string;
  messageKind?: 'text' | 'sticker';
  stickerSource?: 'custom' | null;
  stickerKey?: string | null;
  replyToPublicId?: string | null;
  mentionEveryone?: boolean;
  mentionUserPublicIds?: string[];
  mentionMessagePublicIds?: string[];
  imagePublicIds?: string[];
}

export type CommunityChatReportReason =
  'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'privacy' | 'fraud' | 'self_harm' | 'other';

export interface CommunityChatBlockItem {
  id: string;
  displayName: string;
  role: 'member' | 'moderator';
  createTime: string;
}

export type CommunityChatReportStatus = 'pending' | 'actioned' | 'dismissed';
export type CommunityChatModerationAction = 'dismiss' | 'hide_message' | 'mute_author' | 'ban_author';

export interface CommunityChatReportEvidence {
  messagePublicId: string;
  roomSlug: string;
  roomNameZh: string;
  roomNameEn: string;
  authorName: string;
  authorRole: 'member' | 'moderator' | 'official';
  content: string;
  messageCreatedAt: string;
  capturedAt: string;
}

export interface CommunityChatReportItem {
  id: string;
  reasonCode: CommunityChatReportReason;
  detail: string;
  evidenceSnapshot: CommunityChatReportEvidence;
  status: CommunityChatReportStatus;
  reviewNote: string;
  reviewedAt: string | null;
  createTime: string;
  messagePublicId: string;
  messageStatus: 'active' | 'hidden' | 'deleted' | string;
  roomSlug: string;
  reporterName: string;
  authorName: string;
  resolutionAction: CommunityChatModerationAction | null;
  actionExpiresAt: string | null;
}

export interface CommunityChatReportPage {
  items: CommunityChatReportItem[];
  total: number;
  page: number;
  pageSize: number;
  status: CommunityChatReportStatus;
}

export interface CommunityChatRuntimePolicy {
  messagingEnabled: boolean;
  postingEnabled: boolean;
  databasePostingEnabled: boolean;
  emergencyReadOnly: boolean;
  environmentReadOnly: boolean;
  updatedAt: string | null;
  changed?: boolean;
}

export const getCommunityChatAccess = () => apiBaseGet('/api/community-chat/access', undefined, { silent: true });

export const requestCommunityChatAccess = (message = '') =>
  apiBasePost('/api/community-chat/access-requests', { message }, { silent: true });

export const acceptCommunityChatRules = (rulesVersion: string) =>
  apiBasePost('/api/community-chat/membership/accept-rules', { rulesVersion }, { silent: true });

export const getCommunityChatRooms = () => apiBaseGet('/api/community-chat/rooms', undefined, { silent: true });

export const ensureCommunityChatIdentity = () => apiBasePost('/api/community-chat/identity', {}, { silent: true });

export const getCommunityChatNotificationSettings = () =>
  apiBaseGet('/api/community-chat/settings/notifications', undefined, { silent: true });

export const updateCommunityChatNotificationSettings = (input: {
  enabled: boolean;
  level: CommunityChatNotificationLevel;
}) => apiBasePut('/api/community-chat/settings/notifications', input, { silent: true });

const roomPath = (roomSlug: string) => `/api/community-chat/rooms/${encodeURIComponent(roomSlug)}`;

export const getCommunityChatMessages = (
  roomSlug: string,
  params: { before?: string; focus?: string; limit?: number } = {},
) => apiBaseGet(`${roomPath(roomSlug)}/messages`, params, { silent: true });

export const getCommunityChatPinnedMessage = (roomSlug: string) =>
  apiBaseGet(`${roomPath(roomSlug)}/pin`, undefined, { silent: true });

export const getCommunityChatMessageAuthorProfile = (messagePublicId: string) =>
  apiBaseGet(`/api/community-chat/messages/${encodeURIComponent(messagePublicId)}/author-profile`, undefined, {
    silent: true,
  });

export const getCommunityChatMessageAuthorAchievements = (messagePublicId: string) =>
  apiBaseGet(
    `/api/community-chat/messages/${encodeURIComponent(messagePublicId)}/author-profile/achievements`,
    undefined,
    { silent: true },
  );

export const getCommunityChatOwnProfile = () =>
  apiBaseGet('/api/community-chat/profile/me', undefined, { silent: true });

export const updateCommunityChatOwnProfile = (input: {
  bio: string;
  showCommunityTenure: boolean;
  featuredAchievementKeys: string[];
  baseRevision: number;
}) => apiBasePut('/api/community-chat/profile/me', input, { silent: true });

export const sendCommunityChatMessage = (roomSlug: string, input: SendCommunityChatMessageInput) =>
  apiBasePost(`${roomPath(roomSlug)}/messages`, input, { silent: true });

export const searchCommunityChatMembers = (params: { roomSlug: string; q?: string; limit?: number }) =>
  apiBaseGet('/api/community-chat/members/search', params, { silent: true });

export const getCommunityChatCustomStickers = () =>
  apiBaseGet('/api/community-chat/stickers', undefined, { silent: true });

export const uploadCommunityChatCustomSticker = (file: File, name = '') => {
  const formData = new FormData();
  formData.append('file', file);
  if (name.trim()) formData.append('name', name.trim());
  return apiBasePost('/api/community-chat/stickers', formData, { silent: true });
};

export const removeCommunityChatCustomSticker = (stickerPublicId: string) =>
  apiBasePost(`/api/community-chat/stickers/${encodeURIComponent(stickerPublicId)}/remove`, {}, { silent: true });

export const uploadCommunityChatImage = (roomSlug: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return apiBasePost(`${roomPath(roomSlug)}/images`, formData, { silent: true });
};

export const discardCommunityChatImage = (imagePublicId: string) =>
  apiBasePost(`/api/community-chat/images/${encodeURIComponent(imagePublicId)}/discard`, {}, { silent: true });

export const markCommunityChatRoomRead = (roomSlug: string, lastMessagePublicId?: string | null) =>
  apiBasePut(`${roomPath(roomSlug)}/read`, { lastMessagePublicId: lastMessagePublicId || null }, { silent: true });

const messagePath = (messagePublicId: string) => `/api/community-chat/messages/${encodeURIComponent(messagePublicId)}`;

export const saveCommunityChatMessageSticker = (messagePublicId: string) =>
  apiBasePost(`${messagePath(messagePublicId)}/save-sticker`, {}, { silent: true });

export const toggleCommunityChatMessageLike = (messagePublicId: string) =>
  apiBasePut(`${messagePath(messagePublicId)}/like`, {}, { silent: true });

export const pinCommunityChatMessage = (messagePublicId: string) =>
  apiBasePost(`${messagePath(messagePublicId)}/pin`, {}, { silent: true });

export const unpinCommunityChatMessage = (messagePublicId: string) =>
  apiBasePost(`${messagePath(messagePublicId)}/unpin`, {}, { silent: true });

export const recallCommunityChatMessage = (messagePublicId: string) =>
  apiBasePost(`${messagePath(messagePublicId)}/recall`, {}, { silent: true });

export const deleteCommunityChatMessage = (messagePublicId: string) =>
  apiBasePost(`${messagePath(messagePublicId)}/delete`, {}, { silent: true });

export const reportCommunityChatMessage = (
  messagePublicId: string,
  input: { reasonCode: CommunityChatReportReason; detail?: string },
) => apiBasePost(`${messagePath(messagePublicId)}/report`, input, { silent: true });

export const blockCommunityChatMessageAuthor = (messagePublicId: string) =>
  apiBasePost(`${messagePath(messagePublicId)}/block-author`, {}, { silent: true });

export const getCommunityChatBlocks = () => apiBaseGet('/api/community-chat/blocks', undefined, { silent: true });

export const unblockCommunityChatUser = (blockId: string) =>
  apiBasePost(`/api/community-chat/blocks/${encodeURIComponent(blockId)}/unblock`, {}, { silent: true });

export const getCommunityChatAdminRuntimePolicy = () =>
  apiBaseGet('/api/community-chat/admin/runtime-policy', undefined, { silent: true });

export const updateCommunityChatAdminRuntimePolicy = (input: { postingEnabled: boolean; reason: string }) =>
  apiBasePut('/api/community-chat/admin/runtime-policy', input, { silent: true });

export const getCommunityChatAdminReports = (
  params: { status?: CommunityChatReportStatus; page?: number; pageSize?: number } = {},
) => apiBaseGet('/api/community-chat/admin/reports', params, { silent: true });

export const reviewCommunityChatAdminReport = (
  reportId: string,
  input: { action: CommunityChatModerationAction; note: string; durationMinutes?: number | null },
) => apiBasePost(`/api/community-chat/admin/reports/${encodeURIComponent(reportId)}/review`, input, { silent: true });

export function createCommunityChatClientRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
