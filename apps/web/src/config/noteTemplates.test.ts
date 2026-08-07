import { describe, expect, it } from 'vitest';
import { renderNoteTemplate } from '@/utils/noteTemplate';
import {
  BUILTIN_NOTE_TEMPLATES,
  sortBuiltinNoteTemplates,
  type BuiltinNoteTemplate,
  type NoteTemplateLocale,
} from './noteTemplates';

const locales: NoteTemplateLocale[] = ['zh-CN', 'en-US'];
const now = new Date(2026, 7, 7, 9, 5);

const templateByKey = (key: string): BuiltinNoteTemplate => {
  const template = BUILTIN_NOTE_TEMPLATES.find((item) => item.key === key);
  if (!template) throw new Error(`Missing built-in note template: ${key}`);
  return template;
};

const sectionCount = (template: BuiltinNoteTemplate, locale: NoteTemplateLocale) => {
  const content = template.content[locale];
  return template.type === 'html' ? (content.match(/<h2>/g) ?? []).length : (content.match(/^## /gm) ?? []).length;
};

describe('BUILTIN_NOTE_TEMPLATES', () => {
  it('内置模板 key 唯一且保持完整的 8 类模板', () => {
    const keys = BUILTIN_NOTE_TEMPLATES.map((template) => template.key);
    expect(keys).toEqual(['daily', 'weekly', 'meeting', 'reading', 'project', 'review', 'knowledge', 'mindmap']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('所有 Markdown 模板都不使用复选框或 Markdown 表格', () => {
    BUILTIN_NOTE_TEMPLATES.filter((template) => template.type === 'markdown').forEach((template) => {
      locales.forEach((locale) => {
        expect(template.content[locale]).not.toMatch(/\[[ xX]\]/);
        expect(template.content[locale]).not.toMatch(/^\|.*\|\s*$/m);
      });
    });
  });

  it('按内容特性选择编辑器：六类工作流模板使用富文本，知识卡片和思维导图保留 Markdown', () => {
    const htmlTemplates = BUILTIN_NOTE_TEMPLATES.filter((template) => template.type === 'html').map(
      (template) => template.key,
    );
    const markdownTemplates = BUILTIN_NOTE_TEMPLATES.filter((template) => template.type === 'markdown').map(
      (template) => template.key,
    );

    expect(htmlTemplates).toEqual(['daily', 'weekly', 'meeting', 'reading', 'project', 'review']);
    expect(markdownTemplates).toEqual(['knowledge', 'mindmap']);
  });

  it('富文本模板统一使用可响应主题的视觉骨架，不写死内联样式', () => {
    BUILTIN_NOTE_TEMPLATES.filter((template) => template.type === 'html').forEach((template) => {
      locales.forEach((locale) => {
        expect(template.content[locale]).toContain('class="note-template-page');
        expect(template.content[locale]).toContain('class="note-template-hero"');
        expect(template.content[locale]).not.toMatch(/\sstyle=/i);
      });
    });
  });

  it('Markdown 模板不会连续堆叠多行填写字段', () => {
    BUILTIN_NOTE_TEMPLATES.filter((template) => template.type === 'markdown').forEach((template) => {
      locales.forEach((locale) => {
        expect(template.content[locale]).not.toMatch(/^[-*]\s+\S.*\n[-*]\s+\S/m);
      });
    });
  });

  it('日报和周报固定在前两位，其余模板仍按最近使用排序', () => {
    const sorted = sortBuiltinNoteTemplates(BUILTIN_NOTE_TEMPLATES, {
      'builtin:mindmap': 300,
      'builtin:project': 200,
      'builtin:reading': 100,
    });
    expect(sorted.slice(0, 5).map((template) => template.key)).toEqual([
      'daily',
      'weekly',
      'mindmap',
      'project',
      'reading',
    ]);
  });

  it.each(BUILTIN_NOTE_TEMPLATES)('$key 的双语标题、正文和三行摘要完整', (template) => {
    expect(template.nameKey).toMatch(/^note\.tpl.+Name$/);
    expect(template.descKey).toMatch(/^note\.tpl.+Desc$/);

    locales.forEach((locale) => {
      expect(template.titleTemplate[locale].trim()).not.toBe('');
      expect(template.content[locale].trim()).not.toBe('');
      expect(template.preview[locale]).toHaveLength(3);
      expect(template.preview[locale].every((line) => line.trim().length > 0)).toBe(true);

      const rendered = renderNoteTemplate(`${template.titleTemplate[locale]}\n${template.content[locale]}`, {
        now,
        locale,
      });
      expect(rendered).not.toMatch(/\{\{\s*(?:date|time|datetime|weekday)\s*\}\}/);
    });

    expect(sectionCount(template, 'zh-CN')).toBe(sectionCount(template, 'en-US'));
  });

  it('周报只保留一套“成果 + 证据 + 影响”结构', () => {
    const weekly = templateByKey('weekly');
    expect(weekly.content['zh-CN']).toContain('<h2>关键成果、证据与影响</h2>');
    expect(weekly.content['zh-CN']).not.toContain('数据与结果');
    expect(weekly.content['en-US']).toContain('<h2>Key outcomes, evidence &amp; impact</h2>');
    expect(weekly.content['en-US']).not.toContain('Data &amp; results');
  });

  it('复盘不再重复询问“结果事实”和“发生了什么”', () => {
    const review = templateByKey('review');
    expect(review.content['zh-CN']).toContain('<h2>事实与结果</h2>');
    expect(review.content['zh-CN']).not.toContain('发生了什么');
    expect(review.content['en-US']).toContain('<h2>Facts &amp; results</h2>');
    expect(review.content['en-US']).not.toContain('What happened');
  });

  it('阅读、项目、知识卡片和思维导图标题会提示用户替换主题', () => {
    expect(templateByKey('reading').titleTemplate['zh-CN']).toContain('书名');
    expect(templateByKey('project').titleTemplate['zh-CN']).toContain('项目名称');
    expect(templateByKey('knowledge').titleTemplate['zh-CN']).toContain('主题');
    expect(templateByKey('mindmap').titleTemplate['zh-CN']).toContain('主题');
  });

  it('思维导图的三条图上分支都有对应的图下说明区', () => {
    const mindmap = templateByKey('mindmap');
    expect(mindmap.content['zh-CN'].match(/分支三/g)).toHaveLength(2);
    expect(mindmap.content['en-US'].match(/Branch 3/g)).toHaveLength(2);
  });

  it('会议标题包含时间，避免同日多场会议重名', () => {
    const meeting = templateByKey('meeting');
    expect(renderNoteTemplate(meeting.titleTemplate['zh-CN'], { now, locale: 'zh-CN' })).toBe(
      '会议纪要 2026-08-07 09:05',
    );
  });
});
