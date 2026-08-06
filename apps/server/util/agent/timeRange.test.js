import { describe, expect, it } from 'vitest';
import { isAllTimeExpression, parseRequiredTimeRange } from './timeRange.js';

// 平台级统计与平台级清单共用这里的口径。口径一旦漂移，同一个问题的「共 N 条」
// 和逐条明细会互相矛盾，所以两个工具的入口在这里集中约束。
describe('parseRequiredTimeRange', () => {
  it('识别得了的表达式正常返回区间', () => {
    const range = parseRequiredTimeRange('今天', { label: '资源新增时间' });
    expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2} 00:00:00$/);
    expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('识别不了就抛错，不静默降级成全量', () => {
    expect(() => parseRequiredTimeRange('随便什么时候', { label: '资源新增时间' })).toThrow(
      '资源新增时间范围无法识别',
    );
    expect(() => parseRequiredTimeRange('', { label: '用户注册时间' })).toThrow('用户注册时间范围无法识别');
  });

  it('只有显式允许时，「全部」才放行成不加时间过滤', () => {
    expect(parseRequiredTimeRange('全部', { allowAll: true })).toBeNull();
    expect(parseRequiredTimeRange('累计', { allowAll: true })).toBeNull();
    expect(() => parseRequiredTimeRange('全部', { label: '用户注册时间' })).toThrow('无法识别');
  });
});

describe('isAllTimeExpression', () => {
  it('覆盖中英文的全量说法且忽略大小写与空白', () => {
    for (const value of ['全部', '所有', '累计', '截至目前', 'all', 'ALL', ' Overall ']) {
      expect(isAllTimeExpression(value)).toBe(true);
    }
  });

  it('具体时间点不算全量', () => {
    for (const value of ['今天', '昨天', '最近7天', '', null, undefined]) {
      expect(isAllTimeExpression(value)).toBe(false);
    }
  });
});
