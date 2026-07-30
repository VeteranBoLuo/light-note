export type NoteDiffLine = { type: 'same' | 'added' | 'removed'; text: string };
export type NoteSideBySideDiffRow = {
  type: 'same' | 'changed' | 'added' | 'removed';
  currentText: string;
  historicalText: string;
  currentLine: number | null;
  historicalLine: number | null;
};

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'DL',
  'DT',
  'DD',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);

export function noteHtmlToDiffText(html: string): string {
  const source = String(html || '');
  if (!source) return '';
  if (typeof DOMParser === 'undefined') {
    return source
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  const documentRoot = new DOMParser().parseFromString(source, 'text/html');
  documentRoot.querySelectorAll('script,style,noscript').forEach((element) => element.remove());
  const lines: string[] = [];
  let current = '';

  const pushLine = () => {
    const line = current.replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
    current = '';
  };
  const append = (value: string) => {
    const text = value.replace(/\s+/g, ' ');
    if (!text.trim()) return;
    if (current && !current.endsWith(' ') && !text.startsWith(' ')) current += ' ';
    current += text;
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent || '');
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR' || node.tagName === 'HR') {
      pushLine();
      return;
    }
    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock) pushLine();
    if (node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox') {
      append(node.hasAttribute('checked') ? '☑' : '☐');
    } else {
      node.childNodes.forEach(walk);
    }
    if (isBlock) pushLine();
  };

  documentRoot.body.childNodes.forEach(walk);
  pushLine();
  return lines.join('\n');
}

// 差异类型始终以“当前版本相对历史版本”为基准：
// added = 当前独有，removed = 历史独有（即当前已删除）。
export function buildNoteLineDiff(currentText: string, historicalText: string, maxLines = 400): NoteDiffLine[] {
  const current = String(currentText || '').split('\n').slice(0, maxLines);
  const historical = String(historicalText || '').split('\n').slice(0, maxLines);
  const matrix = Array.from({ length: current.length + 1 }, () => new Uint16Array(historical.length + 1));
  for (let i = current.length - 1; i >= 0; i--) {
    for (let j = historical.length - 1; j >= 0; j--) {
      matrix[i][j] =
        current[i] === historical[j]
          ? matrix[i + 1][j + 1] + 1
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }
  const result: NoteDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < current.length || j < historical.length) {
    if (i < current.length && j < historical.length && current[i] === historical[j]) {
      result.push({ type: 'same', text: current[i] });
      i++;
      j++;
    } else if (j < historical.length && (i >= current.length || matrix[i][j + 1] >= matrix[i + 1][j])) {
      result.push({ type: 'removed', text: historical[j++] });
    } else {
      result.push({ type: 'added', text: current[i++] });
    }
  }
  return result;
}

export function buildNoteSideBySideRows(lines: NoteDiffLine[]): NoteSideBySideDiffRow[] {
  const rows: NoteSideBySideDiffRow[] = [];
  let currentLine = 1;
  let historicalLine = 1;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.type === 'same') {
      rows.push({
        type: 'same',
        currentText: line.text,
        historicalText: line.text,
        currentLine: currentLine++,
        historicalLine: historicalLine++,
      });
      index += 1;
      continue;
    }

    const currentOnly: string[] = [];
    const historicalOnly: string[] = [];
    while (index < lines.length && lines[index].type !== 'same') {
      const changedLine = lines[index++];
      if (changedLine.type === 'added') currentOnly.push(changedLine.text);
      if (changedLine.type === 'removed') historicalOnly.push(changedLine.text);
    }
    const hunkSize = Math.max(currentOnly.length, historicalOnly.length);
    for (let offset = 0; offset < hunkSize; offset += 1) {
      const currentText = currentOnly[offset] ?? '';
      const historicalText = historicalOnly[offset] ?? '';
      rows.push({
        type: currentText && historicalText ? 'changed' : currentText ? 'added' : 'removed',
        currentText,
        historicalText,
        currentLine: currentText ? currentLine++ : null,
        historicalLine: historicalText ? historicalLine++ : null,
      });
    }
  }
  return rows;
}

export function extractNoteResourceReferenceKeys(content: string) {
  const keys = new Set<string>();
  const matcher = /\/(home|noteLibrary|cloudSpace)\/([^"'?\s<]+)/g;
  for (const match of String(content || '').matchAll(matcher)) keys.add(`${match[1]}:${match[2]}`);
  return keys;
}

export function compareNoteReferenceChanges(currentContent: string, targetContent: string) {
  const current = extractNoteResourceReferenceKeys(currentContent);
  const target = extractNoteResourceReferenceKeys(targetContent);
  return {
    added: [...target].filter((key) => !current.has(key)).length,
    removed: [...current].filter((key) => !target.has(key)).length,
  };
}
