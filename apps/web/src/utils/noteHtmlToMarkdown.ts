import TurndownService from 'turndown';

function isNoteTodoCheckbox(node: Node): node is HTMLInputElement {
  const input = node as HTMLInputElement;
  return input.nodeName === 'INPUT' && input.type === 'checkbox' && input.classList.contains('note-todo-checkbox');
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
    const taskItems = items.filter((item) => {
      const firstElement = item.firstElementChild;
      return firstElement instanceof HTMLInputElement && firstElement.type === 'checkbox';
    });
    if (!taskItems.length) return;

    list.classList.add('note-task-list');
    taskItems.forEach((item) => {
      const checkbox = item.firstElementChild as HTMLInputElement;
      checkbox.classList.add('note-todo-checkbox');
      item.classList.add('note-task-list-item');
      if (editable) checkbox.removeAttribute('disabled');
    });
    changed = true;

    // 轻笺富文本的原生待办是「一行一个段落」。只在整个列表都是待办时转换，
    // 混合列表仍保留列表结构，避免破坏其中的普通项目和嵌套层级。
    if (!editable || taskItems.length !== items.length) return;
    const fragment = doc.createDocumentFragment();
    for (const item of items) {
      const paragraph = doc.createElement('p');
      while (item.firstChild) paragraph.appendChild(item.firstChild);
      fragment.appendChild(paragraph);
    }
    list.replaceWith(fragment);
  });

  return changed ? doc.body.innerHTML : html;
}

export function noteHtmlToMarkdown(html: string) {
  return createNoteTurndownService().turndown(html || '');
}
