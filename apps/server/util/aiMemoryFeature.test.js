import { describe, expect, it } from 'vitest';
import { AI_MEMORY_ENABLED, assertAiMemoryWritesEnabled } from './aiMemoryFeature.js';

describe('AI 长期记忆全局开关', () => {
  it('关闭时拒绝任何长期记忆写入', () => {
    expect(AI_MEMORY_ENABLED).toBe(false);
    let thrown;
    try {
      assertAiMemoryWritesEnabled();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: 'AI_MEMORY_DISABLED', status: 409 });
  });
});
