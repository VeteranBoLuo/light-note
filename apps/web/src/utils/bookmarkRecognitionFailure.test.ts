import { describe, expect, it } from 'vitest';
import { AiSkillApiError } from '@/api/aiSkillApi';
import { bookmarkRecognitionFailure } from './bookmarkRecognitionFailure';
const t = (key: string) => key;
describe('bookmark recognition recovery', () => {
  it('offers retry only for retryable failures and preserves URL safety boundaries', () => {
    expect(bookmarkRecognitionFailure({ code: 'BOOKMARK_PAGE_READ_TEMPORARY' }, t)).toMatchObject({
      retryable: true,
      focusTarget: 'name',
    });
    expect(bookmarkRecognitionFailure({ code: 'BOOKMARK_PAGE_AUTH_REQUIRED' }, t)).toMatchObject({
      retryable: false,
      hint: 'bookmarkMeta.recovery.restrictedHint',
    });
    expect(bookmarkRecognitionFailure({ code: 'BOOKMARK_PAGE_URL_BLOCKED' }, t)).toMatchObject({
      retryable: false,
      focusTarget: 'url',
    });
  });
  it('does not expose raw transport details and retains only public messages', () => {
    expect(bookmarkRecognitionFailure(new Error('SECRET SQL'), t).message).toBe('bookmarkMeta.recovery.failed');
    expect(
      bookmarkRecognitionFailure(new AiSkillApiError('AI_SKILL_DISABLED', '功能暂不可用', 403, true), t),
    ).toMatchObject({ message: '功能暂不可用', retryable: false });
  });
  it.each([
    ['BOOKMARK_PAGE_NOT_FOUND', 'NOT_FOUND', false, 'url'],
    ['BOOKMARK_PAGE_DNS_FAILED', 'DNS_FAILED', true, 'url'],
    ['BOOKMARK_PAGE_TLS_FAILED', 'TLS_FAILED', false, 'name'],
    ['BOOKMARK_PAGE_TLS_HANDSHAKE_FAILED', 'TLS_HANDSHAKE_FAILED', true, 'name'],
  ])(
    'distinguishes %s with a safe localized reason and matching recovery action',
    (code, reason, retryable, focusTarget) => {
      expect(bookmarkRecognitionFailure(new AiSkillApiError(code, 'PRIVATE TLS details', 503, false), t)).toEqual({
        message: `bookmarkMg.archiveFailure.${reason}`,
        hint: `bookmarkMeta.recovery.${focusTarget === 'url' ? 'checkUrlHint' : 'manualHint'}`,
        retryable,
        focusTarget,
      });
    },
  );
});
