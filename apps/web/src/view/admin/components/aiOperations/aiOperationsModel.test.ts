import { describe, expect, it } from 'vitest';
import {
  actorDisplay,
  actorsDiffer,
  aiOperationsStatusKey,
  aiOperationsStatusTone,
  chartHeight,
  providerModelDisplay,
} from './aiOperationsModel';

describe('aiOperationsModel', () => {
  it('用胶囊语义区分成功、失败、待关注与中性状态', () => {
    expect(aiOperationsStatusTone('success')).toBe('success');
    expect(aiOperationsStatusTone('failed')).toBe('danger');
    expect(aiOperationsStatusTone('partial')).toBe('pending');
    expect(aiOperationsStatusTone('quota_blocked')).toBe('pending');
    expect(aiOperationsStatusTone('aborted')).toBe('neutral');
    expect(aiOperationsStatusKey('future-state')).toBe('failed');
  });

  it('执行者与目标账号分开表达，系统执行有明确回退', () => {
    const execution = {
      actor: { id: 'root-1', alias: '站长', role: 'root' },
      subject: { id: 'user-1', alias: '用户', role: 'user' },
    };
    expect(actorsDiffer(execution as any)).toBe(true);
    expect(
      actorsDiffer({
        actor: { id: '', alias: null, role: null },
        subject: { id: 'user-1', alias: '用户', role: 'user' },
      } as any),
    ).toBe(true);
    expect(actorDisplay(execution.actor, '系统执行')).toBe('站长');
    expect(actorDisplay({ id: '', alias: null, role: null }, '系统执行')).toBe('系统执行');
  });

  it('模型摘要与趋势高度都对空值和异常数值保持稳定', () => {
    expect(providerModelDisplay({ providers: ['deepseek'], models: ['deepseek-v4-flash'] }, '未记录模型')).toBe(
      'deepseek · deepseek-v4-flash',
    );
    expect(providerModelDisplay({ providers: [], models: [] }, '未记录模型')).toBe('未记录模型');
    expect(chartHeight(50, 100)).toBe(50);
    expect(chartHeight(1, 100)).toBe(3);
    expect(chartHeight(0, 0)).toBe(0);
  });
});
