import { describe, expect, it } from 'vitest';
import { canAlterPendingConfirmation, confirmationErrorCode, isRetryableConfirmationError } from './confirmationRetry';

describe('confirmationRetry', () => {
  it('执行中和结果核验中允许使用同一令牌安全重试', () => {
    expect(
      isRetryableConfirmationError({
        response: { status: 409, data: { data: { code: 'TOOL_CONFIRMATION_IN_PROGRESS' } } },
      }),
    ).toBe(true);
    expect(isRetryableConfirmationError({ code: 'TOOL_CONFIRMATION_RESULT_PENDING', status: 503 })).toBe(true);
  });

  it('断网、超时和服务端异常属于响应不确定', () => {
    expect(isRetryableConfirmationError({ code: 'NETWORK_ERROR' })).toBe(true);
    expect(isRetryableConfirmationError({ code: 'ECONNABORTED' })).toBe(true);
    expect(isRetryableConfirmationError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableConfirmationError({ status: 503 })).toBe(true);
    expect(isRetryableConfirmationError({ code: 'HTTP_429', status: 429 })).toBe(true);
    expect(isRetryableConfirmationError({ response: { status: 408 } })).toBe(true);
    expect(isRetryableConfirmationError({ request: {}, message: 'Network Error' })).toBe(true);
  });

  it('明确业务失败和令牌过期不允许重试', () => {
    expect(
      isRetryableConfirmationError({ response: { status: 400, data: { data: { code: 'DUPLICATE_TITLE' } } } }),
    ).toBe(false);
    expect(
      isRetryableConfirmationError({
        response: { status: 410, data: { data: { code: 'TOOL_CONFIRMATION_EXPIRED' } } },
      }),
    ).toBe(false);
  });

  it('优先读取后端结构化错误码', () => {
    expect(
      confirmationErrorCode({
        code: 'ERR_BAD_REQUEST',
        response: { data: { data: { code: 'TOOL_CONFIRMATION_IN_PROGRESS' } } },
      }),
    ).toBe('TOOL_CONFIRMATION_IN_PROGRESS');
  });

  it('结果不确定后禁止取消和修改参数，只保留安全重试', () => {
    expect(canAlterPendingConfirmation(false)).toBe(true);
    expect(canAlterPendingConfirmation(true)).toBe(false);
  });
});
