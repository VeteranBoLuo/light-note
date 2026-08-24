import { describe, expect, it } from 'vitest';
import { isAiExecutionRuntimeRequired } from './context.js';

describe('AI Execution runtime gate', () => {
  it('默认要求每次模型调用处于根执行上下文', () => {
    expect(isAiExecutionRuntimeRequired({})).toBe(true);
  });

  it('仅允许通过显式环境变量紧急回滚', () => {
    expect(isAiExecutionRuntimeRequired({ AI_GATEWAY_REQUIRE_EXECUTION: 'false' })).toBe(false);
    expect(isAiExecutionRuntimeRequired({ AI_GATEWAY_REQUIRE_EXECUTION: 'true' })).toBe(true);
  });
});
