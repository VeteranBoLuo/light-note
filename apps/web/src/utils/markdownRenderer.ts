import type { MarkedExtension } from 'marked';

type MarkedRenderer = {
  use: (...extensions: MarkedExtension[]) => unknown;
};

const configuredRenderers = new WeakSet<object>();
const LOOSE_STRONG_TOKEN = 'lightNoteLooseStrong';

function isEscaped(source: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function findClosingStrongMarker(source: string) {
  let cursor = 2;
  while (cursor < source.length) {
    const markerIndex = source.indexOf('**', cursor);
    if (markerIndex === -1) return -1;
    if (!isEscaped(source, markerIndex)) return markerIndex;
    cursor = markerIndex + 2;
  }
  return -1;
}

/**
 * 轻笺的 Markdown 加粗遵循编辑器用户能直接理解的规则：一对 `**` 之间就是加粗内容。
 *
 * CommonMark 会拒绝 `**事：**学习`、`**事-**学习` 这类写法，因为闭合标记前是标点、
 * 后面又紧跟正文；中文书写通常不在标点后补空格，这条规则会让合法操作看起来像失效。
 * 这里仅增加一个行内 strong tokenizer，不改存储正文，也不会进入转义文本、行内代码或代码块。
 */
const looseStrongExtension: NonNullable<MarkedExtension['extensions']>[number] = {
  name: LOOSE_STRONG_TOKEN,
  level: 'inline',
  start(source) {
    const index = source.indexOf('**');
    return index === -1 ? undefined : index;
  },
  tokenizer(source) {
    // 三星及以上仍交给 marked 原生规则，保留 ***粗斜体*** 等标准语义。
    if (!source.startsWith('**') || source.startsWith('***')) return undefined;
    const closingIndex = findClosingStrongMarker(source);
    if (closingIndex < 2) return undefined;
    const inner = source.slice(2, closingIndex);
    // 空标记没有可加粗内容，保持原样；首尾空格则按用户显式圈定的范围保留。
    if (!inner.trim()) return undefined;
    return {
      type: LOOSE_STRONG_TOKEN,
      raw: source.slice(0, closingIndex + 2),
      tokens: this.lexer.inlineTokens(inner),
    };
  },
  renderer(token) {
    return `<strong>${this.parser.parseInline(token.tokens || [])}</strong>`;
  },
};

/** 给 marked 单例幂等安装轻笺 Markdown 扩展。 */
export function configureMarkdownRenderer<T extends MarkedRenderer>(renderer: T): T {
  if (configuredRenderers.has(renderer as object)) return renderer;
  renderer.use({ extensions: [looseStrongExtension] });
  configuredRenderers.add(renderer as object);
  return renderer;
}
