import { describe, expect, it } from 'vitest';
import {
  extractAiMemoryInfluence,
  normalizeAiMemoryInfluence,
  sanitizeAiMessageActivity,
  toAiMemoryInfluenceActivity,
} from './aiMemoryInfluence';

describe('AI memory influence metadata', () => {
  it('只接收有界数量、类型和范围，不保留正文、ID 或未知枚举', () => {
    const normalized = normalizeAiMemoryInfluence({
      status: 'used',
      count: 2,
      types: ['preference', 'workflow', 'system_instruction'],
      scopes: ['global', 'conversation', 'foreign_owner'],
      memoryId: 'memory-secret-id',
      content: '记忆正文 secret',
      rawError: 'provider-secret',
    });
    expect(normalized).toEqual({
      status: 'used',
      count: 2,
      types: ['preference', 'workflow'],
      scopes: ['global', 'conversation'],
    });
    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toContain('memory-secret-id');
    expect(serialized).not.toContain('记忆正文');
    expect(serialized).not.toContain('provider-secret');
    expect(
      sanitizeAiMessageActivity([
        { event: 'stage.changed', stage: 'planning' },
        {
          event: 'memory_context',
          status: 'used',
          count: 2,
          types: ['preference'],
          scopes: ['global'],
          memoryId: 'memory-secret-id',
          content: '记忆正文 secret',
        },
      ]),
    ).toEqual([
      { event: 'stage.changed', stage: 'planning' },
      { event: 'memory_context', status: 'used', count: 2, types: ['preference'], scopes: ['global'] },
    ]);
  });

  it('临时会话稳定恢复为未使用状态，并从云活动中读取最后一个权威事件', () => {
    const activity = [
      { event: 'memory_context', status: 'used', count: 1, types: ['fact'], scopes: ['global'] },
      { event: 'stage.changed', stage: 'responding' },
      {
        event: 'memory_context',
        status: 'not_used',
        count: 99,
        types: ['preference'],
        scopes: ['global'],
        reason: 'temporary_session',
      },
    ];
    expect(extractAiMemoryInfluence(activity)).toEqual({
      status: 'not_used',
      count: 0,
      types: [],
      scopes: [],
      reason: 'temporary_session',
    });
  });

  it('拒绝伪造数量，并将未知未使用原因折叠为 unavailable', () => {
    expect(normalizeAiMemoryInfluence({ status: 'used', count: 0, types: [], scopes: [] })).toBeNull();
    expect(normalizeAiMemoryInfluence({ status: 'used', count: 21, types: [], scopes: [] })).toBeNull();
    expect(toAiMemoryInfluenceActivity({ status: 'not_used', reason: '数据库错误 secret' })).toEqual({
      event: 'memory_context',
      status: 'not_used',
      count: 0,
      types: [],
      scopes: [],
      reason: 'unavailable',
    });
  });
});
