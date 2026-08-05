import { describe, expect, it } from 'vitest';
import {
  applyEditResult,
  buildCodeBlock,
  buildMarkdownTable,
  insertBlock,
  toggleLinePrefix,
  wrapSelection,
  type EditResult,
  type EditorSelection,
} from './markdownEditing.ts';

const sel = (value: string, start: number, end = start): EditorSelection => ({
  value,
  selectionStart: start,
  selectionEnd: end,
});

/** 操作返回的是「替换哪一段」,断言时先套用到原文上 */
const applied = (input: EditorSelection, result: EditResult) => ({
  value: applyEditResult(input.value, result),
  selectionStart: result.selectionStart,
  selectionEnd: result.selectionEnd,
});

describe('wrapSelection', () => {
  it('包裹选中的文字', () => {
    const input = sel('这是重点内容', 2, 4);
    const out = applied(input, wrapSelection(input, '**'));
    expect(out.value).toBe('这是**重点**内容');
    // 选区仍框住原文字,方便继续操作
    expect(out.value.slice(out.selectionStart, out.selectionEnd)).toBe('重点');
  });

  it('没选中时插入占位词并选起来,直接打字就能替换', () => {
    const input = sel('开头', 2);
    const out = applied(input, wrapSelection(input, '**', '加粗文字'));
    expect(out.value).toBe('开头**加粗文字**');
    expect(out.value.slice(out.selectionStart, out.selectionEnd)).toBe('加粗文字');
  });

  it('再点一次取消标记(选区含标记)', () => {
    const input = sel('这是**重点**内容', 2, 8);
    const out = applied(input, wrapSelection(input, '**'));
    expect(out.value).toBe('这是重点内容');
    expect(out.value.slice(out.selectionStart, out.selectionEnd)).toBe('重点');
  });

  it('再点一次取消标记(只选中标记内的文字)', () => {
    const input = sel('这是**重点**内容', 4, 6);
    const out = applied(input, wrapSelection(input, '**'));
    expect(out.value).toBe('这是重点内容');
    expect(out.value.slice(out.selectionStart, out.selectionEnd)).toBe('重点');
  });

  it('支持首尾不同的标记', () => {
    const input = sel('公式', 0, 2);
    const out = applied(input, wrapSelection(input, '$', '', '$'));
    expect(out.value).toBe('$公式$');
  });
});

describe('toggleLinePrefix', () => {
  it('给光标所在行加前缀', () => {
    const input = sel('第一行\n第二行', 5);
    const out = applied(input, toggleLinePrefix(input, '- '));
    expect(out.value).toBe('第一行\n- 第二行');
  });

  it('选区跨多行时每行都加', () => {
    const input = sel('甲\n乙\n丙', 0, 5);
    const out = applied(input, toggleLinePrefix(input, '- [ ] '));
    expect(out.value).toBe('- [ ] 甲\n- [ ] 乙\n- [ ] 丙');
  });

  it('整段都已有前缀时整段去掉', () => {
    const input = sel('> 甲\n> 乙', 0, 7);
    const out = applied(input, toggleLinePrefix(input, '> '));
    expect(out.value).toBe('甲\n乙');
  });

  it('只要有一行没前缀就整段补齐,而不是互相抵消', () => {
    const input = sel('## 甲\n乙', 0, 6);
    const out = applied(input, toggleLinePrefix(input, '## '));
    expect(out.value).toBe('## ## 甲\n## 乙');
  });

  it('光标停在行首也作用于该行', () => {
    const input = sel('标题', 0);
    const out = applied(input, toggleLinePrefix(input, '# '));
    expect(out.value).toBe('# 标题');
  });
});

describe('insertBlock', () => {
  it('光标不在行首时先补空行,块不会粘在上一行后面', () => {
    const input = sel('正文', 2);
    const out = applied(input, insertBlock(input, '| a | b |'));
    expect(out.value).toBe('正文\n\n| a | b |\n');
  });

  it('光标已在空行则不再多补空行', () => {
    const input = sel('正文\n', 3);
    const out = applied(input, insertBlock(input, 'BLOCK'));
    expect(out.value).toBe('正文\nBLOCK\n');
  });

  it('后面还有内容时补空行隔开', () => {
    const input = sel('前\n后', 2);
    const out = applied(input, insertBlock(input, 'BLOCK'));
    expect(out.value).toBe('前\nBLOCK\n\n后');
  });

  it('插入后光标落在块之后', () => {
    const input = sel('', 0);
    const out = applied(input, insertBlock(input, 'BLOCK'));
    expect(out.value.slice(0, out.selectionStart)).toBe('BLOCK\n');
    expect(out.selectionStart).toBe(out.selectionEnd);
  });

  it('有选区时替换掉选中的内容', () => {
    const input = sel('保留删除', 2, 4);
    const out = applied(input, insertBlock(input, 'BLOCK'));
    expect(out.value).toBe('保留\n\nBLOCK\n');
  });
});

describe('区间替换语义(撤销栈的前提)', () => {
  it('只描述被改动的那一段,不返回整篇正文', () => {
    // 调用方要靠这个区间走 execCommand 写回;返回整篇就只能整体赋值,Ctrl+Z 会失效
    const input = sel('第一行\n第二行\n第三行', 4, 4);
    const result = toggleLinePrefix(input, '- ');

    expect(result.rangeStart).toBe(4);
    expect(result.rangeEnd).toBe(7);
    expect(result.text).toBe('- 第二行');
    // 前后两行不在替换区间里,不该被动到
    expect(input.value.slice(0, result.rangeStart)).toBe('第一行\n');
    expect(input.value.slice(result.rangeEnd)).toBe('\n第三行');
  });

  it('插入块只替换光标处的空区间', () => {
    const input = sel('正文', 2, 2);
    const result = insertBlock(input, 'BLOCK');

    expect(result.rangeStart).toBe(2);
    expect(result.rangeEnd).toBe(2);
    expect(result.text).toBe('\n\nBLOCK\n');
  });
});

describe('骨架生成', () => {
  it('表格骨架是合法的 markdown 表格', () => {
    const table = buildMarkdownTable(['列一', '列二']);
    const lines = table.split('\n');
    expect(lines[0]).toBe('| 列一 | 列二 |');
    expect(lines[1]).toBe('| --- | --- |');
    expect(lines).toHaveLength(4);
  });

  it('代码块围栏成对且语言可留空', () => {
    expect(buildCodeBlock('python', 'print(1)')).toBe('```python\nprint(1)\n```');
    expect(buildCodeBlock()).toBe('```\n\n```');
  });
});
