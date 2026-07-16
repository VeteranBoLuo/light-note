import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import {
  attachCloudDocumentSource,
  confirmTemporaryDocumentSource,
  createTemporaryDocumentSource,
  deleteDocumentSource,
  getDocumentSourceStatuses,
} from '../util/aiDocument/service.js';

function getDocumentUser(req, res) {
  if (req.adminContext) {
    const subject = req.resourceUser || req.user;
    if (req.adminCapability?.policy !== 'ai_use' || !subject?.id || subject.role === 'visitor') {
      res
        .status(403)
        .send(resultData({ code: 'ADMIN_CONTEXT_ATTACHMENT_FORBIDDEN' }, 403, '当前预览账号不能使用文件附件'));
      return null;
    }
    return subject;
  }
  if (!ensureNotVisitor(req, res)) return null;
  return req.user;
}

function publicError(error) {
  const raw = String(error?.message || '');
  const match = /^([A-Z][A-Z0-9_]+):\s*(.+)$/.exec(raw);
  return {
    code: error?.code || match?.[1] || 'AI_DOCUMENT_FAILED',
    status: Number(error?.status || 500),
    message: match?.[2] || (Number(error?.status || 500) >= 500 ? '处理文件失败，请稍后重试' : raw),
  };
}

async function respond(res, task) {
  try {
    res.send(resultData(await task()));
  } catch (error) {
    const parsed = publicError(error);
    if (parsed.status >= 500) console.error('[AI 文档] 接口处理失败:', error);
    res.send(resultData({ code: parsed.code }, parsed.status, parsed.message));
  }
}

export function initTemporaryUpload(req, res) {
  const documentUser = getDocumentUser(req, res);
  if (!documentUser) return;
  return respond(res, () =>
    createTemporaryDocumentSource({
      userId: documentUser.id,
      sessionId: req.body?.sessionId,
      fileName: req.body?.fileName,
      fileType: req.body?.fileType,
      fileSize: req.body?.fileSize,
    }),
  );
}

export function confirmTemporaryUpload(req, res) {
  const documentUser = getDocumentUser(req, res);
  if (!documentUser) return;
  return respond(res, () =>
    confirmTemporaryDocumentSource({ userId: documentUser.id, sourceId: String(req.body?.attachmentId || '') }),
  );
}

export function attachCloudFile(req, res) {
  const documentUser = getDocumentUser(req, res);
  if (!documentUser) return;
  return respond(res, () =>
    attachCloudDocumentSource({
      userId: documentUser.id,
      fileId: String(req.body?.fileId || ''),
      sessionId: req.body?.sessionId,
    }),
  );
}

export function getStatuses(req, res) {
  const documentUser = getDocumentUser(req, res);
  if (!documentUser) return;
  return respond(res, () => getDocumentSourceStatuses({ userId: documentUser.id, sourceIds: req.body?.attachmentIds }));
}

export function removeAttachment(req, res) {
  const documentUser = getDocumentUser(req, res);
  if (!documentUser) return;
  return respond(res, async () => ({
    deleted: await deleteDocumentSource({
      userId: documentUser.id,
      sourceId: String(req.body?.attachmentId || ''),
    }),
  }));
}
