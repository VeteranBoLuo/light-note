/**
 * 笔记资源提及的纯文本触发规则。
 *
 * 中文正文通常不会在词间插入空格，因此「查看@项目」应与「查看 @项目」一样可用；
 * 英文连续单词则保持明确边界，避免邮箱、账号和 URL 输入时误打开资源选择器。
 * HTML 编辑器会先排除 code/pre/a 等 DOM 上下文，再调用本函数；Markdown 则由本函数
 * 同时排除代码块、行内代码和正在编辑的链接语法。
 */

const EAST_ASIAN_WORD_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORD_OR_NUMBER_CHAR = /[\p{L}\p{N}\p{M}]/u;
const WORD_TOKEN_AT_END = /[\p{L}\p{N}\p{M}_-]+$/u;
// 只要 @ 前是连续的 ASCII 邮箱本地段/英文单词，就要求用户先输入空格或标点。
// 这能在用户刚键入 @ 的瞬间拦住 `name@`，无需等待其继续输入域名。
const ASCII_LOCAL_PART_AT_END = /(?:^|[\s([{<>"'“‘，。；：！？、】【、])([A-Za-z0-9][A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]*)$/u;
const URL_PREFIX_AT_END = /(?:(?:[a-z][a-z\d+.-]*:)?\/\/\S*|(?:^|\s)www\.\S*)$/iu;

function currentLineBefore(text: string, index: number) {
  return text.slice(0, index).split('\n').at(-1) || '';
}

function previousCharacter(text: string, index: number) {
  return Array.from(text.slice(0, index)).at(-1) || '';
}

function isInsideMarkdownFence(text: string, index: number) {
  const before = text.slice(0, index);
  const fenceCount = before.split('\n').filter((line) => /^\s*(```|~~~)/.test(line)).length;
  return fenceCount % 2 === 1;
}

function isInsideMarkdownInlineCode(text: string, index: number) {
  const line = currentLineBefore(text, index);
  let openDelimiterLength = 0;
  for (let cursor = 0; cursor < line.length; ) {
    if (line[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (line[cursor] !== '`') {
      cursor += 1;
      continue;
    }
    let end = cursor + 1;
    while (line[end] === '`') end += 1;
    const delimiterLength = end - cursor;
    if (!openDelimiterLength) openDelimiterLength = delimiterLength;
    else if (openDelimiterLength === delimiterLength) openDelimiterLength = 0;
    cursor = end;
  }
  return openDelimiterLength > 0;
}

function isInsideMarkdownLinkSyntax(text: string, index: number) {
  const line = currentLineBefore(text, index);
  if (line.lastIndexOf('[') > line.lastIndexOf(']')) return true;
  return /\]\([^\s)]*$/.test(line);
}

/**
 * 当前键入的 @ 是否应打开资源提及选择器。
 *
 * - 允许：文首、空白/标点后、中文/日文/韩文连续正文，以及与其连写的 AI、数字等混排词。
 * - 拒绝：ASCII 英文连续单词/邮箱本地段、URL、Markdown 代码与链接语法。
 */
export function isResourceMentionTextTrigger(text: string, atIndex: number): boolean {
  if (atIndex < 0 || text[atIndex] !== '@') return false;
  if (
    isInsideMarkdownFence(text, atIndex) ||
    isInsideMarkdownInlineCode(text, atIndex) ||
    isInsideMarkdownLinkSyntax(text, atIndex)
  ) {
    return false;
  }

  const line = currentLineBefore(text, atIndex);
  if (URL_PREFIX_AT_END.test(line)) return false;

  // 中文里经常把 AI、数字直接接在汉字后，例如「查阅AI@资料」「第2@资料」。
  // 只要当前未被空白/标点截断的词中含东亚文字，就按自然中文书写放行。
  const precedingWord = line.match(WORD_TOKEN_AT_END)?.[0] || '';
  if (EAST_ASIAN_WORD_CHAR.test(precedingWord)) return true;

  if (ASCII_LOCAL_PART_AT_END.test(line)) return false;

  const previous = previousCharacter(text, atIndex);
  if (!previous) return true;
  // 其他语言的字母、数字或组合记号同样视为未分隔的单词，保持与英文一致的明确边界。
  if (WORD_OR_NUMBER_CHAR.test(previous)) return false;
  return true;
}
