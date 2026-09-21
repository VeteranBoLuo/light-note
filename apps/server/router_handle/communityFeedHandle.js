import { savedPostResources } from '../util/communityFeed/saved.js';
import * as resources from '../util/communityFeed/resources.js';
import * as images from '../util/communityFeed/images.js';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs/promises';
import { resultData } from '../util/agent/data.js';
import {
  CommunityFeedError,
  capabilities,
  operationReceipt,
  access,
  first,
  loadPost,
} from '../util/communityFeed/core.js';
import * as topicService from '../util/communityFeed/topics.js';
import * as posts from '../util/communityFeed/posts.js';
import * as comments from '../util/communityFeed/comments.js';
import * as profiles from '../util/communityFeed/profiles.js';
import * as governance from '../util/communityFeed/governance.js';
import pool from '../db/index.js';
import { COMMUNITY_FEED_LIMITS } from '@lightnote/shared/community-feed';
export function handle(service, extra = () => ({}), previewRead = false) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.adminContext && (!previewRead || req.method !== 'GET' || !req.resourceUser?.id))
      return res
        .status(403)
        .send(
          resultData(
            { code: 'COMMUNITY_ADMIN_CONTEXT_FORBIDDEN' },
            403,
            '请退出管理员代管 / Exit administrator preview',
          ),
        );
    try {
      return res.send(
        resultData(
          await service({
            user: req.adminContext ? req.resourceUser : req.user,
            input: req.method === 'GET' ? req.query : req.body,
            ...extra(req),
            previewReadOnly: Boolean(req.adminContext),
          }),
        ),
      );
    } catch (error) {
      const known = error instanceof CommunityFeedError;
      const status = known ? error.status : 503;
      return res
        .status(status)
        .send(
          resultData(
            { code: known ? error.code : 'COMMUNITY_UNAVAILABLE' },
            status,
            '社区操作暂未完成，请保留输入后重试 / Community operation could not be completed. Keep your draft and retry.',
          ),
        );
    }
  };
}
const readHandle = (service, extra) => handle(service, extra, true);
export const feedCapabilities = readHandle(async ({ previewReadOnly }) => ({
  ...(await capabilities()),
  ...(previewReadOnly ? { writesEnabled: false } : {}),
  imagesEnabled: await images.imagesReady().catch(() => false),
  resourcesEnabled: await resources.resourcesReady().catch(() => false),
  limits: COMMUNITY_FEED_LIMITS,
}));
export const topics = readHandle(topicService.listTopics),
  listPosts = readHandle(posts.listPosts),
  submitPost = handle(posts.submitPost),
  withdrawPost = handle(posts.withdrawPost),
  deletePost = handle(posts.deletePost),
  moderatePost = handle(posts.moderatePost);
export const postDetail = readHandle(posts.postDetail, (req) => ({ id: req.params.id }));
export const ownPosts = handle(posts.ownPosts),
  pendingPosts = handle(posts.ownPosts, () => ({ moderation: true }));
export const createComment = handle(comments.createComment),
  listComments = readHandle(comments.listComments),
  withdrawComment = handle(comments.withdrawComment),
  moderateComment = handle(comments.moderateComment),
  commentContext = readHandle(comments.commentContext),
  commentState = handle(comments.commentState),
  postState = handle(comments.postState),
  resolveQuestion = handle(comments.resolveQuestion);
export const profileOptions = handle(profiles.profileOptions),
  updateProfileOptions = handle(profiles.updateProfileOptions),
  relation = handle(profiles.relation),
  relationList = readHandle(profiles.relationList),
  publicProfile = readHandle(profiles.publicProfile, (req) => ({ id: req.params.id }));
export const reportContent = handle(governance.reportContent),
  appeal = handle(governance.appeal),
  reviewAppeal = handle(governance.reviewAppeal),
  results = handle(governance.results),
  moderationQueue = handle(governance.moderationQueue);
export const receipt = handle(operationReceipt, (req) => ({ requestId: req.params.id }));
export async function profileAvatar(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.adminContext && !req.resourceUser?.id) return res.sendStatus(403);
  const viewer = req.adminContext ? req.resourceUser : req.user;
  try {
    await access(pool, viewer);
    const row = req.params.postId
      ? { id: (await loadPost(pool, req.params.postId, viewer)).author_id }
      : await profiles.publicProfileRow(pool, req.params.id, viewer?.id || '');
    const avatar = await first(pool, 'SELECT head_picture FROM user WHERE id=? AND del_flag=0', [row.id]);
    const value = String(avatar?.head_picture || '');
    // Same account avatar facts, independently authorized by current home-page consent.
    if (/^https?:\/\//i.test(value)) {
      // Never forward the preview header through a browser-followed external redirect.
      if (req.adminContext) return res.json({ publicAvatarUrl: value });
      return res.redirect(302, value);
    }
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(value);
    const bytes = m ? Buffer.from(m[2], 'base64') : null;
    if (!bytes?.length || bytes.length > 524288) return res.sendStatus(404);
    return res.type(m[1]).send(bytes);
  } catch {
    return res.sendStatus(404);
  }
}

export const members = handle(profiles.members);

export const dismissReport = handle(governance.dismissReport);

export const ownComments = handle(comments.ownComments);

export async function uploadImage(req, res) {
  if (req.adminContext) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    return res.sendStatus(403);
  }
  return handle(images.uploadImage, (req) => ({ file: req.file }))(req, res);
}
export const discardImage = handle(images.discardImage, (req) => ({ id: req.params.id }));
export async function image(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.adminContext && !req.resourceUser?.id) return res.sendStatus(403);
  const viewer = req.adminContext ? req.resourceUser : req.user;
  try {
    const data = await images.readImage({ user: viewer, id: req.params.id, input: req.query });
    const upstream = await fetch(data.signedUrl, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!upstream.ok || !upstream.body) return res.sendStatus(404);
    res.type(data.content_type);
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    if (!res.headersSent) res.sendStatus(404);
    else res.destroy();
  }
}

export const prepareResource = handle(resources.prepareResource);
export const resource = readHandle(resources.readResource, (req) => ({ id: req.params.id }));
export const discardResource = handle(resources.discardResource, (req) => ({ id: req.params.id }));

export const eligibleResources = handle(resources.eligibleResources);

export const topicDetail = readHandle(topicService.topicDetail, (req) => ({ slug: req.params.slug }));
export const managedTopics = handle(topicService.listTopics, () => ({ moderation: true }));
export const saveTopic = handle(topicService.saveTopic);

export const savedResources = handle(savedPostResources, (req) => ({ id: req.params.id }));
