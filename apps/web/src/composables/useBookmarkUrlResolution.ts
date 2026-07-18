import { apiBasePost } from '@/http/request';
import i18n from '@/i18n';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { requestBookmarkUrlDecision } from '@/utils/bookmarkUrlDecision';
import {
  BOOKMARK_URL_CODE,
  resolveBookmarkUrlInput,
  type BookmarkUrlCandidate,
  type BookmarkUrlResolution,
} from '@lightnote/shared';

type LivenessResult = { status: 'alive' | 'suspect' | 'unknown' | 'skip'; code: string | number } | null;
type ClientResolution = BookmarkUrlResolution & { liveness?: LivenessResult };

interface BookmarkUrlPreflightOptions {
  checkLiveness?: boolean;
  showError?: boolean;
  signal?: AbortSignal;
}

export interface BookmarkUrlPreflightResult {
  ok: boolean;
  cancelled?: boolean;
  url?: string;
  resolution?: ClientResolution;
  message?: string;
}

function candidateDescription(candidate: BookmarkUrlCandidate) {
  return candidate.source === 'explicit'
    ? i18n.global.t('bookmarkUrl.explicitCandidate')
    : i18n.global.t('bookmarkUrl.domainCandidate');
}

async function chooseCandidate(candidates: BookmarkUrlCandidate[], signal?: AbortSignal) {
  return requestBookmarkUrlDecision(
    {
      title: i18n.global.t('bookmarkUrl.chooseTitle'),
      description: i18n.global.t('bookmarkUrl.chooseDescription'),
      options: candidates.map((candidate, index) => ({
        id: candidate.url,
        label: candidate.url,
        description: candidateDescription(candidate),
        recommended: candidates.length === 1 && index === 0,
      })),
      cancelText: i18n.global.t('bookmarkUrl.backToEdit'),
      recommendedText: i18n.global.t('bookmarkUrl.recommended'),
    },
    { signal },
  );
}

function livenessDescription(liveness: LivenessResult) {
  if (liveness?.code === 'ENOTFOUND') return i18n.global.t('bookmarkUrl.domainNotFound');
  if (liveness?.code === 404 || liveness?.code === 410) return i18n.global.t('bookmarkUrl.pageNotFound');
  return i18n.global.t('bookmarkUrl.maybeUnavailable');
}

function invalidResolutionMessage(resolution: ClientResolution) {
  const keyByCode: Partial<Record<string, string>> = {
    [BOOKMARK_URL_CODE.EMPTY]: 'bookmarkUrl.empty',
    [BOOKMARK_URL_CODE.TOO_LONG]: 'bookmarkUrl.inputTooLong',
    [BOOKMARK_URL_CODE.URL_TOO_LONG]: 'bookmarkUrl.urlTooLong',
    [BOOKMARK_URL_CODE.UNSUPPORTED_PROTOCOL]: 'bookmarkUrl.unsupportedProtocol',
    [BOOKMARK_URL_CODE.CREDENTIALS_NOT_ALLOWED]: 'bookmarkUrl.credentialsNotAllowed',
  };
  return i18n.global.t(keyByCode[resolution.code] || 'bookmarkUrl.invalid');
}

async function confirmSuspectUrl(url: string, liveness: LivenessResult, signal?: AbortSignal) {
  const result = await requestBookmarkUrlDecision(
    {
      title: i18n.global.t('bookmarkUrl.suspectTitle'),
      description: livenessDescription(liveness),
      options: [
        {
          id: 'edit',
          label: i18n.global.t('bookmarkUrl.backToEdit'),
          description: i18n.global.t('bookmarkUrl.editRecommendedDescription'),
          recommended: true,
        },
        {
          id: 'save',
          label: i18n.global.t('bookmarkUrl.saveAnyway'),
          description: url,
        },
      ],
      cancelText: i18n.global.t('common.cancel'),
      recommendedText: i18n.global.t('bookmarkUrl.recommended'),
    },
    { signal },
  );
  return result === 'save';
}

function isRequestCancelled(error: any, signal?: AbortSignal) {
  return (
    signal?.aborted ||
    error?.code === 'ERR_CANCELED' ||
    error?.name === 'CanceledError' ||
    error?.name === 'AbortError'
  );
}

export async function preflightBookmarkUrl(
  rawUrl: string,
  { checkLiveness = true, showError = true, signal }: BookmarkUrlPreflightOptions = {},
): Promise<BookmarkUrlPreflightResult> {
  if (signal?.aborted) return { ok: false, cancelled: true };
  let currentUrl = String(rawUrl || '').trim();
  // 危险协议、账号密码型 URL、超长输入等确定性错误先在本地拦截。
  // 这既能立即给出中文反馈，也避免请求在抵达应用前被 WAF 拦截成泛化的 403 网络错误；
  // 服务端仍会再次使用同一共享解析器校验，形成前后端双重兜底。
  const localResolution = resolveBookmarkUrlInput(currentUrl, { allowTextExtraction: true }) as ClientResolution;
  if (localResolution.state === 'invalid') {
    const errorMessage = invalidResolutionMessage(localResolution);
    if (showError) message.error(errorMessage);
    return { ok: false, resolution: localResolution, message: errorMessage };
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await apiBasePost(
        '/api/bookmark/resolveUrl',
        { url: currentUrl, allowTextExtraction: true, checkLiveness },
        { silent: true, signal },
      );
    } catch (error: any) {
      if (isRequestCancelled(error, signal)) return { ok: false, cancelled: true };
      const errorMessage = error?.message || i18n.global.t('http.networkUnstable');
      if (showError) message.error(errorMessage);
      return { ok: false, message: errorMessage };
    }
    const resolution = response.data as ClientResolution | null;
    if (response.status !== 200 || !resolution) {
      const errorMessage = response.msg || i18n.global.t('bookmarkUrl.invalid');
      if (showError) message.error(errorMessage);
      return { ok: false, message: errorMessage };
    }
    if (resolution.state === 'invalid') {
      const errorMessage = invalidResolutionMessage(resolution);
      if (showError) message.error(errorMessage);
      return { ok: false, resolution, message: errorMessage };
    }
    if (resolution.state === 'needs_confirmation') {
      if (!resolution.candidates?.length) {
        const errorMessage = i18n.global.t('bookmarkUrl.invalid');
        if (showError) message.error(errorMessage);
        return { ok: false, resolution, message: errorMessage };
      }
      const selectedUrl = await chooseCandidate(resolution.candidates, signal);
      if (!selectedUrl) return { ok: false, cancelled: true, resolution };
      currentUrl = selectedUrl;
      continue;
    }
    if (resolution.liveness?.status === 'suspect') {
      const shouldSave = await confirmSuspectUrl(resolution.canonicalUrl, resolution.liveness, signal);
      if (!shouldSave) return { ok: false, cancelled: true, resolution };
    }
    return { ok: true, url: resolution.canonicalUrl, resolution };
  }
  const errorMessage = i18n.global.t('bookmarkUrl.invalid');
  if (showError) message.error(errorMessage);
  return { ok: false, message: errorMessage };
}
