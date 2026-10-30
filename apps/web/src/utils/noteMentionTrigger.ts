/**
 * 笔记资源提及的纯文本触发规则。
 *
 * 中文正文通常不会在词间插入空格，因此「查看@项目」「版本v2@项目」应与「查看 @项目」一样可用。
 * `@` 紧接纯英文/数字单词时（`felix@`、`v2@`），打出 @ 的瞬间无法区分邮箱、账号和提及：
 * 先不弹出，等关键词出现中文等非 ASCII 字符再弹——邮箱与账号的域名部分只会是 ASCII。
 * HTML 编辑器会先排除 code/pre/a 等 DOM 上下文，再调用本函数；Markdown 则由本函数
 * 同时排除代码块、行内代码和正在编辑的链接语法。
 */

const EAST_ASIAN_WORD_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORD_TOKEN_AT_END = /[\p{L}\p{N}\p{M}_-]+$/u;
// @ 前连续的 ASCII 邮箱本地段；含邮箱专用符号时可直接确定是在写邮箱。
const ASCII_LOCAL_PART_AT_END = /(?:^|[\s([{<>"'“‘，。；：！？、】【、])([A-Za-z0-9][A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]*)$/u;
const EMAIL_ONLY_LOCAL_PART_CHAR = /[.!#$%&'*+/=?^`{|}~]/;
const MAILTO_PREFIX_AT_END = /(?:^|[^A-Za-z])mailto:\S*$/iu;
const NON_ASCII_CHAR = /[\u0080-\u{10FFFF}]/u;
const URL_PREFIX_AT_END = /(?:(?:[a-z][a-z\d+.-]*:)?\/\/\S*|(?:^|\s)www\.\S*)$/iu;

function currentLineBefore(text: string, index: number) {
  return text.slice(0, index).split('\n').at(-1) || '';
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
 * 当前键入的 @ 是否处在可提及的上下文中。
 *
 * - 允许：文首、空白/标点后，以及紧接中文、英文、数字等任意文字；
 *   紧接纯英文/数字单词时还需关键词满足 isAmbiguousAsciiMention 的条件，见 resolveMentionQuery。
 * - 拒绝：带邮箱专用符号的本地段、`mailto:`、URL、Markdown 代码与链接语法。
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
  if (URL_PREFIX_AT_END.test(line) || MAILTO_PREFIX_AT_END.test(line)) return false;

  const localPart = line.match(ASCII_LOCAL_PART_AT_END)?.[1] || '';
  return !EMAIL_ONLY_LOCAL_PART_CHAR.test(localPart);
}

/**
 * `@` 紧接不含东亚文字的单词（`felix@`、`v2@`），且关键词仍只有 ASCII 字符时，
 * 可能是在写邮箱或账号，暂不弹出；关键词一出现中文等字符即可确定是提及。
 */
export function isAmbiguousAsciiMention(text: string, atIndex: number, keyword: string): boolean {
  const precedingWord = currentLineBefore(text, atIndex).match(WORD_TOKEN_AT_END)?.[0] || '';
  return Boolean(precedingWord) && !EAST_ASIAN_WORD_CHAR.test(precedingWord) && !NON_ASCII_CHAR.test(keyword);
}
