import { describe, expect, it } from 'vitest';
import { AI_USAGE_FILTER_MODULE_KEYS, AI_USAGE_MODULE_KEYS, aiUsageModuleKey } from './aiUsageModules';

describe('aiUsageModules', () => {
  it('个人用量和管理端共享完整模块集合', () => {
    expect(AI_USAGE_MODULE_KEYS).toContain('toolbox');
    expect(AI_USAGE_FILTER_MODULE_KEYS[0]).toBe('all');
    expect(aiUsageModuleKey('toolbox')).toBe('toolbox');
    expect(aiUsageModuleKey('all')).toBe('other');
    expect(aiUsageModuleKey('all', true)).toBe('all');
    expect(aiUsageModuleKey('future-module')).toBe('other');
  });
});
