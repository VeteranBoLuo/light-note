import { resultData } from '../util/common.js';
import {
  clearAiMemories,
  confirmAiMemory,
  createAiMemoryCandidate,
  deleteAiMemory,
  listAiMemories,
  resolveAiMemoryIdentity,
  updateAiMemory,
} from '../util/aiMemoryService.js';

function sendError(res, error) {
  const internalCode = String(error?.code || 'AI_MEMORY_FAILED');
  const requestedStatus = Number(error?.status || 500);
  const status =
    Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
  const code = status >= 500 || !/^[A-Z][A-Z0-9_]{1,63}$/.test(internalCode) ? 'AI_MEMORY_FAILED' : internalCode;
  const raw = String(error?.message || 'AI 记忆服务暂时不可用');
  const message = raw.startsWith(`${internalCode}:`) ? raw.slice(internalCode.length + 1).trim() : raw;
  if (status >= 500) console.error('[ai-memory] 请求失败:', code);
  return res
    .status(status)
    .send(resultData({ code }, status, status >= 500 ? 'AI 记忆服务暂时不可用，请稍后重试' : message));
}

async function run(req, res, callback) {
  try {
    const identity = resolveAiMemoryIdentity(req);
    return res.send(resultData(await callback(identity)));
  } catch (error) {
    return sendError(res, error);
  }
}

export const listMemories = (req, res) => run(req, res, (identity) => listAiMemories(identity, req.body || {}));

export const createMemoryCandidate = (req, res) =>
  run(req, res, (identity) => createAiMemoryCandidate(identity, req.body || {}));

export const confirmMemory = (req, res) => run(req, res, (identity) => confirmAiMemory(identity, req.body?.memoryId));

const MEMORY_PATCH_FIELDS = new Set([
  'content',
  'memoryType',
  'scopeType',
  'scope',
  'temporary',
  'expireAt',
  'sourceConversationId',
  'sourceMessageId',
  'action',
  'status',
]);

function contractError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.status = 400;
  return error;
}

function assertKnownPatchFields(patch) {
  const unknown = Object.keys(patch).filter((key) => !MEMORY_PATCH_FIELDS.has(key));
  if (unknown.length) {
    throw contractError('AI_MEMORY_PATCH_FIELD_INVALID', 'patch 包含不支持的修改字段');
  }
  return patch;
}

function resolveUpdatePatch(body = {}) {
  if (Object.prototype.hasOwnProperty.call(body, 'patch')) {
    if (!body.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) {
      throw contractError('AI_MEMORY_PATCH_INVALID', 'patch 必须是对象');
    }
    const extraFields = Object.keys(body).filter((key) => key !== 'memoryId' && key !== 'patch');
    if (extraFields.length) {
      throw contractError('AI_MEMORY_PATCH_AMBIGUOUS', '使用 patch 时不能同时提交扁平修改字段');
    }
    return assertKnownPatchFields(body.patch);
  }
  const { memoryId: _memoryId, patch: _patch, ...flatPatch } = body;
  return assertKnownPatchFields(flatPatch);
}

export const updateMemory = (req, res) =>
  run(req, res, (identity) => updateAiMemory(identity, req.body?.memoryId, resolveUpdatePatch(req.body || {})));

export const removeMemory = (req, res) => run(req, res, (identity) => deleteAiMemory(identity, req.body?.memoryId));

export const clearMemories = (req, res) => run(req, res, (identity) => clearAiMemories(identity));
