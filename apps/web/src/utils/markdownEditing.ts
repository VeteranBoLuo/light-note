/**
 * Markdown 工具栏的文本编辑操作(纯函数,不碰 DOM)。
 *
 * 统一约定:输入是「当前正文 + 选区」,输出是**一次区间替换**(替换哪一段、换成什么、之后选区在哪)。
 * 特意不返回整篇新正文 —— 调用方要用 document.execCommand('insertText') 写回,
 * 只有走浏览器自己的编辑通道,Ctrl+Z 才撤得回来;直接给 textarea.value 赋值会绕过 undo 栈,
 * 用户点完「插入表格」按 Ctrl+Z 什么都不会发生。
 */

export interface EditorSelection {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface EditResult {
  /** 被替换掉的区间 [rangeStart, rangeEnd) */
  rangeStart: number;
  rangeEnd: number;
  /** 替换成的文本 */
  text: string;
  /** 替换完成后的选区(整篇文档的绝对位置) */
  selectionStart: number;
  selectionEnd: number;
}

/** 把一次区间替换应用到字符串上。给测试和无 execCommand 时的兜底用 */
export function applyEditResult(value: string, result: EditResult): string {
  return value.slice(0, result.rangeStart) + result.text + value.slice(result.rangeEnd);
}

/** 选区两侧包上标记(加粗、斜体、行内代码)。已经包过就取消,便于反复点。 */
export function wrapSelection(
  input: EditorSelection,
  marker: string,
  placeholder = '',
  closing = marker,
): EditResult {
  const { value, selectionStart, selectionEnd } = input;
  const selected = value.slice(selectionStart, selectionEnd);

  // 选中的内容本身就带着标记 → 脱掉
  if (selected.startsWith(marker) && selected.endsWith(closing) && selected.length >= marker.length + closing.length) {
    const inner = selected.slice(marker.length, selected.length - closing.length);
    return {
      rangeStart: selectionStart,
      rangeEnd: selectionEnd,
      text: inner,
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }

  // 标记在选区外侧(用户选的是标记内的文字) → 同样脱掉
  const before = value.slice(Math.max(0, selectionStart - marker.length), selectionStart);
  const after = value.slice(selectionEnd, selectionEnd + closing.length);
  if (before === marker && after === closing) {
    return {
      rangeStart: selectionStart - marker.length,
      rangeEnd: selectionEnd + closing.length,
      text: selected,
      selectionStart: selectionStart - marker.length,
      selectionEnd: selectionEnd - marker.length,
    };
  }

  const inner = selected || placeholder;
  return {
    rangeStart: selectionStart,
    rangeEnd: selectionEnd,
    text: marker + inner + closing,
    // 没选中时把占位词选起来,直接打字就能替换
    selectionStart: selectionStart + marker.length,
    selectionEnd: selectionStart + marker.length + inner.length,
  };
}

/** 选区覆盖到的每一行行首加前缀(标题、列表、待办、引用)。整段都已有该前缀则整段去掉。 */
export function toggleLinePrefix(input: EditorSelection, prefix: string): EditResult {
  const { value, selectionStart, selectionEnd } = input;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf('\n', selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;

  const lines = value.slice(lineStart, lineEnd).split('\n');
  const allPrefixed = lines.every((line) => line.startsWith(prefix));
  const text = lines.map((line) => (allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`)).join('\n');

  const delta = allPrefixed ? -prefix.length : prefix.length;
  return {
    rangeStart: lineStart,
    rangeEnd: lineEnd,
    text,
    selectionStart: Math.max(lineStart, selectionStart + delta),
    selectionEnd: Math.max(lineStart, selectionEnd + delta * lines.length),
  };
}

/**
 * 在光标处插入独立成段的块(表格、代码块、图表)。
 * 光标不在行首就先补空行,否则块会粘到上一行末尾变成普通文字。
 */
export function insertBlock(input: EditorSelection, block: string): EditResult {
  const { value, selectionStart, selectionEnd } = input;
  const prefix = selectionStart > 0 && value[selectionStart - 1] !== '\n' ? '\n\n' : '';
  const suffix = selectionEnd < value.length && value[selectionEnd] !== '\n' ? '\n\n' : '\n';
  const text = `${prefix}${block}${suffix}`;
  const caret = selectionStart + text.length;
  return {
    rangeStart: selectionStart,
    rangeEnd: selectionEnd,
    text,
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/** 表格骨架:两列三行足够看出结构,再多用户还得删 */
export function buildMarkdownTable(headers: [string, string], cellHint = ''): string {
  return [
    `| ${headers[0]} | ${headers[1]} |`,
    '| --- | --- |',
    `| ${cellHint} | ${cellHint} |`,
    `| ${cellHint} | ${cellHint} |`,
  ].join('\n');
}

/** 代码块骨架,语言可留空 */
export function buildCodeBlock(language = '', body = ''): string {
  return ['```' + language, body, '```'].join('\n');
}
