import { describe, expect, it } from 'vitest';
import { evaluateCitationSemanticSupport } from './citationSemanticEvaluator.js';

describe('引用语义支持度离线评估', () => {
  it('证据覆盖主张的主体、动作与数字时通过', () => {
    const result = evaluateCitationSemanticSupport(
      '项目发布窗口是 2026 年 8 月 12 日，负责人是林清。',
      '会议最终决定：项目发布窗口定在 2026 年 8 月 12 日，由林清负责上线协调。',
    );
    expect(result.supported).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.58);
  });

  it('相同主题但数字不一致时拒绝伪支持', () => {
    expect(
      evaluateCitationSemanticSupport(
        '预算上限是 80 万元。',
        '预算讨论记录显示当前上限为 50 万元。',
      ),
    ).toMatchObject({ supported: false, reason: 'number_mismatch' });
  });

  it('否定方向冲突时拒绝伪支持', () => {
    expect(
      evaluateCitationSemanticSupport(
        '该文件允许对外分享。',
        '安全规则明确说明该文件不允许对外分享。',
      ),
    ).toMatchObject({ supported: false, reason: 'negation_conflict' });
  });

  it('只有宽泛主题重合而没有关键事实时低分', () => {
    const result = evaluateCitationSemanticSupport('云空间保留期是 30 天。', '云空间支持文件上传和预览。');
    expect(result.supported).toBe(false);
  });
});
