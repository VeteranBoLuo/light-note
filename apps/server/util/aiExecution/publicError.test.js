import { describe, expect, it } from 'vitest';
import { resolvePublicAiExecutionError } from './publicError.js';

describe('resolvePublicAiExecutionError', () => {
  it.each([
    [
      'AI_QUOTA_EXCEEDED',
      429,
      '当前 AI 额度已用完。可前往 AI 用量与计费页补充永久额度，或等待每日额度重置。',
    ],
    ['AI_ACCESS_RESTRICTED', 403, '当前账号的 AI 使用权限已被限制'],
    ['AI_RATE_LIMITED', 503, 'AI 服务当前繁忙，本次未生成内容，请稍后重试'],
    ['AI_NETWORK_ERROR', 503, 'AI 服务连接失败，本次未生成内容，请稍后重试'],
    ['AI_PROVIDER_REQUEST_INVALID', 502, 'AI 服务暂时无法处理本次材料，请稍后重试'],
    ['AI_SKILL_OUTPUT_EMPTY', 502, 'AI 没有生成可用内容，请重新生成'],
    ['AI_SKILL_OUTPUT_SOURCE_INVALID', 502, '生成结果的来源引用校验未通过，请重新生成'],
    ['AI_SKILL_OUTPUT_PROFILE_INVALID', 502, '生成结果未满足当前工具的固定结构，自动修复后仍未通过'],
    ['BOOKMARK_PAGE_ACCESS_PROTECTED', 422, '网页触发了访问验证或拒绝自动读取，请稍后重试或手动填写书签信息'],
    ['BOOKMARK_PAGE_RENDERER_UNAVAILABLE', 503, '当前服务暂时无法渲染这类动态网页，请稍后重试或手动填写书签信息'],
  ])('统一映射 %s', (code, status, message) => {
    expect(resolvePublicAiExecutionError(Object.assign(new Error('internal'), { code }))).toEqual({
      code,
      status,
      message,
    });
  });

  it('本次任务预算不足时返回独立错误码和可行动的额度差额', () => {
    expect(
      resolvePublicAiExecutionError(
        Object.assign(new Error('internal'), {
          code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
          requiredTokens: 26_903,
          availableTokens: 21_700,
        }),
      ),
    ).toEqual({
      code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
      status: 429,
      message:
        '本次任务预计最多需要约 26,903 tokens，当前可用约 21,700。请减少处理内容、分段执行或补充额度后重试。',
      requiredTokens: 26_903,
      availableTokens: 21_700,
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
