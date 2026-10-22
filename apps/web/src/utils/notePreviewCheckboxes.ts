/** 笔记阅读态只展示已保存的复选框状态，不加载编辑器或 HTML 转 Markdown 依赖。 */
export function makeNotePreviewCheckboxesReadonly(html: string) {
  if (!html || typeof DOMParser === 'undefined') return html || '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const checkboxes = Array.from(doc.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  if (!checkboxes.length) return html;

  checkboxes.forEach((checkbox) => {
    checkbox.disabled = true;
    checkbox.setAttribute('aria-disabled', 'true');
    checkbox.setAttribute('tabindex', '-1');
  });
  return doc.body.innerHTML;
}
