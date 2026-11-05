import { describe, expect, it } from 'vitest';
import { resolveKnowledgeSourceTarget } from './sourceUtils.js';

describe('AI 来源标准化', () => {
  it('只有帮助中心公开文章和 Root 内部知识具有导航目标', () => {
    expect(resolveKnowledgeSourceTarget({ status: 'public', category: '帮助中心' }, 'user')).toBe('help-article');
    expect(resolveKnowledgeSourceTarget({ status: 'public', category: '使用指南' }, 'user')).toBeUndefined();
    expect(resolveKnowledgeSourceTarget({ status: 'public', category: 'FAQ' }, 'root')).toBeUndefined();
    expect(resolveKnowledgeSourceTarget({ status: 'internal', category: '运维' }, 'root')).toBe('knowledge-admin');
    expect(resolveKnowledgeSourceTarget({ status: 'internal', category: '运维' }, 'user')).toBeUndefined();
  });
});
