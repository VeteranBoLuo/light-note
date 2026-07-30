import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  attachCloudDocumentSource,
  confirmTemporaryDocumentSource,
  createTemporaryDocumentSource,
  deleteDocumentSource,
  deleteTemporaryDocumentSources,
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

// 游客可以把“游客展示空间”里本就可见的云文件作为只读 AI 材料。
// 这里只放行云文件挂载与状态读取：服务层仍按 create_by/user_id 校验共享游客主体，
// 本地上传、确认上传、清理附件等真实写入口继续走 ensureNotVisitor。
function getCloudReferenceUser(req, res) {
  if (req.adminContext) return getDocumentUser(req, res);
  if (req.user?.id) return req.user;
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
    if (parsed.status >= 500) console.error('[ai-document] request failed code=%s', stableAgentErrorCode(error));
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
  const documentUser = getCloudReferenceUser(req, res);
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
  const documentUser = getCloudReferenceUser(req, res);
  if (!documentUser) return;
  return respond(res, () => getDocumentSourceStatuses({ userId: documentUser.id, sourceIds: req.body?.attachmentIds }));
}

export function removeAttachment(req, res) {
  // 游客的云文件解析结果属于共享展示空间的可复用派生缓存。用户在编辑器中移除材料时
  // 只需清本地选中态，不能把共享 source/chunks/job 一并删除；返回成功让前端完成移除即可。
  if (!req.adminContext && req.user?.id && req.user.role === 'visitor') {
    return res.send(resultData({ deleted: false }));
  }
  const documentUser = getDocumentUser(req, res);
  if (!documentUser) return;
  return respond(res, async () => ({
    deleted: await deleteDocumentSource({
      userId: documentUser.id,
      sourceId: String(req.body?.attachmentId || ''),
    }),
  }));
}

export function clearTemporaryAttachments(req, res) {
  const documentUser = getDocumentUser(req, res);
  if (!documentUser) return;
  return respond(res, () => deleteTemporaryDocumentSources({ userId: documentUser.id }));
}
