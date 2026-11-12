// 只用于受审阅的本地初始化文件；支持 mysql CLI 的 DELIMITER 和一行多语句。
export function localSqlStatements(source) {
  const statements = [];
  let delimiter = ';', buffer = '', quote = '', lineStart = true;
  for (let index = 0; index < source.length;) {
    if (!quote && lineStart) {
      const match = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*(?:\r?\n|$)/i.exec(source.slice(index));
      if (match) { delimiter = match[1]; index += match[0].length; continue; }
    }
    const char = source[index];
    if (quote) {
      buffer += char;
      if (char === '\\' && index + 1 < source.length) { buffer += source[index + 1]; index += 2; continue; }
      if (char === quote) {
        if (source[index + 1] === quote) { buffer += source[index + 1]; index += 2; continue; }
        quote = '';
      }
      lineStart = char === '\n'; index++; continue;
    }
    if (source.startsWith('--', index) && /\s/.test(source[index + 2] || '\n') || char === '#') {
      const end = source.indexOf('\n', index);
      index = end < 0 ? source.length : end + 1; buffer += '\n'; lineStart = true; continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) throw new Error('LOCAL_SQL_UNCLOSED_COMMENT');
      buffer += ' '; index = end + 2; continue;
    }
    if (source.startsWith(delimiter, index)) {
      if (buffer.trim()) statements.push(buffer.trim());
      buffer = ''; index += delimiter.length; lineStart = false; continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    buffer += char; lineStart = char === '\n'; index++;
  }
  if (quote || buffer.trim()) throw new Error('LOCAL_SQL_INCOMPLETE');
  return statements;
}
