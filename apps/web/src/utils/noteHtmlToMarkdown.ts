import TurndownService from 'turndown';

function isNoteTodoCheckbox(node: Node): node is HTMLInputElement {
  const input = node as HTMLInputElement;
  return input.nodeName === 'INPUT' && input.type === 'checkbox' && input.classList.contains('note-todo-checkbox');
}

export function createNoteTurndownService() {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
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

export function noteHtmlToMarkdown(html: string) {
  return createNoteTurndownService().turndown(html || '');
}
