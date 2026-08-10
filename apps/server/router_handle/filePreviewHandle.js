import { L, resultData } from '../util/common.js';
import {
  getFilePreviewErrorStatus,
  listArchivePreview,
  prepareFilePreview,
  resolveFilePreview,
} from '../util/filePreview/service.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

const messages = {
  FILE_NOT_FOUND: ['文件不存在或无权限', 'The file was not found'],
  FILE_PREVIEW_UNSUPPORTED: ['此文件格式暂不支持在线预览', 'This file format cannot be previewed online'],
  FILE_PREVIEW_NOT_READY: ['文件预览仍在生成中', 'The file preview is still being prepared'],
  FILE_PREVIEW_DISABLED: ['文件预览功能暂时关闭', 'File preview is temporarily disabled'],
  ARCHIVE_RUNTIME_UNAVAILABLE: ['压缩包预览运行环境未就绪', 'The archive preview runtime is unavailable'],
  OFFICE_RUNTIME_UNAVAILABLE: ['文档转换运行环境未就绪', 'The document conversion runtime is unavailable'],
  FILE_SIZE_INVALID: ['文件过大或大小无效，无法在线预览', 'The file is too large or has an invalid size'],
  FILE_SIZE_MISMATCH: ['文件仍在更新，请稍后重试', 'The file is still changing. Try again shortly'],
  FILE_PREVIEW_SOURCE_CHANGED: ['文件已发生变化，请重新预览', 'The file changed. Start the preview again'],
  FILE_CONTENT_INVALID: ['文件内容与扩展名不匹配', 'The file content does not match its extension'],
  ARCHIVE_PASSWORD_REQUIRED: ['暂不支持需要密码的压缩包', 'Password-protected archives are not supported'],
  ARCHIVE_MULTIPART_OR_DAMAGED: ['暂不支持分卷压缩包，或压缩包已损坏', 'The archive is multipart or damaged'],
  ARCHIVE_ENTRY_LIMIT_EXCEEDED: ['压缩包文件数量过多，无法在线预览', 'The archive contains too many entries'],
  ARCHIVE_MANIFEST_TOO_LARGE: ['压缩包目录过大，无法在线预览', 'The archive directory is too large'],
  ARCHIVE_PATH_INVALID: ['压缩包目录路径无效', 'The archive path is invalid'],
  FILE_PREVIEW_ARTIFACT_INVALID: ['预览缓存无效，请重新生成', 'The preview cache is invalid'],
};

function sendPreviewError(req, res, error, scene) {
  const rawCode = String(error?.code || '');
  const code = Object.hasOwn(messages, rawCode) ? rawCode : 'FILE_PREVIEW_SERVICE_UNAVAILABLE';
  const pair = messages[code] || ['文件预览暂时不可用，请稍后重试', 'File preview is temporarily unavailable'];
  console.error('[file-preview] %s failed code=%s', scene, stableAgentErrorCode(error));
  return res.send(resultData({ errorCode: code }, getFilePreviewErrorStatus(error), L(req, pair[0], pair[1])));
}

function fileIdFromRequest(req) {
  const fileId = Number(req.body?.fileId ?? req.body?.id);
  if (!Number.isInteger(fileId) || fileId < 1)
    throw Object.assign(new Error('FILE_NOT_FOUND'), { code: 'FILE_NOT_FOUND', status: 404 });
  return fileId;
}

export async function resolveOwnedFilePreview(req, res) {
  try {
    const data = await resolveFilePreview({
      ownerUserId: req.user.id,
      fileId: fileIdFromRequest(req),
      touch: !req.adminContext,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendPreviewError(req, res, error, 'resolve');
  }
}

export async function prepareOwnedFilePreview(req, res) {
  try {
    const data = await prepareFilePreview({
      ownerUserId: req.user.id,
      fileId: fileIdFromRequest(req),
      retry: req.body?.retry === true,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendPreviewError(req, res, error, 'prepare');
  }
}

export async function listOwnedArchivePreview(req, res) {
  try {
    const data = await listArchivePreview({
      ownerUserId: req.user.id,
      fileId: fileIdFromRequest(req),
      directory: req.body?.directory,
      query: req.body?.query,
      offset: req.body?.offset,
      limit: req.body?.limit,
      touch: false,
    });
    return res.send(resultData(data));
  } catch (error) {
    return sendPreviewError(req, res, error, 'archive-list');
  }
}

export { sendPreviewError };
