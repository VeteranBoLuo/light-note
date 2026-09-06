import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { describe, expect, it } from 'vitest';
import { AI_USAGE_FILTER_MODULE_KEYS, AI_USAGE_MODULE_KEYS, aiUsageModuleKey } from './aiUsageModules';

describe('aiUsageModules', () => {
  it('全部模块均有中英文名称，已登记分类不显示成其他', () => {
    for (const messages of [zh, en]) {
      const labels = messages.settings.ai.usage.modules as Record<string, string>;
      for (const key of AI_USAGE_FILTER_MODULE_KEYS) {
        expect(labels[key]).toBeTruthy();
        if (key !== 'other') expect(labels[key]).not.toBe(labels.other);
      }
    }
  });
  it('个人用量和管理端共享完整模块集合', () => {
    expect(AI_USAGE_MODULE_KEYS).toContain('toolbox');
    expect(AI_USAGE_FILTER_MODULE_KEYS[0]).toBe('all');
    expect(aiUsageModuleKey('toolbox')).toBe('toolbox');
    for (const key of ['organize', 'routine', 'general']) {
      expect(AI_USAGE_FILTER_MODULE_KEYS).toContain(key);
      expect(aiUsageModuleKey(key)).toBe(key);
    }
    expect(aiUsageModuleKey('all')).toBe('other');
    expect(aiUsageModuleKey('all', true)).toBe('all');
    expect(aiUsageModuleKey('future-module')).toBe('other');
  });
});
