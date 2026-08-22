import { describe, expect, it } from 'vitest';
import {
  aiCapabilityModuleLabelKey,
  buildAiCapabilityModuleOptions,
  buildAiCapabilityScope,
  normalizeAiCapabilityModule,
} from './aiCapabilityScope';

describe('AI 本轮能力范围', () => {
  it('默认自动模式不限制领域', () => {
    expect(normalizeAiCapabilityModule('unknown')).toBe('auto');
    expect(buildAiCapabilityScope('auto')).toEqual({ mode: 'auto', domains: [] });
  });

  it('书签模块同时允许书签元数据与网页读取', () => {
    expect(buildAiCapabilityScope('bookmark')).toEqual({
      mode: 'restricted',
      domains: ['bookmark', 'web'],
    });
  });

  it('综合内容模块完整覆盖轻笺内部内容来源域', () => {
    expect(buildAiCapabilityScope('content')).toEqual({
      mode: 'restricted',
      domains: ['content', 'note', 'bookmark', 'file', 'todo', 'tag'],
    });
  });

  it('管理模块只向 root 的选项列表开放', () => {
    const translate = (key: string) => key;
    expect(buildAiCapabilityModuleOptions(translate).some((item) => item.value === 'admin')).toBe(false);
    expect(
      buildAiCapabilityModuleOptions(translate, { includeAdmin: true }).some((item) => item.value === 'admin'),
    ).toBe(true);
    expect(aiCapabilityModuleLabelKey('todo')).toBe('ai.capabilityScope.todo');
  });
});
