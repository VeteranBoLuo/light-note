import multer from 'multer';
import os from 'node:os';
import express from 'express';
import * as feed from '../router_handle/communityFeedHandle.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { capabilities, preferences, updatePreferences } from '../router_handle/communityPreferenceHandle.js';
const router = express.Router();
const writeLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => `community-preferences:${req.user?.id || ipKeyGenerator(req.ip || '')}`,
  standardHeaders: true,
  legacyHeaders: false,
});
const imageUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 } }).single(
  'file',
);
router.post(
  '/images',
  writeLimit,
  (req, res, next) => {
    if (req.adminContext || !req.user?.id || req.user.role === 'visitor') return res.sendStatus(403);
    imageUpload(req, res, (error) =>
      error
        ? res.status(400).send({ status: 400, data: { code: 'COMMUNITY_IMAGE_INVALID' }, msg: '图片上传失败' })
        : next(),
    );
  },
  feed.uploadImage,
);
router.post('/resources/prepare', writeLimit, feed.prepareResource);
router.get('/resources/eligible', feed.eligibleResources);
router.get('/resources/:id', feed.resource);
router.post('/resources/:id/discard', writeLimit, feed.discardResource);
router.get('/images/:id', feed.image);
router.post('/images/:id/discard', writeLimit, feed.discardImage);
router.get('/capabilities', capabilities);
router.get('/preferences/me', preferences);
router.put('/preferences/me', writeLimit, updatePreferences);
router.get('/feed/capabilities', feed.feedCapabilities);
router.get('/topics', feed.topics);
router.get('/topics/:slug', feed.topicDetail);
router.get('/moderation/topics', feed.managedTopics);
router.post('/moderation/topics', writeLimit, feed.saveTopic);
router.get('/members', feed.members);
router.get('/posts', feed.listPosts);
router.get('/posts/:id', feed.postDetail);
router.get('/posts/:postId/avatar', feed.profileAvatar);
router.post('/posts', writeLimit, feed.submitPost);
router.post('/posts/withdraw', writeLimit, feed.withdrawPost);
router.post('/posts/delete', writeLimit, feed.deletePost);
router.post('/posts/state', writeLimit, feed.postState);
router.post('/posts/resolve', writeLimit, feed.resolveQuestion);
router.get('/own/posts', feed.ownPosts);
router.get('/own/comments', feed.ownComments);
router.get('/own/results', feed.results);
router.get('/comments', feed.listComments);
router.get('/comments/context', feed.commentContext);
router.post('/comments', writeLimit, feed.createComment);
router.post('/comments/state', writeLimit, feed.commentState);
router.post('/comments/withdraw', writeLimit, feed.withdrawComment);
router.get('/profiles/options/me', feed.profileOptions);
router.put('/profiles/options/me', writeLimit, feed.updateProfileOptions);
router.get('/profiles/:id', feed.publicProfile);
router.get('/profiles/:id/avatar', feed.profileAvatar);
router.get('/relations', feed.relationList);
router.put('/relations', writeLimit, feed.relation);
router.post('/reports', writeLimit, feed.reportContent);
router.post('/appeals', writeLimit, feed.appeal);
router.get('/operations/:id', feed.receipt);
router.get('/moderation/posts', feed.pendingPosts);
router.get('/moderation/queue', feed.moderationQueue);
router.post('/moderation/reports', writeLimit, feed.dismissReport);
router.post('/moderation/posts', writeLimit, feed.moderatePost);
router.post('/moderation/comments', writeLimit, feed.moderateComment);
router.post('/moderation/appeals', writeLimit, feed.reviewAppeal);
export default router;
