const PROTECTED_MARKDOWN_PATTERN =
  /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\r\n]*`/gu;
const NUMERIC_REFERENCE_PATTERN = /\[(?:\d+(?:\s*[,，、-]\s*\d+)*)\]/gu;

function stripReferencesFromText(value) {
  return value
    .replace(NUMERIC_REFERENCE_PATTERN, (match, offset, source) => {
      const previous = source[offset - 1] || "";
      const following = source.slice(offset + match.length);
      if (/[A-Za-z0-9_\\]/u.test(previous)) return match;
      if (/^\s*(?:\(|:)/u.test(following)) return match;
      return "";
    })
    .replace(/[ \t]+([，。！？、；：,.!?;:])/gu, "$1")
    .replace(/[ \t]+(?=\r?\n)/gu, "")
    .replace(/\n{3,}/gu, "\n\n");
}

/**
 * 面向用户展示或保存时移除数字来源角标。
 * 服务端仍可在结构化来源中保留核验关系；代码、数组下标、数字链接和脚注定义保持不变。
 */
export function stripAiAnalysisCitations(value) {
  const source = String(value || "");
  if (!source) return "";

  let result = "";
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
