export const RICH_MEDIA_TEXT_POSITIONS = ['left', 'right'] as const;
export const RICH_MEDIA_TEXT_WIDTHS = [30, 36, 42] as const;

export type RichMediaTextPosition = (typeof RICH_MEDIA_TEXT_POSITIONS)[number];
export type RichMediaTextWidth = (typeof RICH_MEDIA_TEXT_WIDTHS)[number];

const DEFAULT_POSITION: RichMediaTextPosition = 'left';
const DEFAULT_WIDTH: RichMediaTextWidth = 36;

function escapeHtmlAttribute(value: string) {
  return String(value || '').replace(
    /[&<>"']/gu,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string,
  );
}

function escapeHtmlText(value: string) {
  return String(value || '').replace(
    /[&<>]/gu,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] as string,
  );
}

export function normalizeRichMediaTextPosition(value: unknown): RichMediaTextPosition {
  return RICH_MEDIA_TEXT_POSITIONS.includes(value as RichMediaTextPosition)
    ? (value as RichMediaTextPosition)
    : DEFAULT_POSITION;
}

export function normalizeRichMediaTextWidth(value: unknown): RichMediaTextWidth {
  const width = Number(value);
  return RICH_MEDIA_TEXT_WIDTHS.includes(width as RichMediaTextWidth) ? (width as RichMediaTextWidth) : DEFAULT_WIDTH;
}

export function createRichMediaTextItemHtml(imageUrl: string, imageAlt = '') {
  return `<figure class="ln-media-text__item"><div class="ln-media-text__media"><img src="${escapeHtmlAttribute(
    imageUrl,
  )}" alt="${escapeHtmlAttribute(imageAlt)}"></div><figcaption class="ln-media-text__content"><p><br></p></figcaption></figure>`;
}

export function createRichMediaTextBlockHtml(
  imageUrl: string,
  imageAlt = '',
  position: RichMediaTextPosition = DEFAULT_POSITION,
  width: RichMediaTextWidth = DEFAULT_WIDTH,
) {
  return `<section class="ln-media-text" data-ln-media-position="${normalizeRichMediaTextPosition(
    position,
  )}" data-ln-media-width="${normalizeRichMediaTextWidth(width)}">${createRichMediaTextItemHtml(
    imageUrl,
    imageAlt,
  )}</section><p><br></p>`;
}

/** 复用原图与已有图注；由编辑器插入块级结构，正确拆分图片所在的文字段落。 */
export function createRichMediaTextFromImage(image: HTMLImageElement) {
  if (!image.getAttribute('src')?.trim() || image.closest('.ln-media-text, .mermaid-figure--companion')) return null;
  const figure = image.closest<HTMLElement>('figure.image');
  const link = image.closest<HTMLAnchorElement>('a');
  const imageOnlyLink = link && !link.textContent?.trim() && link.querySelectorAll('img').length === 1 ? link : null;
  const holder = image.ownerDocument.createElement('div');
  holder.innerHTML = createRichMediaTextBlockHtml(image.getAttribute('src') || '', image.getAttribute('alt') || '');
  const block = holder.firstElementChild as HTMLElement;
  const media = block.querySelector<HTMLElement>('.ln-media-text__media')!;
  const clone = image.cloneNode(true) as HTMLImageElement;
  clone.classList.remove('mce-object-selected');
  if (!clone.className) clone.removeAttribute('class');
  if (link) {
    const clonedLink = link.cloneNode(false) as HTMLAnchorElement;
    clonedLink.appendChild(clone);
    media.replaceChildren(clonedLink);
  } else {
    media.replaceChildren(clone);
  }
  const existingCaption = figure?.querySelector('figcaption');
  if (existingCaption) block.querySelector('.ln-media-text__content')!.innerHTML = existingCaption.innerHTML;
  // 与保存、重新载入共用普通图片尺寸和编辑器临时属性的清理规则。
  holder.innerHTML = normalizeRichMediaTextHtml(block.outerHTML);
  return { block: holder.firstElementChild as HTMLElement, target: figure || imageOnlyLink || image };
}

/** Markdown 正文用原生 HTML 块表达图文组合，预览与富文本复用同一套 class 和响应式样式。 */
export function createMarkdownRichMediaTextBlockHtml(
  imageUrl: string,
  imageAlt = '',
  caption = '',
  position: RichMediaTextPosition = DEFAULT_POSITION,
  width: RichMediaTextWidth = DEFAULT_WIDTH,
) {
  const captionHtml = escapeHtmlText(caption).replace(/\r?\n/gu, '<br>');
  return `<section class="ln-media-text" data-ln-media-position="${normalizeRichMediaTextPosition(
    position,
  )}" data-ln-media-width="${normalizeRichMediaTextWidth(
    width,
  )}"><figure class="ln-media-text__item"><div class="ln-media-text__media"><img src="${escapeHtmlAttribute(
    imageUrl,
  )}" alt="${escapeHtmlAttribute(
    imageAlt,
  )}"></div><figcaption class="ln-media-text__content"><p>${captionHtml}</p></figcaption></figure></section>`;
}

function directChildrenByClass(parent: Element, className: string) {
  return Array.from(parent.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains(className),
  );
}

function stripTransientAttributes(element: Element) {
  Array.from(element.attributes).forEach((attribute) => {
    if (
      attribute.name.startsWith('data-mce-') ||
      attribute.name === 'contenteditable' ||
      attribute.name === 'data-ln-media-selected' ||
      attribute.name === 'data-ln-media-item-selected'
    ) {
      element.removeAttribute(attribute.name);
    }
  });
}

/**
 * 图文组合使用稳定的 flex 结构，不能继承普通图片的 float、固定宽高或尺寸档位。
 * 保存和重新载入前都经过这里，避免 TinyMCE 的临时选中属性进入正文。
 */
export function normalizeRichMediaTextHtml(html: string) {
  if (!html || typeof DOMParser === 'undefined') return html || '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const blocks = Array.from(doc.body.querySelectorAll<HTMLElement>('section.ln-media-text'));
  if (!blocks.length) return html;

  blocks.forEach((block) => {
    block.setAttribute(
      'data-ln-media-position',
      normalizeRichMediaTextPosition(block.getAttribute('data-ln-media-position')),
    );
    block.setAttribute(
      'data-ln-media-width',
      String(normalizeRichMediaTextWidth(block.getAttribute('data-ln-media-width'))),
    );
    stripTransientAttributes(block);

    directChildrenByClass(block, 'ln-media-text__item').forEach((item) => {
      stripTransientAttributes(item);
      const media = directChildrenByClass(item, 'ln-media-text__media')[0];
      const caption = directChildrenByClass(item, 'ln-media-text__content')[0];
      if (media) stripTransientAttributes(media);
      if (caption) stripTransientAttributes(caption);

      media?.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
        stripTransientAttributes(image);
        image.removeAttribute('align');
        image.removeAttribute('width');
        image.removeAttribute('height');
        image.removeAttribute('data-ln-size');
        ['float', 'display', 'width', 'height', 'max-width', 'margin', 'margin-left', 'margin-right'].forEach(
          (property) => image.style.removeProperty(property),
        );
        if (!image.getAttribute('style')?.trim()) image.removeAttribute('style');
      });
    });
  });

  return doc.body.innerHTML;
}
