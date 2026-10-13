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
    expect(bookmarkRecognitionFailure(new AiSkillApiError('AI_SKILL_DISABLED', '功能暂不可用', 403, true), t))
      .toMatchObject({message:'功能暂不可用',retryable:false});
  });
});
