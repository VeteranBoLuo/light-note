import { L, reqLang, resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { recordServerOperation } from '../util/operationLog.js';
import {
  CommunityChatError,
  acceptCommunityChatRules,
  getCommunityChatAccess,
  getCommunityChatRuntimePolicyForAdmin,
  listCommunityChatAccessRequests,
  listCommunityChatRooms,
  requestCommunityChatAccess,
  reviewCommunityChatAccessRequest,
  revokeCommunityChatMember,
  updateCommunityChatRuntimePolicy,
} from '../util/services/communityChatAccessService.js';
import {
  createCommunityChatMessage,
  deleteCommunityChatMessage,
  getCommunityChatPinnedMessage,
  getCommunityChatMessageAuthorAvatar,
  listCommunityChatMessages,
  markCommunityChatRoomRead,
  pinCommunityChatMessage,
  recallCommunityChatMessage,
  toggleCommunityChatMessageLike,
  unpinCommunityChatMessage,
} from '../util/services/communityChatMessageService.js';
import {
  getCommunityChatMessageAuthorAchievements,
  getCommunityChatMessageAuthorProfile,
  getCommunityChatOwnProfile,
  getCommunityChatOwnProfileAvatar,
  getCommunityChatPresenceMemberAvatar,
  updateCommunityChatOwnProfile,
} from '../util/services/communityChatProfileService.js';
import {
  discardCommunityChatImage,
  getCommunityChatImageDownload,
  uploadCommunityChatImage,
} from '../util/services/communityChatImageService.js';
import {
  blockCommunityChatMessageAuthor,
  listCommunityChatBlocks,
  listCommunityChatReports,
  reportCommunityChatMessage,
  reviewCommunityChatReport,
  unblockCommunityChatUser,
} from '../util/services/communityChatModerationService.js';
import {
  getCommunityChatNotificationSettings,
  updateCommunityChatNotificationSettings,
} from '../util/services/communityChatNotificationService.js';
import {
  ensureCommunityChatIdentityForUser,
  getCommunityChatMemberAvatarSource,
  searchCommunityChatMembers,
} from '../util/services/communityChatIdentityService.js';
import {
  getCommunityChatCustomStickerDownload,
  listCommunityChatCustomStickers,
  removeCommunityChatCustomSticker,
  uploadCommunityChatCustomSticker,
} from '../util/services/communityChatCustomStickerService.js';

function rejectAdminPreview(req, res) {
  if (!req.adminContext) return false;
  res
    .status(403)
    .send(
      resultData(
        { code: 'COMMUNITY_CHAT_ADMIN_PREVIEW_FORBIDDEN' },
        403,
        L(
          req,
          '聊天室身份不能通过管理员预览代用，请退出预览后使用自己的账号操作',
          'Community identity cannot be impersonated through admin preview. Exit preview and use your own account.',
        ),
      ),
    );
  return true;
}

function requireRegistered(req, res) {
  if (req.user?.id && req.user.role !== 'visitor') return true;
  res
    .status(403)
    .send(resultData({ code: 'LOGIN_REQUIRED' }, 403, L(req, '请先注册或登录', 'Please register or sign in first')));
  return false;
}

const COMMUNITY_CHAT_NOTIFICATION_LEVEL_LOG_LABELS = Object.freeze({
  official: '仅管理员',
  mentions_only: '仅提及',
  mentions: '管理员和提及',
  all: '全部消息',
});

async function recordCommunityChatNotificationSettingsOperation(req, settings) {
  const enabledLabel = settings?.enabled ? '开启' : '关闭';
  const levelLabel = COMMUNITY_CHAT_NOTIFICATION_LEVEL_LOG_LABELS[settings?.level] || '未知范围';
  try {
    await recordServerOperation(req, {
      module: '公共聊天室',
      operation: `保存聊天室提醒设置【${enabledLabel}；范围：${levelLabel}】`,
    });
  } catch (error) {
    // 设置已经由领域事务提交；日志异常不能把成功操作伪装成保存失败。
    console.error('[社区客厅] 提醒设置操作日志写入失败 code=%s', stableAgentErrorCode(error));
  }
}

// multer 解析文件前先拒绝游客和管理员预览身份，避免未授权请求写入系统临时目录。
export function requireImageUploadIdentity(req, res, next) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  return next();
}

export function imageUploadError(req, res, error) {
  const tooLarge = error?.code === 'LIMIT_FILE_SIZE';
  return res
    .status(tooLarge ? 413 : 400)
    .send(
      resultData(
        { code: tooLarge ? 'COMMUNITY_CHAT_IMAGE_TOO_LARGE' : 'COMMUNITY_CHAT_IMAGE_UPLOAD_INVALID' },
        tooLarge ? 413 : 400,
        tooLarge
          ? L(req, '单张图片不能超过 5MB', 'Each image must be 5MB or smaller')
          : L(req, '图片上传请求不合法', 'Invalid image upload request'),
      ),
    );
}

function requireRoot(req, res) {
  if (req.user?.id && req.user.role === 'root') return true;
  res
    .status(403)
    .send(resultData({ code: 'ROOT_REQUIRED' }, 403, L(req, '没有操作权限', 'You do not have permission')));
  return false;
}

function sendError(req, res, error) {
  if (error instanceof CommunityChatError) {
    return res
      .status(error.status)
      .send(resultData({ code: error.code }, error.status, L(req, error.zhMessage, error.enMessage)));
  }
  console.error('[社区客厅] 请求失败 code=%s', stableAgentErrorCode(error));
  return res
    .status(500)
    .send(
      resultData(
        { code: 'COMMUNITY_CHAT_UNAVAILABLE' },
        500,
        L(req, '社区客厅暂时不可用，请稍后重试', 'The community lounge is temporarily unavailable'),
      ),
    );
}

export async function access(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    return res.send(resultData(await getCommunityChatAccess({ user: req.user })));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function requestAccess(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await requestCommunityChatAccess({ user: req.user, message: req.body?.message });
    return res.send(resultData(data, 200, L(req, '内测申请已提交', 'Pilot access request submitted')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function acceptRules(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await acceptCommunityChatRules({ user: req.user, rulesVersion: req.body?.rulesVersion });
    return res.send(resultData(data, 200, L(req, '社区规则已确认', 'Community rules accepted')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function rooms(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    return res.send(resultData(await listCommunityChatRooms({ user: req.user, locale: reqLang(req) })));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function ensureIdentity(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    return res.send(resultData(await ensureCommunityChatIdentityForUser({ user: req.user })));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function notificationSettings(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    return res.send(resultData(await getCommunityChatNotificationSettings({ user: req.user })));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function updateNotificationSettings(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await updateCommunityChatNotificationSettings({
      user: req.user,
      enabled: req.body?.enabled,
      level: req.body?.level,
    });
    await recordCommunityChatNotificationSettingsOperation(req, data);
    return res.send(resultData(data, 200, L(req, '聊天室提醒设置已保存', 'Chat notification settings saved')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function messages(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    const data = await listCommunityChatMessages({
      user: req.user,
      roomSlug: req.params?.slug,
      before: req.query?.before,
      focus: req.query?.focus,
      limit: req.query?.limit,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function pinnedMessage(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    const data = await getCommunityChatPinnedMessage({
      user: req.user,
      roomSlug: req.params?.slug,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function createMessage(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await createCommunityChatMessage({
      user: req.user,
      roomSlug: req.params?.slug,
      clientRequestId: req.body?.clientRequestId,
      content: req.body?.content,
      messageKind: req.body?.messageKind,
      stickerSource: req.body?.stickerSource,
      stickerKey: req.body?.stickerKey,
      replyToPublicId: req.body?.replyToPublicId,
      mentionEveryone: req.body?.mentionEveryone,
      mentionUserPublicIds: req.body?.mentionUserPublicIds,
      mentionMessagePublicIds: req.body?.mentionMessagePublicIds,
      imagePublicIds: req.body?.imagePublicIds,
    });
    return res.send(resultData(data, 200, L(req, '消息已发送', 'Message sent')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function searchMembers(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await searchCommunityChatMembers({
      user: req.user,
      roomSlug: req.query?.roomSlug || 'general',
      query: req.query?.q,
      limit: req.query?.limit,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function customStickers(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    return res.send(resultData(await listCommunityChatCustomStickers({ user: req.user })));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function uploadCustomSticker(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await uploadCommunityChatCustomSticker({
      user: req.user,
      file: req.file,
      name: req.body?.name,
    });
    return res.send(resultData(data, 200, L(req, '表情已加入个人表情库', 'Sticker added to your library')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function removeCustomSticker(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await removeCommunityChatCustomSticker({
      user: req.user,
      stickerPublicId: req.params?.publicId,
    });
    return res.send(resultData(data, 200, L(req, '表情已从个人表情库移除', 'Sticker removed from your library')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function customStickerContent(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    const data = await getCommunityChatCustomStickerDownload({
      user: req.user,
      stickerPublicId: req.params?.publicId,
    });
    res.set('Cache-Control', 'private, max-age=60');
    return res.redirect(302, data.signedUrl);
  } catch (error) {
    if (error instanceof CommunityChatError && error.status === 404) return res.status(404).end();
    return sendError(req, res, error);
  }
}

export async function uploadImage(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await uploadCommunityChatImage({
      user: req.user,
      roomSlug: req.params?.slug,
      file: req.file,
    });
    return res.send(resultData(data, 200, L(req, '图片已就绪', 'Image ready')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function image(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    const data = await getCommunityChatImageDownload({
      user: req.user,
      imagePublicId: req.params?.publicId,
    });
    res.set('Cache-Control', 'private, max-age=60');
    return res.redirect(302, data.signedUrl);
  } catch (error) {
    if (error instanceof CommunityChatError && error.status === 404) return res.status(404).end();
    return sendError(req, res, error);
  }
}

export async function discardImage(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await discardCommunityChatImage({
      user: req.user,
      imagePublicId: req.params?.publicId,
    });
    return res.send(resultData(data, 200, L(req, '图片已移除', 'Image discarded')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function messageAuthorProfile(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    const data = await getCommunityChatMessageAuthorProfile({
      user: req.user,
      messagePublicId: req.params?.publicId,
      locale: reqLang(req),
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function messageAuthorAchievements(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    const data = await getCommunityChatMessageAuthorAchievements({
      user: req.user,
      messagePublicId: req.params?.publicId,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

function sendProfileAvatar(req, res, source) {
  res.set('Cache-Control', 'private, max-age=300');
  res.set('X-Content-Type-Options', 'nosniff');
  if (/^https?:\/\//i.test(source)) return res.redirect(302, source);

  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(source);
  const body = match ? Buffer.from(match[2], 'base64') : null;
  if (!match || !body?.length || body.length > 524288) {
    return res
      .status(404)
      .send(
        resultData(
          { code: 'COMMUNITY_CHAT_AUTHOR_AVATAR_NOT_FOUND' },
          404,
          L(req, '头像当前不可用', 'Avatar is unavailable'),
        ),
      );
  }
  return res.type(match[1]).send(body);
}

export async function messageAuthorAvatar(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    const { source } = await getCommunityChatMessageAuthorAvatar({
      user: req.user,
      messagePublicId: req.params?.publicId,
    });
    return sendProfileAvatar(req, res, source);
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function memberAvatar(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    const { source } = await getCommunityChatMemberAvatarSource({
      user: req.user,
      userPublicId: req.params?.userPublicId,
    });
    return sendProfileAvatar(req, res, source);
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function ownProfile(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await getCommunityChatOwnProfile({ user: req.user, locale: reqLang(req) });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function updateOwnProfile(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await updateCommunityChatOwnProfile({
      user: req.user,
      bio: req.body?.bio,
      showCommunityTenure: req.body?.showCommunityTenure,
      featuredAchievementKeys: req.body?.featuredAchievementKeys,
      baseRevision: req.body?.baseRevision,
      locale: reqLang(req),
    });
    return res.send(resultData(data, 200, L(req, '社区名片已保存', 'Community profile saved')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function ownProfileAvatar(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const { source } = await getCommunityChatOwnProfileAvatar({ user: req.user });
    return sendProfileAvatar(req, res, source);
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function presenceMemberAvatar(req, res) {
  if (rejectAdminPreview(req, res)) return;
  try {
    const { source } = await getCommunityChatPresenceMemberAvatar({
      user: req.user,
      token: req.params?.token,
    });
    return sendProfileAvatar(req, res, source);
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function markRoomRead(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await markCommunityChatRoomRead({
      user: req.user,
      roomSlug: req.params?.slug,
      lastMessagePublicId: req.body?.lastMessagePublicId,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function toggleMessageLike(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await toggleCommunityChatMessageLike({
      user: req.user,
      messagePublicId: req.params?.publicId,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function pinMessage(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await pinCommunityChatMessage({
      user: req.user,
      messagePublicId: req.params?.publicId,
    });
    return res.send(resultData(data, 200, L(req, '消息已置顶', 'Message pinned')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function unpinMessage(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await unpinCommunityChatMessage({
      user: req.user,
      messagePublicId: req.params?.publicId,
    });
    return res.send(resultData(data, 200, L(req, '已取消置顶', 'Message unpinned')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function recallMessage(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await recallCommunityChatMessage({
      user: req.user,
      messagePublicId: req.params?.publicId,
    });
    return res.send(resultData(data, 200, L(req, '消息已撤回', 'Message recalled')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function deleteMessage(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await deleteCommunityChatMessage({
      user: req.user,
      messagePublicId: req.params?.publicId,
    });
    return res.send(resultData(data, 200, L(req, '已从你的聊天记录删除', 'Removed from your chat history')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function reportMessage(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await reportCommunityChatMessage({
      user: req.user,
      messagePublicId: req.params?.publicId,
      reasonCode: req.body?.reasonCode,
      detail: req.body?.detail,
    });
    return res.send(resultData(data, 200, L(req, '举报已提交', 'Report submitted')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function blockMessageAuthor(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await blockCommunityChatMessageAuthor({
      user: req.user,
      messagePublicId: req.params?.publicId,
    });
    return res.send(resultData(data, 200, L(req, '已屏蔽该成员', 'Member blocked')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function blocks(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    return res.send(resultData(await listCommunityChatBlocks({ user: req.user })));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function unblockUser(req, res) {
  if (rejectAdminPreview(req, res) || !requireRegistered(req, res)) return;
  try {
    const data = await unblockCommunityChatUser({ user: req.user, blockId: req.params?.blockId });
    return res.send(resultData(data, 200, L(req, '已取消屏蔽', 'Member unblocked')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function listAccessRequests(req, res) {
  if (rejectAdminPreview(req, res) || !requireRoot(req, res)) return;
  try {
    const data = await listCommunityChatAccessRequests({
      user: req.user,
      status: req.query?.status,
      page: req.query?.page,
      pageSize: req.query?.pageSize,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function reviewAccessRequest(req, res) {
  if (rejectAdminPreview(req, res) || !requireRoot(req, res)) return;
  try {
    const data = await reviewCommunityChatAccessRequest({
      user: req.user,
      targetUserId: req.params?.userId,
      action: req.body?.action,
      note: req.body?.note,
    });
    return res.send(resultData(data, 200, L(req, '内测申请已处理', 'Pilot access request reviewed')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function revokeMember(req, res) {
  if (rejectAdminPreview(req, res) || !requireRoot(req, res)) return;
  try {
    const data = await revokeCommunityChatMember({
      user: req.user,
      targetUserId: req.params?.userId,
      reason: req.body?.reason,
    });
    return res.send(resultData(data, 200, L(req, '聊天室访问资格已撤销', 'Community chat access revoked')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function runtimePolicy(req, res) {
  if (rejectAdminPreview(req, res) || !requireRoot(req, res)) return;
  try {
    return res.send(resultData(await getCommunityChatRuntimePolicyForAdmin({ user: req.user })));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function updateRuntimePolicy(req, res) {
  if (rejectAdminPreview(req, res) || !requireRoot(req, res)) return;
  try {
    const data = await updateCommunityChatRuntimePolicy({
      user: req.user,
      postingEnabled: req.body?.postingEnabled,
      reason: req.body?.reason,
    });
    return res.send(resultData(data, 200, L(req, '聊天室运行状态已更新', 'Chat runtime state updated')));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function listReports(req, res) {
  if (rejectAdminPreview(req, res) || !requireRoot(req, res)) return;
  try {
    const data = await listCommunityChatReports({
      user: req.user,
      status: req.query?.status,
      page: req.query?.page,
      pageSize: req.query?.pageSize,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(req, res, error);
  }
}

export async function reviewReport(req, res) {
  if (rejectAdminPreview(req, res) || !requireRoot(req, res)) return;
  try {
    const data = await reviewCommunityChatReport({
      user: req.user,
      reportId: req.params?.reportId,
      action: req.body?.action,
      note: req.body?.note,
      durationMinutes: req.body?.durationMinutes,
    });
    return res.send(resultData(data, 200, L(req, '举报已处理', 'Report reviewed')));
  } catch (error) {
    return sendError(req, res, error);
  }
}
