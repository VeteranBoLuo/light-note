import TurndownService from 'turndown';
import type { Token, Tokens } from 'marked';

const EMPTY_MARKDOWN_TASK_ITEM_RE = /^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s*$/u;
const EMPTY_MARKDOWN_TASK_TEXT_RE = /^\[[ xX]\]$/u;

/**
 * marked 只会把带正文的 `- [ ] 任务` 识别为 GFM 待办；工具栏刚插入的空 `- [ ]`
 * 会被当成普通列表文本。这里在 token 阶段补齐任务语义，避免直接改源码误伤代码块。
 */
export function promoteEmptyMarkdownTaskToken(token: Token) {
  if (token.type !== 'list_item') return;
  const item = token as Tokens.ListItem;
  if (item.task || !EMPTY_MARKDOWN_TASK_TEXT_RE.test(item.text.trim())) return;

  const match = item.raw.match(EMPTY_MARKDOWN_TASK_ITEM_RE);
  if (!match) return;

  const checked = match[1].toLowerCase() === 'x';
  const placeholder: Tokens.Text = {
    type: 'text',
    raw: '\u200b',
    text: '\u200b',
  };

  item.task = true;
  item.checked = checked;
  item.text = '\u200b';
  item.tokens = [
    {
      type: 'checkbox',
      raw: checked ? '[x] ' : '[ ] ',
      checked,
    },
    placeholder,
  ];
}

function isCheckboxElement(node: Element | null): node is HTMLInputElement {
  return node?.tagName === 'INPUT' && node.getAttribute('type')?.toLowerCase() === 'checkbox';
}

function isNoteTodoCheckbox(node: Node): node is HTMLInputElement {
  const input = node as HTMLInputElement;
  if (input.nodeName !== 'INPUT' || input.type !== 'checkbox') return false;
  // `class` 可能被编辑器清理；Markdown 渲染出来的任务项仍可通过其直接位于 li 内识别。
  return (
    input.classList.contains('note-todo-checkbox') ||
    input.getAttribute('data-note-task') === 'true' ||
    input.parentElement?.tagName === 'LI'
  );
}

function getLeadingTaskCheckbox(element: Element): HTMLInputElement | null {
  return Array.from(element.children).find((child) => isCheckboxElement(child)) || null;
}

function getTaskListItemCheckbox(item: HTMLLIElement): HTMLInputElement | null {
  const directCheckbox = getLeadingTaskCheckbox(item);
  if (directCheckbox) return directCheckbox;

  // Turndown 输出的任务项之间带空行时，marked 会生成 `li > p > input` 的松散列表。
  // 这里兼容该结构，避免第一次切换后任务语义就丢失。
  const contentBlock = Array.from(item.children).find((child) => ['P', 'DIV'].includes(child.tagName));
  return contentBlock ? getLeadingTaskCheckbox(contentBlock) : null;
}

function removeEmptyTaskPlaceholder(checkbox: HTMLInputElement) {
  const sibling = checkbox.nextSibling;
  if (sibling?.nodeType !== 3 || !sibling.textContent?.includes('\u200b')) return;

  const text = sibling.textContent.replace(/\u200b/g, '');
  if (text.trim()) sibling.textContent = text;
  else sibling.remove();
}

function moveTaskItemContentToParagraph(
  item: HTMLLIElement,
  checkbox: HTMLInputElement,
  paragraph: HTMLParagraphElement,
) {
  const checkboxContainer = checkbox.parentElement;
  const isSingleContentBlock =
    checkboxContainer !== item &&
    checkboxContainer !== null &&
    ['P', 'DIV'].includes(checkboxContainer.tagName) &&
    item.children.length === 1;
  const source = isSingleContentBlock ? checkboxContainer : item;
  while (source.firstChild) paragraph.appendChild(source.firstChild);
}

export function createNoteTurndownService() {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  // Turndown 默认会移除 input。轻笺待办需转换为标准 GFM 任务列表，
  // checked 属性和运行时 checked 状态都要识别，避免切换编辑模式时丢失勾选状态。
  service.addRule('noteTodoCheckbox', {
    filter: isNoteTodoCheckbox,
    replacement: (_content, node) =>
      isNoteTodoCheckbox(node) && (node.checked || node.hasAttribute('checked')) ? '[x] ' : '[ ] ',
  });

  service.addRule('noteTodoParagraph', {
    filter: (node) => {
      if (node.nodeName !== 'P' && node.nodeName !== 'DIV') return false;
      return Array.from((node as HTMLElement).children).some(isNoteTodoCheckbox);
    },
    replacement: (content) => {
      const normalizedContent = content.trim().replace(/^(\[(?:x| )\])\s+/, (_match, checkbox) => `${checkbox} `);
      return `\n\n- ${normalizedContent}\n\n`;
    },
  });

  return service;
}

/**
 * marked 会把 GFM 待办渲染成「列表圆点 + disabled checkbox」。
 * 阅读态保留列表结构但去掉 marker；切到富文本时，纯待办列表转换成轻笺原生的待办段落，
 * 让复选框可以继续点击、回车续写，并能无损转回标准 `- [ ]` / `- [x]`。
 */
export function normalizeMarkdownTaskListHtml(html: string, editable = false) {
  if (!html || typeof DOMParser === 'undefined') return html || '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let changed = false;

  doc.body.querySelectorAll<HTMLUListElement | HTMLOListElement>('ul,ol').forEach((list) => {
    const items = Array.from(list.children).filter((child): child is HTMLLIElement => child.tagName === 'LI');
    if (!items.length) return;
    const taskItems = items
      .map((item) => ({ item, checkbox: getTaskListItemCheckbox(item) }))
      .filter((entry): entry is { item: HTMLLIElement; checkbox: HTMLInputElement } => entry.checkbox !== null);
    if (!taskItems.length) return;

    list.classList.add('note-task-list');
    taskItems.forEach(({ item, checkbox }) => {
      removeEmptyTaskPlaceholder(checkbox);
      checkbox.classList.add('note-todo-checkbox');
      checkbox.setAttribute('data-note-task', 'true');
      item.classList.add('note-task-list-item');
      if (editable) checkbox.removeAttribute('disabled');
    });
    changed = true;

    // 轻笺富文本的原生待办是「一行一个段落」。只在整个列表都是待办时转换，
    // 混合列表仍保留列表结构，避免破坏其中的普通项目和嵌套层级。
    if (!editable || taskItems.length !== items.length) return;
    const fragment = doc.createDocumentFragment();
    for (const { item, checkbox } of taskItems) {
      const paragraph = doc.createElement('p');
      moveTaskItemContentToParagraph(item, checkbox, paragraph);
      fragment.appendChild(paragraph);
    }
    list.replaceWith(fragment);
  });

  return changed ? doc.body.innerHTML : html;
}

export function noteHtmlToMarkdown(html: string) {
  return createNoteTurndownService().turndown(html || '');
}
