import DOMPurify from 'dompurify';

export function appendPageTextToMarkdown(current: string, incoming: string): string {
  if (!current) return incoming;
  const separator = current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
  return `${current}${separator}${incoming}`;
}

export function pageTextToSafeHtml(value: string): string {
  const container = document.createElement('div');
  String(value || '').split(/\n{2,}/u).forEach((block) => {
    const paragraph = document.createElement('p');
    block.split('\n').forEach((line, index) => {
      if (index > 0) paragraph.append(document.createElement('br'));
      paragraph.append(document.createTextNode(line));
    });
    container.append(paragraph);
  });
  return DOMPurify.sanitize(container.innerHTML);
}

export function appendPageTextToHtml(current: string, incoming: string, hasCurrentBody: boolean): string {
  const separator = hasCurrentBody ? '<p><br></p>' : '';
  return DOMPurify.sanitize(`${current}${separator}${pageTextToSafeHtml(incoming)}`);
}
