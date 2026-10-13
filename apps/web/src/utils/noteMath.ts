import { NOTE_MATH_SELECTOR, noteMathHtml, readNoteMath } from '@lightnote/shared/note-math';

export function readMathElement(element: Element) {
  if (!['SPAN', 'DIV'].includes(element.tagName)) return null;
  return readNoteMath(element.getAttribute('data-ln-math'), element.getAttribute('data-ln-latex'));
}

export function isNoteMathActivation(event: { type: string; key?: string }) {
  // TinyMCE forwards plain event objects, so instanceof KeyboardEvent is not reliable here.
  return event.type === 'click' || (event.type === 'keydown' && (event.key === 'Enter' || event.key === ' '));
}

/** Strip generated HTML, editing attributes and cached presentation before persistence/conversion. */
export function serializeNoteMath(html: string): string {
  if (!html.includes('data-ln-math')) return html;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  holder.querySelectorAll(NOTE_MATH_SELECTOR).forEach((element) => {
    const math = readMathElement(element);
    if (math) element.outerHTML = noteMathHtml(math.source, math.mode);
    else {
      element.removeAttribute('data-ln-math');
      element.removeAttribute('data-ln-latex');
    }
  });
  return holder.innerHTML;
}

let runtime: Promise<typeof import('./noteMathRuntime')> | null = null;
export function loadNoteMathRuntime() {
  if (!runtime)
    runtime = import('./noteMathRuntime').catch((error) => {
      runtime = null;
      throw error;
    });
  return runtime;
}

const painted = new WeakMap<Element, string>();

function decorateMathEditor(element: HTMLElement, editLabel: string) {
  element.contentEditable = 'false';
  element.classList.add('mceNonEditable');
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', editLabel);
  element.title = editLabel;
}

/** Remove editor-only presentation from read-only HTML and PDF clones without touching the source editor. */
export function clearNoteMathEditingUi(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(NOTE_MATH_SELECTOR).forEach((element) => {
    if (element.title === element.getAttribute('aria-label')) element.removeAttribute('title');
    for (const attr of ['role', 'tabindex', 'aria-label', 'contenteditable', 'data-mce-selected']) {
      element.removeAttribute(attr);
    }
    element.classList.remove('mceNonEditable');
  });
}

export async function renderNoteMathElements(root: HTMLElement, editLabel?: string) {
  const elements = [...root.querySelectorAll<HTMLElement>(NOTE_MATH_SELECTOR)];
  const entries = elements
    .flatMap((element) => {
      const math = readMathElement(element);
      if (!math) return [];
      if (editLabel) decorateMathEditor(element, editLabel);
      return [{ element, math, key: `${math.mode}:${math.source}` }];
    })
    .filter(({ element, key }) => painted.get(element) !== key || !element.querySelector('.katex'));
  if (!entries.length) return;
  const { renderNoteMathSource } = await loadNoteMathRuntime();
  for (const { element, math, key } of entries) {
    if (
      !root.contains(element) ||
      element.getAttribute('data-ln-latex') !== math.source ||
      element.getAttribute('data-ln-math') !== math.mode
    )
      continue;
    const result = renderNoteMathSource(math.source, math.mode);
    // Keep long formulas scrollable without widening the document.
    element.innerHTML = math.mode === 'block' ? `<span class="ln-math-body">${result.html}</span>` : result.html;
    if (editLabel) decorateMathEditor(element, editLabel);
    element.classList.toggle('ln-math-error', result.error);
    painted.set(element, key);
  }
}

export async function renderNoteMathHtml(html: string, editLabel?: string) {
  if (!html.includes('data-ln-math')) return html;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  if (!editLabel) clearNoteMathEditingUi(holder);
  try {
    await renderNoteMathElements(holder, editLabel);
  } catch {
    /* Keep readable, editable source if loading fails. */
  }
  return holder.innerHTML;
}
