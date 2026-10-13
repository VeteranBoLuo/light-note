/** Persist source, never the renderer's DOM. Both HTML and Markdown use this contract. */
export const NOTE_MATH_MAX_LENGTH = 10000;
export const NOTE_MATH_SELECTOR = '[data-ln-math]';

export function escapeMathHtml(value) {
  return String(value ?? '').replace(
    /[&<>"'\n|]/gu,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '\n': '&#10;',
        '|': '&#124;',
      })[char],
  );
}

export function readNoteMath(mode, source) {
  if (
    !['inline', 'block'].includes(mode) ||
    typeof source !== 'string' ||
    !source.trim() ||
    source.length > NOTE_MATH_MAX_LENGTH
  )
    return null;
  return { mode, source: source.replace(/\r\n?/gu, '\n') };
}

export function noteMathHtml(source, mode = 'inline') {
  const math = readNoteMath(mode, source);
  if (!math) return escapeMathHtml(source);
  const tag = mode === 'block' ? 'div' : 'span';
  return `<${tag} class="ln-math" data-ln-math="${mode}" data-ln-latex="${escapeMathHtml(math.source)}">${escapeMathHtml(math.source)}</${tag}>`;
}

export function noteMathMarkdown(source, mode = 'inline') {
  // Raw HTML is a lossless escape hatch for source containing delimiters or inline newlines.
  if (/[$`|]/u.test(source) || (mode === 'inline' && (/\n/u.test(source) || /^\s|\s$/u.test(source))))
    return noteMathHtml(source, mode);
  return mode === 'block' ? `$$\n${source}\n$$` : `$${source}$`;
}

export const noteMathTurndownRule = {
  filter(node) {
    return (
      ['SPAN', 'DIV'].includes(node.nodeName) &&
      Boolean(readNoteMath(node.getAttribute('data-ln-math'), node.getAttribute('data-ln-latex')))
    );
  },
  replacement(_content, node) {
    const math = readNoteMath(node.getAttribute('data-ln-math'), node.getAttribute('data-ln-latex'));
    if (!math) return _content;
    // Adjacent math/digits would make the dollar delimiters ambiguous.
    const next = node.nextSibling;
    const adjacent =
      next &&
      ((next.nodeType === 1 && next.hasAttribute?.('data-ln-math')) ||
        /^[\d$]/u.test(next.textContent || ''));
    const text =
      math.mode === 'inline' && adjacent
        ? noteMathHtml(math.source, math.mode)
        : noteMathMarkdown(math.source, math.mode);
    return math.mode === 'block' ? `\n\n${text}\n\n` : text;
  },
};

function escaped(source, index) {
  let count = 0;
  for (let i = index - 1; i >= 0 && source[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

function controlledHtmlMath(source, mode) {
  const tag = mode === 'block' ? 'div' : 'span';
  const match = new RegExp(`^<${tag}\\b([^>]*)>[\\s\\S]*?<\\/${tag}\\s*>`, 'iu').exec(source);
  if (!match) return;
  const decode = (value) =>
    value.replace(
      /&(?:amp|lt|gt|quot|apos|#39|#10|#124);/gu,
      (entity) =>
        ({
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&apos;': "'",
          '&#39;': "'",
          '&#10;': '\n',
          '&#124;': '|',
        })[entity],
    );
  const attrs = Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)].map(([, name, double, single]) => [
      name,
      decode(double ?? single),
    ]),
  );
  const math = readNoteMath(attrs['data-ln-math'], attrs['data-ln-latex']);
  if (!math || math.mode !== mode) return;
  return {
    type: mode === 'block' ? 'lightNoteBlockMath' : 'lightNoteInlineMath',
    raw: match[0],
    ...math,
  };
}

function inlineMath(source) {
  const controlled = controlledHtmlMath(source, 'inline') || controlledHtmlMath(source, 'block');
  if (controlled) return { ...controlled, type: 'lightNoteInlineMath' };
  if (!source.startsWith('$') || source.startsWith('$$') || /\s/u.test(source[1] || ' ')) return;
  if (/^\$(?:[，。！？；：、`]|\d+(?:[.,]\d+)*[，。！？；：、])/u.test(source)) return;
  for (let end = 1; end < Math.min(source.length, NOTE_MATH_MAX_LENGTH + 2); end++) {
    if (source[end] === '\n' || source[end] === '`') return;
    if (source[end] !== '$' || escaped(source, end)) continue;
    // Currency such as "$20 and $30" and doubled delimiters stay ordinary text.
    if (/\s/u.test(source[end - 1]) || /[\d$]/u.test(source[end + 1] || '')) return;
    return {
      type: 'lightNoteInlineMath',
      raw: source.slice(0, end + 1),
      source: source.slice(1, end),
      mode: 'inline',
    };
  }
}

function renderedToken(token, mode) {
  const html = noteMathHtml(token.source, token.mode || mode);
  if (!Number.isInteger(token.mathFrom) || !Number.isInteger(token.mathTo)) return html;
  return html.replace(
    ' class=',
    ` data-ln-math-marker="${escapeMathHtml(token.mathMarker || '')}" data-ln-math-from="${token.mathFrom}" data-ln-math-to="${token.mathTo}" class=`,
  );
}

export function noteMathMarkedExtension() {
  return {
    extensions: [
      {
        name: 'lightNoteBlockMath',
        level: 'block',
        start(source) {
          const match = /(?:^|\n) {0,3}\$\$/u.exec(source);
          return match ? match.index + (source[match.index] === '\n' ? 1 : 0) : undefined;
        },
        tokenizer(source) {
          const controlled = controlledHtmlMath(source, 'block');
          if (controlled) return controlled;
          const open = /^ {0,3}\$\$(?!\$)/u.exec(source);
          if (!open) return;
          const end = source.indexOf('$$', open[0].length);
          if (end < 0 || escaped(source, end) || !/^(?:[ \t]*\n|[ \t]*$)/u.test(source.slice(end + 2)))
            return;
          const value = source.slice(open[0].length, end).replace(/^\n|\n$/gu, '');
          if (!readNoteMath('block', value)) return;
          const tail = /^[ \t]*(?:\n|$)/u.exec(source.slice(end + 2))[0];
          return {
            type: 'lightNoteBlockMath',
            raw: source.slice(0, end + 2 + tail.length),
            source: value,
            mode: 'block',
          };
        },
        renderer(token) {
          return `${renderedToken(token, 'block')}\n`;
        },
      },
      {
        name: 'lightNoteInlineMath',
        level: 'inline',
        start(source) {
          for (let i = 0; i < source.length; i++) {
            if (
              source[i] === '<' &&
              (controlledHtmlMath(source.slice(i), 'inline') || controlledHtmlMath(source.slice(i), 'block'))
            )
              return i;
            if (
              source[i] === '$' &&
              source[i - 1] !== '$' &&
              !escaped(source, i) &&
              inlineMath(source.slice(i))
            )
              return i;
          }
        },
        tokenizer: inlineMath,
        renderer(token) {
          return renderedToken(token, 'inline');
        },
      },
    ],
  };
}

/** No app-theme dependencies: exported files keep the same document geometry. */
export const NOTE_MATH_STYLES = `
.ln-math { color: inherit; }
.ln-math[data-ln-math="inline"] { display: inline-block; max-width: 100%; vertical-align: baseline; }
.ln-math[data-ln-math="block"] { display: block; margin: 1em 0; max-width: 100%; overflow-x: auto; text-align: center; }
.ln-math .katex-display { margin: .35em 0; }
.ln-math-error { white-space: pre-wrap; overflow-wrap: anywhere; text-align: start; }
`;

/** Keep only WOFF2 sources and inline them, so exported HTML works without network access. */
export async function bundleNoteMathCss(css, readFont) {
  const faces = [...css.matchAll(/@font-face\s*\{[^}]+\}/gu)];
  for (const [face] of faces) {
    const match = /url\((?:["']?)([^)"']+\.woff2)(?:["']?)\)\s*format\(["']woff2["']\)/u.exec(face);
    if (!match) continue;
    const uri = await readFont(match[1].split('/').pop());
    css = css.replace(face, face.replace(/src:[^;}]+/u, `src:url("${uri}") format("woff2")`));
  }
  return `${css}\n${NOTE_MATH_STYLES}`;
}
