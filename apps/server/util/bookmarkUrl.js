import {
  BOOKMARK_URL_CODE,
  BOOKMARK_URL_STATE,
  resolveBookmarkUrlInput,
} from '@lightnote/shared';
import { checkUrlLiveness } from './fetchWebMeta.js';

const URL_ERROR_MESSAGES = Object.freeze({
  [BOOKMARK_URL_CODE.EMPTY]: '网址不能为空',
  [BOOKMARK_URL_CODE.TOO_LONG]: '输入内容过长，请只保留要收藏的网址',
  [BOOKMARK_URL_CODE.INVALID_FORMAT]: '没有识别到有效的 HTTP 或 HTTPS 地址',
  [BOOKMARK_URL_CODE.UNSUPPORTED_PROTOCOL]: '仅支持 HTTP 或 HTTPS 地址',
  [BOOKMARK_URL_CODE.CREDENTIALS_NOT_ALLOWED]: '网址不能包含账号或密码',
  [BOOKMARK_URL_CODE.URL_TOO_LONG]: '网址不能超过 255 个字符',
  [BOOKMARK_URL_CODE.CANDIDATE_CONFIRMATION_REQUIRED]: '识别到候选地址，请确认后再保存',
});

export class BookmarkUrlError extends Error {
  constructor(code, message, data = null) {
    super(message || URL_ERROR_MESSAGES[code] || '书签地址无效');
    this.name = 'BookmarkUrlError';
    this.code = code;
    this.status = 400;
    this.data = data;
  }
}

export function inspectBookmarkUrl(value, { allowTextExtraction = true } = {}) {
  return resolveBookmarkUrlInput(value, { allowTextExtraction });
}

export function requireBookmarkUrl(value, { allowTextExtraction = true } = {}) {
  const resolution = inspectBookmarkUrl(value, { allowTextExtraction });
  if ([BOOKMARK_URL_STATE.VALID, BOOKMARK_URL_STATE.NORMALIZED].includes(resolution.state)) {
    return resolution;
  }
  throw new BookmarkUrlError(resolution.code, URL_ERROR_MESSAGES[resolution.code], {
    urlResolution: resolution,
  });
}

export async function resolveBookmarkUrlForClient(
  value,
  { allowTextExtraction = true, checkLiveness = false, livenessTimeout = 4500 } = {},
) {
  const resolution = inspectBookmarkUrl(value, { allowTextExtraction });
  let liveness = null;
  if (
    checkLiveness &&
    [BOOKMARK_URL_STATE.VALID, BOOKMARK_URL_STATE.NORMALIZED].includes(resolution.state)
  ) {
    liveness = await checkUrlLiveness(resolution.canonicalUrl, { timeout: livenessTimeout });
  }
  return { ...resolution, liveness };
}

export function bookmarkUrlErrorPayload(error) {
  if (!(error instanceof BookmarkUrlError)) return null;
  return {
    status: error.status,
    code: error.code,
    message: error.message,
    data: error.data,
  };
}
