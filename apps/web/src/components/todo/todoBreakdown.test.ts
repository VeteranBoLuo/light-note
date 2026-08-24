import { describe, expect, it } from 'vitest';
import { mergeTodoBreakdownChecklist } from './todoBreakdown';

describe('todo breakdown checklist', () => {
  it('去重、限长并保留同名原清单项的完成状态', () => {
    const result = mergeTodoBreakdownChecklist(
      [{ id: 'old', text: '确认需求', done: true }],
      ['确认需求', ' 编写方案 ', '编写方案', '', ...Array.from({ length: 60 }, (_, index) => `步骤 ${index}`)],
    );
    expect(result).toHaveLength(50);
    expect(result[0]).toEqual({ id: 'old', text: '确认需求', done: true });
    expect(result[1]).toMatchObject({ text: '编写方案', done: false });
    expect(new Set(result.map((item) => item.text)).size).toBe(result.length);
  });

  it('兼容结构化清单项并过滤空值', () => {
    expect(mergeTodoBreakdownChecklist([], [{ text: '第一步' }, { text: ' ' }, null])).toMatchObject([
      { text: '第一步', done: false },
    ]);
  });
});
