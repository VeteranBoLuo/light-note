import { describe, expect, it } from 'vitest';
import { resolvePublicAiExecutionError } from './publicError.js';

describe('resolvePublicAiExecutionError', () => {
  it.each([
    ['AI_QUOTA_EXCEEDED', 429, '今日 AI 额度已用完'],
    ['AI_ACCESS_RESTRICTED', 403, '当前账号的 AI 使用权限已被限制'],
  ])('统一映射 %s', (code, status, message) => {
    expect(resolvePublicAiExecutionError(Object.assign(new Error('internal'), { code }))).toEqual({
      code,
      status,
      message,
    });
  });

  it('未知服务端错误不向用户暴露内部异常', () => {
    expect(resolvePublicAiExecutionError(new Error('SQL secret'), '摘要暂时不可用')).toEqual({
      code: 'AI_PROVIDER_ERROR',
      status: 500,
      message: '摘要暂时不可用',
    });
  });
});
