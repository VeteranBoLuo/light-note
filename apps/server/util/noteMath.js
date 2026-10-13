import { load } from 'cheerio';
import { readNoteMath, noteMathHtml } from '@lightnote/shared/note-math';

export function normalizeNoteMathSource(html) {
  if (!html.includes('data-ln-math')) return html;
  const $ = load(html, null, false);
  $('[data-ln-math]').each((_, element) => {
    const node = $(element);
    const math =
      ['span', 'div'].includes(element.tagName) &&
      readNoteMath(node.attr('data-ln-math'), node.attr('data-ln-latex'));
    if (math) node.replaceWith(noteMathHtml(math.source, math.mode));
    else node.removeAttr('data-ln-math data-ln-latex');
  });
  return $.html();
}
