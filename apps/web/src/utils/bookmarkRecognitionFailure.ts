import { getAiSkillPublicErrorMessage } from '@/api/aiSkillApi';
import { getAiQuotaErrorPresentation } from '@/utils/aiQuotaErrorPresentation';

export interface BookmarkRecognitionFailure {
  message: string;
  hint: string;
  retryable: boolean;
  focusTarget: 'name' | 'url';
}
type Translate = (key: string, params?: any) => string;

export function bookmarkRecognitionFailure(error: unknown, t: Translate): BookmarkRecognitionFailure {
  const code = String((error as { code?: unknown })?.code || '');
  const quota = getAiQuotaErrorPresentation(error, t);
  if (quota)
    return {
      message: quota.message,
      hint: t('bookmarkMeta.recovery.manualHint'),
      retryable: false,
      focusTarget: 'name',
    };
  const kind = ['BOOKMARK_PAGE_AUTH_REQUIRED', 'BOOKMARK_PAGE_ACCESS_PROTECTED'].includes(code)
    ? 'restricted'
    : code === 'BOOKMARK_PAGE_URL_BLOCKED'
      ? 'blocked'
      : [
            'BOOKMARK_PAGE_READ_TEMPORARY',
            'REQUEST_TIMEOUT',
            'NETWORK_ERROR',
            'OFFLINE',
            'BOOKMARK_META_TIMEOUT',
          ].includes(code)
        ? 'temporary'
        : 'failed';
  return {
    message:
      kind === 'failed'
        ? getAiSkillPublicErrorMessage(error) || t('bookmarkMeta.recovery.failed')
        : t(`bookmarkMeta.recovery.${kind}`),
    hint: t(
      `bookmarkMeta.recovery.${kind === 'blocked' ? 'checkUrlHint' : kind === 'restricted' ? 'restrictedHint' : 'manualHint'}`,
    ),
    retryable:
      (kind === 'temporary' || kind === 'failed') &&
      !['AI_SKILL_DISABLED', 'AI_KERNEL_DISABLED', 'AI_SKILL_FORBIDDEN', 'FORBIDDEN'].includes(code),
    focusTarget: kind === 'blocked' ? 'url' : 'name',
  };
}
