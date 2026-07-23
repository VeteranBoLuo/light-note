import { describe, expect, it } from 'vitest';
import { AI_WRITE_TOOL_NAMES } from './aiTools';

describe('AI 写工具展示策略', () => {
  it('将待办状态修改视为确认式写操作', () => {
    expect(AI_WRITE_TOOL_NAMES.has('set_todo_status')).toBe(true);
  });
});
