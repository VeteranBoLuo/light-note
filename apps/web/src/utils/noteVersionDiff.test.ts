import { describe, expect, it } from 'vitest';
import {
  buildNoteLineDiff,
  buildNoteSideBySideRows,
  compareNoteReferenceChanges,
  noteHtmlToDiffText,
} from './noteVersionDiff';

describe('noteVersionDiff', () => {
  it('以当前版本为基准标记相对历史版本的增删行', () => {
    expect(buildNoteLineDiff('a\nb', 'a\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'removed', text: 'c' },
      { type: 'added', text: 'b' },
    ]);
  });

  it('当前版本多一行时显示为新增，而不是恢复操作中的移除', () => {
    const lines = buildNoteLineDiff('相同行\n当前新增', '相同行');
    expect(lines).toEqual([
      { type: 'same', text: '相同行' },
      { type: 'added', text: '当前新增' },
    ]);
    expect(buildNoteSideBySideRows(lines)).toEqual([
      {
        type: 'same',
        currentText: '相同行',
        historicalText: '相同行',
        currentLine: 1,
        historicalLine: 1,
      },
      {
        type: 'added',
        currentText: '当前新增',
        historicalText: '',
        currentLine: 2,
        historicalLine: null,
      },
    ]);
  });

  it('统计站内资源引用的新增和移除', () => {
    expect(compareNoteReferenceChanges('/home/a /cloudSpace/f', '/home/a /noteLibrary/n')).toEqual({
      added: 1,
      removed: 1,
    });
  });

  it('按富文本块和清单项拆行，而不是把整篇正文当成一行', () => {
    expect(
      noteHtmlToDiffText(
        '<h2>修复计划</h2><ul><li><input type="checkbox" checked> 已完成</li><li><input type="checkbox"> 待处理</li></ul>',
      ),
    ).toBe('修复计划\n☑ 已完成\n☐ 待处理');
  });

  it('把同一差异块按当前内容和历史版本横向对齐', () => {
    const rows = buildNoteSideBySideRows(buildNoteLineDiff('第一行\n旧内容\n尾行', '第一行\n新内容\n尾行'));
    expect(rows).toEqual([
      {
        type: 'same',
        currentText: '第一行',
        historicalText: '第一行',
        currentLine: 1,
        historicalLine: 1,
      },
      {
        type: 'changed',
        currentText: '旧内容',
        historicalText: '新内容',
        currentLine: 2,
        historicalLine: 2,
      },
      {
        type: 'same',
        currentText: '尾行',
        historicalText: '尾行',
        currentLine: 3,
        historicalLine: 3,
      },
    ]);
  });
});
