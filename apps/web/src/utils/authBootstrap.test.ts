import { describe, expect, it } from 'vitest';
import { isDefinitiveAuthResultStatus } from './authBootstrap';

describe('冷启动身份结果判定', () => {
  it.each([200, 'visitor', 401])('把服务端明确身份状态 %s 视为确定结果', (status) => {
    expect(isDefinitiveAuthResultStatus(status)).toBe(true);
  });

  it.each([400, 500, undefined, null, ''])('不会把接口异常状态 %s 当成游客身份', (status) => {
    expect(isDefinitiveAuthResultStatus(status)).toBe(false);
  });
});
