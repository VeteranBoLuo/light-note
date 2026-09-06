import {
  COMMUNITY_CHAT_ATTACHMENT_MAX_COUNT,
  COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER,
  COMMUNITY_CHAT_IMAGE_MAX_BYTES,
} from '@lightnote/shared/community-chat-attachments';

export {
  COMMUNITY_CHAT_IMAGE_MAX_BYTES,
  COMMUNITY_CHAT_ATTACHMENT_MAX_COUNT as COMMUNITY_CHAT_IMAGE_MAX_COUNT,
  COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER as COMMUNITY_CHAT_IMAGE_MAX_PENDING_PER_USER,
};

/**
 * null 表示不设置“每条消息图片张数”的产品限制；格式、单图体积、像素与上传频率仍独立受控。
 */
export function resolveCommunityChatImageAttachmentLimit(user) {
  return user?.role === 'root' ? null : COMMUNITY_CHAT_ATTACHMENT_MAX_COUNT;
}

/** Root 可以跨批次准备更多附件，普通账号继续限制未绑定图片，避免遗留对象堆积。 */
export function resolveCommunityChatPendingImageLimit(user) {
  return user?.role === 'root' ? null : COMMUNITY_CHAT_ATTACHMENT_MAX_PENDING_PER_USER;
}
