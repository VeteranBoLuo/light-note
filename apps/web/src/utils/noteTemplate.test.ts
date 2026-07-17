import { describe, expect, it } from 'vitest';
import { renderNoteTemplate } from './noteTemplate';

describe('renderNoteTemplate', () => {
  // 2021-01-01 是周五；用本地时区构造，避免依赖运行环境时区
  const now = new Date(2021, 0, 1, 9, 5, 30);

  it('替换 date/time/datetime 为本地时区值', () => {
    expect(renderNoteTemplate('{{date}}', { now })).toBe('2021-01-01');
    expect(renderNoteTemplate('{{time}}', { now })).toBe('09:05');
    expect(renderNoteTemplate('{{datetime}}', { now })).toBe('2021-01-01 09:05');
  });

  it('weekday 按 locale 输出', () => {
    expect(renderNoteTemplate('{{weekday}}', { now, locale: 'zh-CN' })).toBe('星期五');
    expect(renderNoteTemplate('{{weekday}}', { now, locale: 'en-US' })).toBe('Friday');
  });

  it('允许变量内部空格', () => {
    expect(renderNoteTemplate('{{ date }} {{  weekday  }}', { now, locale: 'en-US' })).toBe('2021-01-01 Friday');
  });

  it('未知变量保留原文', () => {
    expect(renderNoteTemplate('负责人：{{owner}}，日期：{{date}}', { now })).toBe('负责人：{{owner}}，日期：2021-01-01');
  });

  it('同一变量多处出现全部替换', () => {
    expect(renderNoteTemplate('# 日报 {{date}}\n\n> 生成于 {{date}} {{time}}', { now })).toBe(
      '# 日报 2021-01-01\n\n> 生成于 2021-01-01 09:05',
    );
  });

  it('空串与无变量文本原样返回', () => {
    expect(renderNoteTemplate('', { now })).toBe('');
    expect(renderNoteTemplate('纯文本内容', { now })).toBe('纯文本内容');
  });

  it('不污染原型链变量名（constructor 等保留原文）', () => {
    expect(renderNoteTemplate('{{constructor}} {{toString}}', { now })).toBe('{{constructor}} {{toString}}');
  });
});
