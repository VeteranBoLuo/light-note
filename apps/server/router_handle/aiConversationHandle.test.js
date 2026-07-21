import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));

import { __testing } from './aiConversationHandle.js';
import { __testing as conversationServiceTesting } from '../util/aiConversationService.js';

function responseMock() {
  const res = {
    status: vi.fn(),
    send: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('AI conversation public error contract', () => {
  it('does not expose raw database error codes from an unclassified 5xx failure', () => {
    const res = responseMock();
    const error = Object.assign(new Error('ER_BAD_FIELD_ERROR: secret_column'), {
      code: 'ER_BAD_FIELD_ERROR',
    });

    __testing.sendError(res, error);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { code: 'AI_CONVERSATION_FAILED' },
        status: 500,
        msg: 'AI 会话服务暂时不可用，请稍后重试',
      }),
    );
  });

  it('preserves an explicit AI domain error code for a classified 5xx failure', () => {
    const res = responseMock();
    const error = conversationServiceTesting.serviceError('AI_DATABASE_UNAVAILABLE', 'AI 会话存储暂时不可用', 503);

    expect(error.isAiConversationError).toBe(true);
    __testing.sendError(res, error);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { code: 'AI_DATABASE_UNAVAILABLE' },
        status: 503,
        msg: 'AI 会话服务暂时不可用，请稍后重试',
      }),
    );
  });
});

describe('save AI answer as a referenced note', () => {
  it('keeps a readable source list and embeds traceable structured metadata', () => {
    const content = __testing.buildReferencedNoteContent({
      content: 'A supported answer [1].',
      requestId: 'request-1',
      traceId: 'trace-1',
      sources: [
        {
          sourceId: 'source-1',
          resourceType: 'note',
          resourceId: 'note-1',
          resourceVersion: 'v2',
          title: 'Research [note]',
          target: { path: '/noteLibrary/note-1' },
        },
      ],
      evidence: [
        {
          sourceId: 'source-1',
          evidenceRef: 'evidence-1',
          citationKey: '1',
          locator: { label: '第 3 段' },
          excerptHash: 'hash',
        },
      ],
    });
    expect(content).toContain('## AI 回答来源');
    expect(content).toContain('[Research \\[note\\]](/noteLibrary/note-1)');
    expect(content).toContain('第 3 段');
    const encoded = content.match(/<!-- ([A-Za-z0-9_-]+) -->/)?.[1];
    const metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    expect(metadata).toMatchObject({ schema: 'light-note-ai-sources-v1', requestId: 'request-1' });
    expect(metadata.sources[0]).toMatchObject({ evidenceRef: 'evidence-1', sourceId: 'source-1' });
  });

  it('does not serialize unsafe source protocols as links', () => {
    expect(__testing.safeSourceHref({ target: { url: 'javascript:alert(1)' } })).toBe('');
  });

  it('namespaces note-creation idempotency by the target workspace owner', () => {
    const message = { id: 'message-1', requestId: 'shared-request' };
    expect(__testing.resultNoteIdempotencyKey({ subjectUserId: 'user-a' }, message)).toBe(
      'ai-result:user-a:shared-request',
    );
    expect(__testing.resultNoteIdempotencyKey({ subjectUserId: 'user-b' }, message)).not.toBe(
      __testing.resultNoteIdempotencyKey({ subjectUserId: 'user-a' }, message),
    );
  });
});
