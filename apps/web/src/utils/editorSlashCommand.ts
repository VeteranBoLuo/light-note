export interface SlashCommandQuery {
  start: number;
  end: number;
  keyword: string;
}

/**
 * 斜杠命令只在当前行的第一个非空白字符处触发。
 * 这样 URL、路径和正文中的除号不会误开菜单，同时允许用户在缩进后输入 `/`。
 */
export function resolveSlashCommandQuery(value: string, caret: number): SlashCommandQuery | null {
  const source = String(value ?? '');
  if (!Number.isInteger(caret) || caret < 0 || caret > source.length) return null;
  const lineStart = source.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  const beforeCaret = source.slice(lineStart, caret);
  const match = beforeCaret.match(/^(\s*)\/([^\s/]*)$/u);
  if (!match) return null;
  return {
    start: lineStart,
    end: caret,
    keyword: match[2] || '',
  };
}
