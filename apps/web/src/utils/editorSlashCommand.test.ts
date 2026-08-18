import { describe, expect, it } from 'vitest';
import { resolveSlashCommandQuery } from './editorSlashCommand';

describe('resolveSlashCommandQuery', () => {
  it('识别行首斜杠与中英文关键词', () => {
    expect(resolveSlashCommandQuery('/', 1)).toEqual({ start: 0, end: 1, keyword: '' });
    expect(resolveSlashCommandQuery('/代码', 3)).toEqual({ start: 0, end: 3, keyword: '代码' });
    expect(resolveSlashCommandQuery('上一行\n/heading', 12)).toEqual({ start: 4, end: 12, keyword: 'heading' });
  });

  it('把行首缩进一起纳入替换范围', () => {
    expect(resolveSlashCommandQuery('  /todo', 7)).toEqual({ start: 0, end: 7, keyword: 'todo' });
  });

  it('拒绝正文、路径和带空格的查询', () => {
    expect(resolveSlashCommandQuery('正文 /code', 8)).toBeNull();
    expect(resolveSlashCommandQuery('/usr/bin', 8)).toBeNull();
    expect(resolveSlashCommandQuery('/code block', 11)).toBeNull();
  });

  it('拒绝越界光标', () => {
    expect(resolveSlashCommandQuery('/', -1)).toBeNull();
    expect(resolveSlashCommandQuery('/', 2)).toBeNull();
  });
});
