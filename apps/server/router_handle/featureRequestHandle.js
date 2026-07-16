import { resultData } from '../util/common.js';
import {
  FeatureRequestError,
  addSubmitterFeatureUpdate,
  adminEditFeatureRequest,
  adminMergeFeatureRequest,
  adminReplyFeatureRequest,
  adminReviewFeatureRequest,
  adminUpdateFeatureProgress,
  createFeatureRequest,
  getFeatureRequestDetail,
  listAdminFeatureRequests,
  listMyFeatureRequests,
  listPublicFeatureRequests,
  notifyFeatureRequestFollowers,
  toggleFeatureRequestVote,
} from '../util/services/featureRequestService.js';

const actor = (req) => req.billingUser || req.user || {};
const viewer = (req) => req.resourceUser || req.user || {};

function sendError(res, error) {
  if (error instanceof FeatureRequestError) {
    return res.status(error.status).send(resultData({ code: error.code }, error.status, error.message));
  }
  console.error('[共建轻笺] 请求失败:', error?.message || error);
  return res.status(500).send(resultData(null, 500, '共建轻笺服务暂时不可用，请稍后重试'));
}

function requireRegistered(req, res) {
  const user = actor(req);
  if (!user.id || user.role === 'visitor') {
    res.status(403).send(resultData({ code: 'LOGIN_REQUIRED' }, 403, '请先注册或登录'));
    return null;
  }
  return user;
}

function requireRoot(req, res) {
  const user = actor(req);
  if (user.role !== 'root') {
    res.status(403).send(resultData({ code: 'ROOT_REQUIRED' }, 403, '没有操作权限'));
    return null;
  }
  return user;
}

export async function listPublic(req, res) {
  try {
    const currentViewer = viewer(req);
    const data = await listPublicFeatureRequests({
      viewerUserId: currentViewer.role === 'visitor' ? '' : currentViewer.id,
      filters: req.body?.filters,
      pagination: req.body,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getDetail(req, res) {
  try {
    const currentViewer = viewer(req);
    const data = await getFeatureRequestDetail({
      id: String(req.body?.id || ''),
      viewerUserId: currentViewer.role === 'visitor' ? '' : currentViewer.id,
      viewerRole: actor(req).role || currentViewer.role || 'visitor',
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function create(req, res) {
  const user = requireRegistered(req, res);
  if (!user) return;
  try {
    const data = await createFeatureRequest({ userId: user.id, input: req.body || {} });
    return res.send(resultData(data, 200, '建议已提交，审核后会公开展示'));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listMine(req, res) {
  const user = requireRegistered(req, res);
  if (!user) return;
  try {
    return res.send(resultData(await listMyFeatureRequests({ userId: user.id, pagination: req.body })));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function toggleVote(req, res) {
  const user = requireRegistered(req, res);
  if (!user) return;
  try {
    const data = await toggleFeatureRequestVote({
      requestId: String(req.body?.id || ''),
      userId: user.id,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function addSubmitterUpdate(req, res) {
  const user = requireRegistered(req, res);
  if (!user) return;
  try {
    const data = await addSubmitterFeatureUpdate({
      requestId: String(req.body?.id || ''),
      userId: user.id,
      content: req.body?.content,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listAdmin(req, res) {
  if (!requireRoot(req, res)) return;
  try {
    return res.send(resultData(await listAdminFeatureRequests({ filters: req.body?.filters, pagination: req.body })));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminCreate(req, res) {
  const root = requireRoot(req, res);
  if (!root) return;
  try {
    const data = await createFeatureRequest({ userId: root.id, input: req.body || {}, sourceType: 'official' });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminReview(req, res) {
  const root = requireRoot(req, res);
  if (!root) return;
  try {
    const data = await adminReviewFeatureRequest({
      requestId: String(req.body?.id || ''),
      moderationStatus: req.body?.moderationStatus,
      reply: req.body?.reply,
      actorUserId: root.id,
    });
    const event = data.moderationStatus === 'published' ? 'published' : data.moderationStatus;
    notifyFeatureRequestFollowers({
      requestId: data.requestId,
      event,
      content: req.body?.reply,
      excludeUserId: root.id,
    }).catch(() => {});
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminReply(req, res) {
  const root = requireRoot(req, res);
  if (!root) return;
  try {
    const data = await adminReplyFeatureRequest({
      requestId: String(req.body?.id || ''),
      content: req.body?.content,
      actorUserId: root.id,
    });
    notifyFeatureRequestFollowers({
      requestId: data.requestId,
      event: 'reply',
      content: data.content,
      excludeUserId: root.id,
    }).catch(() => {});
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminUpdateStatus(req, res) {
  const root = requireRoot(req, res);
  if (!root) return;
  try {
    const data = await adminUpdateFeatureProgress({
      requestId: String(req.body?.id || ''),
      progressStatus: req.body?.progressStatus,
      releaseUrl: req.body?.releaseUrl,
      actorUserId: root.id,
    });
    notifyFeatureRequestFollowers({
      requestId: data.requestId,
      event: data.progressStatus,
      excludeUserId: root.id,
    }).catch(() => {});
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminMerge(req, res) {
  const root = requireRoot(req, res);
  if (!root) return;
  try {
    const data = await adminMergeFeatureRequest({
      requestId: String(req.body?.id || ''),
      targetRequestId: String(req.body?.targetRequestId || ''),
      content: req.body?.content,
      actorUserId: root.id,
    });
    notifyFeatureRequestFollowers({
      requestId: data.requestId,
      event: 'merged',
      excludeUserId: root.id,
    }).catch(() => {});
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function adminEdit(req, res) {
  const root = requireRoot(req, res);
  if (!root) return;
  try {
    const data = await adminEditFeatureRequest({
      requestId: String(req.body?.id || ''),
      input: req.body || {},
      actorUserId: root.id,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendError(res, error);
  }
}
