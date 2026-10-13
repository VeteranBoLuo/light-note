import type { Token } from 'marked';

type MathToken = Token & {
  mathMarker?: string;
  mathFrom?: number;
  mathTo?: number;
  tokens?: Token[];
  items?: Token[];
  header?: { tokens: Token[] }[];
  rows?: { tokens: Token[] }[][];
};

// Containers strip quote/list prefixes from child raw strings. Match each line within
// its parent range, never searching the whole document for a repeated formula.
function locate(raw: string, source: string, from: number, to: number) {
  const exact = source.indexOf(raw, from);
  if (exact >= from && exact + raw.length <= to) return { from: exact, to: exact + raw.length };
  let cursor = from;
  let start = -1;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const found = source.indexOf(line, cursor);
    if (found < cursor || found + line.length > to) return null;
    if (start < 0) start = found;
    cursor = found + line.length;
  }
  return start < 0 ? null : { from: start, to: cursor };
}

/** Bound every lookup to its parent token; identical formulas inside code never steal an edit. */
export function annotateMarkdownMath(tokens: Token[], source: string, marker: string, from = 0, to = source.length) {
  let cursor = from;
  for (const token of tokens as MathToken[]) {
    const range = locate(token.raw, source, cursor, to);
    if (!range) continue;
    cursor = range.to;
    if (token.type === 'lightNoteInlineMath' || token.type === 'lightNoteBlockMath') {
      token.mathMarker = marker;
      token.mathFrom = range.from;
      token.mathTo = range.to;
    } else if (token.type === 'table') {
      annotateMarkdownMath(
        [...(token.header || []), ...(token.rows || []).flat()].flatMap((cell) => cell.tokens),
        source,
        marker,
        range.from,
        range.to,
      );
    } else if (token.items) annotateMarkdownMath(token.items, source, marker, range.from, range.to);
    else if (token.tokens) annotateMarkdownMath(token.tokens, source, marker, range.from, range.to);
  }
}
