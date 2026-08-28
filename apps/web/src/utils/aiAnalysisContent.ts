const PROTECTED_MARKDOWN_PATTERN = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\r\n]*`/g;
const NUMERIC_REFERENCE_PATTERN = /\[(?:\d+(?:\s*[,，、-]\s*\d+)*)\]/g;

function stripReferencesFromText(value: string) {
  return value
    .replace(NUMERIC_REFERENCE_PATTERN, (match, offset: number, source: string) => {
      const previous = source[offset - 1] || '';
      const following = source.slice(offset + match.length);
      if (/[A-Za-z0-9_\\]/.test(previous)) return match;
      if (/^\s*(?:\(|:)/.test(following)) return match;
      return '';
    })
    .replace(/[ \t]+([，。！？、；：,.!?;:])/g, '$1')
    .replace(/[ \t]+(?=\r?\n)/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * 分析结果在服务端仍保留可校验的材料引用，面向用户展示和保存为笔记时移除数字角标。
 * 代码、数组下标、Markdown 数字链接与脚注定义保持原样。
 */
export function stripAiAnalysisCitations(value: unknown) {
  const source = String(value || '');
  if (!source) return '';

  let result = '';
  let cursor = 0;
  for (const match of source.matchAll(PROTECTED_MARKDOWN_PATTERN)) {
    const index = match.index ?? cursor;
    result += stripReferencesFromText(source.slice(cursor, index));
    result += match[0];
    cursor = index + match[0].length;
  }
  result += stripReferencesFromText(source.slice(cursor));
  return result.trim();
}
