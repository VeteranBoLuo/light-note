import { describe, expect, it } from 'vitest';
import { DEFAULT_HELP_SECTION, normalizeKnowledgeHelpSection, toPublicHelpArticle } from './helpKnowledge.js';

describe('helpKnowledge', () => {
  it('帮助文章栏目会清理空白，未填写时进入稳定兜底栏目', () => {
    expect(normalizeKnowledgeHelpSection('  AI 与权益  ', '帮助中心')).toBe('AI 与权益');
    expect(normalizeKnowledgeHelpSection('', '帮助中心')).toBe(DEFAULT_HELP_SECTION);
    expect(normalizeKnowledgeHelpSection('笔记与编辑', '内部知识')).toBeNull();
  });

  it('公开接口只投影帮助页面需要的字段', () => {
    expect(
      toPublicHelpArticle({
        id: 'help-1',
        title: '指南',
        content: '正文',
        sort: 3,
        category: '帮助中心',
        help_section: '快速上手',
        status: 'public',
      }),
    ).toEqual({ id: 'help-1', title: '指南', content: '正文', sort: 3, help_section: '快速上手' });
  });

  it('拒绝超长栏目名', () => {
    expect(() => normalizeKnowledgeHelpSection('x'.repeat(51), '帮助中心')).toThrow('HELP_SECTION_TOO_LONG');
  });
});
