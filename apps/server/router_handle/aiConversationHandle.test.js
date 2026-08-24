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
