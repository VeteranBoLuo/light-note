import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import multer from 'multer';
import os from 'node:os';
import { COMMUNITY_CHAT_IMAGE_MAX_BYTES } from '../util/services/communityChatImageService.js';
import * as handle from '../router_handle/communityChatHandle.js';

const router = express.Router();

const accessWriteLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `community-chat-access:${req.user?.id || ipKeyGenerator(req.ip || '')}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '操作过于频繁，请稍后再试' }),
});

const messageWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `community-chat-message:${req.user?.id || ipKeyGenerator(req.ip || '')}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '发送过于频繁，请稍后再试' }),
});

const memberSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => `community-chat-member-search:${req.user?.id || ipKeyGenerator(req.ip || '')}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '搜索过于频繁，请稍后再试' }),
});

const governanceWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `community-chat-governance:${req.user?.id || ipKeyGenerator(req.ip || '')}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '操作过于频繁，请稍后再试' }),
});

const profileWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `community-chat-profile:${req.user?.id || ipKeyGenerator(req.ip || '')}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '保存过于频繁，请稍后再试' }),
});

const imageWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  keyGenerator: (req) => `community-chat-image:${req.user?.id || ipKeyGenerator(req.ip || '')}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '图片上传过于频繁，请稍后再试' }),
});

const imageUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: COMMUNITY_CHAT_IMAGE_MAX_BYTES, files: 1 },
});

function receiveChatImage(req, res, next) {
  imageUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    return handle.imageUploadError(req, res, error);
  });
}

router.get('/access', handle.access);
router.post('/access-requests', accessWriteLimiter, handle.requestAccess);
router.post('/membership/accept-rules', accessWriteLimiter, handle.acceptRules);
router.get('/rooms', handle.rooms);
router.post('/identity', profileWriteLimiter, handle.ensureIdentity);
router.get('/settings/notifications', handle.notificationSettings);
router.put('/settings/notifications', governanceWriteLimiter, handle.updateNotificationSettings);
router.get('/rooms/:slug/pin', handle.pinnedMessage);
router.get('/rooms/:slug/messages', handle.messages);
router.post('/rooms/:slug/messages', messageWriteLimiter, handle.createMessage);
router.get('/members/search', memberSearchLimiter, handle.searchMembers);
router.get('/members/:userPublicId/avatar', handle.memberAvatar);
router.get('/stickers', handle.customStickers);
router.post(
  '/stickers',
  handle.requireImageUploadIdentity,
  imageWriteLimiter,
  receiveChatImage,
  handle.uploadCustomSticker,
);
router.get('/stickers/:publicId/content', handle.customStickerContent);
router.post('/stickers/:publicId/remove', imageWriteLimiter, handle.removeCustomSticker);
router.post(
  '/rooms/:slug/images',
  handle.requireImageUploadIdentity,
  imageWriteLimiter,
  receiveChatImage,
  handle.uploadImage,
);
router.put('/rooms/:slug/read', handle.markRoomRead);
router.get('/messages/:publicId/author-profile', handle.messageAuthorProfile);
router.get('/messages/:publicId/author-profile/achievements', handle.messageAuthorAchievements);
router.get('/messages/:publicId/author-avatar', handle.messageAuthorAvatar);
router.get('/presence/members/:token/avatar', handle.presenceMemberAvatar);
router.get('/profile/me', handle.ownProfile);
router.put('/profile/me', profileWriteLimiter, handle.updateOwnProfile);
// 兼容尚未升级的本地或旧版客户端；生产代理使用 PUT 作为公开写入方法。
router.patch('/profile/me', profileWriteLimiter, handle.updateOwnProfile);
router.get('/profile/me/avatar', handle.ownProfileAvatar);
router.put('/messages/:publicId/like', messageWriteLimiter, handle.toggleMessageLike);
router.post('/messages/:publicId/pin', governanceWriteLimiter, handle.pinMessage);
router.post('/messages/:publicId/unpin', governanceWriteLimiter, handle.unpinMessage);
router.post('/messages/:publicId/recall', governanceWriteLimiter, handle.recallMessage);
router.post('/messages/:publicId/delete', governanceWriteLimiter, handle.deleteMessage);
router.post('/messages/:publicId/report', governanceWriteLimiter, handle.reportMessage);
router.post('/messages/:publicId/block-author', governanceWriteLimiter, handle.blockMessageAuthor);
router.get('/images/:publicId', handle.image);
router.post('/images/:publicId/discard', imageWriteLimiter, handle.discardImage);
router.get('/blocks', handle.blocks);
router.post('/blocks/:blockId/unblock', governanceWriteLimiter, handle.unblockUser);

router.get('/admin/access-requests', handle.listAccessRequests);
router.post('/admin/access-requests/:userId/review', handle.reviewAccessRequest);
router.post('/admin/members/:userId/revoke', handle.revokeMember);
router.get('/admin/runtime-policy', handle.runtimePolicy);
router.put('/admin/runtime-policy', governanceWriteLimiter, handle.updateRuntimePolicy);
router.get('/admin/reports', handle.listReports);
router.post('/admin/reports/:reportId/review', handle.reviewReport);

export default router;
