const SAFE_SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const MAX_DRAWING_TEXT_JSON_CHARS = 12_000;

function column(alias, name) {
  if (!alias) return name;
  if (!SAFE_SQL_ALIAS.test(alias)) throw new Error('DRAWING_AI_SQL_ALIAS_INVALID');
  return `${alias}.${name}`;
}

/**
 * 只在 SQL 层投影手绘画布的有界派生信息，绝不把完整 scene JSON 带入 AI 读取链路。
 */
export function drawingNoteAiProjection(alias = '') {
  const type = column(alias, 'type');
  const content = column(alias, 'content');
  return `CASE
            WHEN ${type} = 'drawing' AND JSON_VALID(${content})
              THEN JSON_LENGTH(${content}, '$.elements')
            ELSE NULL
          END AS drawing_element_count,
          CASE
            WHEN ${type} = 'drawing' AND JSON_VALID(${content})
              THEN LEFT(CAST(JSON_EXTRACT(${content}, '$.elements[*].text') AS CHAR), ${MAX_DRAWING_TEXT_JSON_CHARS})
            ELSE NULL
          END AS drawing_texts_json`;
}

function parseDrawingTexts(value) {
  if (value == null || value === '') return [];
  let parsed = value;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString('utf8');
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      // SQL 为避免把异常大的旧画布带入 AI 链路会截断派生文本数组。只恢复截断前
      // 已闭合的 JSON 字符串；末尾半截直接丢弃，绝不尝试解释为正文。
      const completeStrings = [];
      for (let index = 0; index < parsed.length; index += 1) {
        if (parsed[index] !== '"') continue;
        const start = index;
        let escaped = false;
        let closed = false;
        for (index += 1; index < parsed.length; index += 1) {
          const character = parsed[index];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (character === '\\') {
            escaped = true;
            continue;
          }
          if (character !== '"') continue;
          try {
            completeStrings.push(JSON.parse(parsed.slice(start, index + 1)));
          } catch {
            /* 单个无效字符串不影响前面已经恢复的安全文本 */
          }
          closed = true;
          break;
        }
        if (!closed) break;
      }
      parsed = completeStrings;
    }
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const texts = [];
  for (const item of parsed) {
    const text = String(item ?? '')
      .replace(/[\u0000-\u001f\u007f]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    texts.push(text);
  }
  return texts;
}

/**
 * 将手绘笔记转换成可验证的 AI 文本。画笔轨迹不是 OCR 结果，不能据此猜测图像语义。
 */
export function renderDrawingNoteForAi(record, { maxChars = 1800 } = {}) {
  const rawCount = Number(record?.drawing_element_count);
  const elementCount = Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : null;
  const texts = parseDrawingTexts(record?.drawing_texts_json);
  const lines = ['[手绘笔记]'];
  lines.push(elementCount == null ? '画布结构暂时无法读取。' : `画布包含 ${elementCount} 个绘制元素。`);
  if (texts.length) {
    lines.push(`画布中的可验证文字：${texts.join('；')}`);
  } else {
    lines.push(
      '画布中没有可提取的文字。当前 AI 不能仅凭画笔轨迹可靠判断图像语义；只能依据标题，不得把未识别的画面细节当作事实。',
    );
  }
  return lines.join('\n').slice(0, Math.max(1, Number(maxChars) || 1800));
}
