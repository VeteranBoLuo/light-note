import { describe, expect, it } from 'vitest';
import { parseExplicitTodoStatusAction } from './todoIntent.js';

describe('待办显式写入意图兜底', () => {
  it('只为带引号的单条待办完成请求生成待确认参数', () => {
    expect(parseExplicitTodoStatusAction('把待办「测试代办」标记为完成')).toEqual({
      keyword: '测试代办',
      status: 'completed',
    });
    expect(parseExplicitTodoStatusAction('重新打开任务“整理发票”')).toEqual({
      keyword: '整理发票',
      status: 'pending',
    });
  });

  it('不把操作教学问题或不明确目标误当成写入请求', () => {
    expect(parseExplicitTodoStatusAction('怎么把待办「测试代办」标记为完成？')).toBeNull();
    expect(parseExplicitTodoStatusAction('把待办标记为完成')).toBeNull();
    expect(parseExplicitTodoStatusAction('把待办「测试代办」处理一下')).toBeNull();
  });
});
