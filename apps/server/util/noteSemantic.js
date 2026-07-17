import { load } from 'cheerio';
import { marked } from 'marked';

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'fieldset',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

const CONTAINER_TAGS = new Set([
  'address',
  'article',
  'aside',
  'div',
  'fieldset',
  'figure',
  'footer',
  'form',
  'header',
  'main',
  'nav',
  'section',
]);

const TASK_INTENT_PATTERN =
  /未完成|已完成|完成了|完成项|待完成|待办|任务|进度|勾选|复选框|checklist|todo|task|pending|completed|done/i;
const IMAGE_INTENT_PATTERN = /图片|图中|截图|照片|插图|图表|看图|识图|文字识别|ocr|image|screenshot|photo|figure/i;

function cleanInline(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeHtml(value) {
  return /<(?:p|div|h[1-6]|ul|ol|li|table|pre|blockquote|input|img|br|strong|em|a)\b[^>]*>/i.test(String(value || ''));
}

function normalizeNoteFormat(type, content) {
  const normalized = type === 'md' ? 'markdown' : String(type || 'html').toLowerCase();
  if (normalized === 'markdown' && !looksLikeHtml(content)) return 'markdown';
  return looksLikeHtml(content) || normalized === 'html' ? 'html' : 'markdown';
}

function checkboxState($, element) {
  const node = $(element);
  const checked =
    node.attr('checked') != null ||
    String(node.attr('aria-checked') || '').toLowerCase() === 'true' ||
    String(node.attr('data-checked') || '').toLowerCase() === 'true';
  return checked;
}

function inlineText($, node) {
  if (!node) return '';
  if (node.type === 'text') return node.data || '';
  if (node.type !== 'tag') return '';

  const tag = String(node.name || '').toLowerCase();
  const element = $(node);
  if (tag === 'br') return '\n';
  if (tag === 'input' && String(element.attr('type') || '').toLowerCase() === 'checkbox') {
    return checkboxState($, node) ? '[x]' : '[ ]';
  }
  if (tag === 'img') {
    const alt = cleanInline(element.attr('alt') || element.attr('title') || '');
    return alt ? `[图片：${alt}]` : '[图片]';
  }

  const childText = cleanInline((node.children || []).map((child) => inlineText($, child)).join(''));
  if (!childText) return '';

  if (tag === 'a') {
    const href = cleanInline(element.attr('href') || '');
    return href && href !== childText ? `${childText}（${href}）` : childText;
  }
  if (tag === 'strong' || tag === 'b') return `**${childText}**`;
  if (tag === 'em' || tag === 'i') return `*${childText}*`;
  if (tag === 'del' || tag === 's' || tag === 'strike') return `~~${childText}~~`;
  if (tag === 'code') return `\`${childText}\``;
  return childText;
}

function elementTextWithout($, element, selectors = []) {
  const clone = $(element).clone();
  for (const selector of selectors) clone.find(selector).remove();
  const root = clone.get(0);
  return cleanInline(inlineText($, root));
}

function firstCheckbox($, element) {
  const own = $(element).is('input[type="checkbox"]') ? $(element) : null;
  return own?.length ? own.get(0) : $(element).find('input[type="checkbox"]').first().get(0) || null;
}

function tableBlock($, element) {
  const rows = [];
  $(element)
    .find('tr')
    .each((_, row) => {
      const cells = [];
      $(row)
        .children('th,td')
        .each((__, cell) => cells.push(cleanInline(inlineText($, cell))));
      if (cells.some(Boolean)) rows.push({ cells, header: $(row).children('th').length > 0 });
    });
  if (!rows.length) return null;
  const firstIsHeader = rows[0].header;
  return {
    type: 'table',
    headers: firstIsHeader ? rows[0].cells : [],
    rows: (firstIsHeader ? rows.slice(1) : rows).map((row) => row.cells),
  };
}

function codeLanguage($, element) {
  const code = $(element).find('code').first();
  const values = [
    $(element).attr('data-language'),
    code.attr('data-language'),
    code.attr('class'),
    $(element).attr('class'),
  ];
  for (const value of values) {
    const match = /(?:language-|lang-)?([a-z0-9_+#.-]+)/i.exec(String(value || ''));
    if (match?.[1] && !['code-block', 'language'].includes(match[1].toLowerCase())) return match[1].slice(0, 40);
  }
  return '';
}

function parseList($, element, blocks, depth = 0) {
  const ordered = String(element.name || '').toLowerCase() === 'ol';
  $(element)
    .children('li')
    .each((index, item) => {
      const checkbox = firstCheckbox($, item);
      const text = elementTextWithout($, item, ['ul', 'ol', 'input[type="checkbox"]']);
      if (checkbox) {
        blocks.push({ type: 'task', checked: checkboxState($, checkbox), text, depth });
      } else if (text) {
        blocks.push({ type: 'list_item', ordered, index: index + 1, text, depth });
      }
      $(item)
        .children('ul,ol')
        .each((_, nested) => parseList($, nested, blocks, depth + 1));
    });
}

function hasDirectBlockChild(node) {
  return (node.children || []).some(
    (child) => child.type === 'tag' && BLOCK_TAGS.has(String(child.name || '').toLowerCase()),
  );
}

function processNode($, node, blocks) {
  if (!node) return;
  if (node.type === 'text') {
    const text = cleanInline(node.data || '');
    if (text) blocks.push({ type: 'paragraph', text });
    return;
  }
  if (node.type !== 'tag') return;

  const tag = String(node.name || '').toLowerCase();
  const element = $(node);
  if (['script', 'style', 'noscript', 'template'].includes(tag)) return;

  if (/^h[1-6]$/.test(tag)) {
    const text = cleanInline(inlineText($, node));
    if (text) blocks.push({ type: 'heading', level: Number(tag.slice(1)), text });
    return;
  }
  if (tag === 'ul' || tag === 'ol') {
    parseList($, node, blocks);
    return;
  }
  if (tag === 'table') {
    const table = tableBlock($, node);
    if (table) blocks.push(table);
    return;
  }
  if (tag === 'pre') {
    const text = cleanInline(element.text());
    if (text) blocks.push({ type: 'code', language: codeLanguage($, node), text });
    return;
  }
  if (tag === 'blockquote') {
    const text = cleanInline(inlineText($, node));
    if (text) blocks.push({ type: 'quote', text });
    return;
  }
  if (tag === 'hr') {
    blocks.push({ type: 'divider' });
    return;
  }
  if (tag === 'img') {
    blocks.push({
      type: 'image',
      alt: cleanInline(element.attr('alt') || element.attr('title') || ''),
      url: cleanInline(element.attr('src') || ''),
    });
    return;
  }

  if (tag === 'p' || (CONTAINER_TAGS.has(tag) && !hasDirectBlockChild(node))) {
    const checkbox = firstCheckbox($, node);
    const text = elementTextWithout($, node, checkbox ? ['input[type="checkbox"]'] : []);
    if (checkbox) blocks.push({ type: 'task', checked: checkboxState($, checkbox), text, depth: 0 });
    else if (text) blocks.push({ type: 'paragraph', text });
    return;
  }

  if (CONTAINER_TAGS.has(tag) || hasDirectBlockChild(node)) {
    for (const child of node.children || []) processNode($, child, blocks);
    return;
  }

  const text = cleanInline(inlineText($, node));
  if (text) blocks.push({ type: 'paragraph', text });
}

function collectImages($) {
  const seen = new Set();
  const images = [];
  $('img').each((_, image) => {
    const url = cleanInline($(image).attr('src') || '');
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({
      url,
      alt: cleanInline($(image).attr('alt') || ''),
      title: cleanInline($(image).attr('title') || ''),
      order: images.length + 1,
    });
  });
  return images;
}

function collectChecklist($) {
  const items = [];
  $('input[type="checkbox"]').each((_, checkbox) => {
    const owner = $(checkbox).closest('li,p,td,th,div').first();
    const text = owner.length ? elementTextWithout($, owner.get(0), ['input[type="checkbox"]', 'ul', 'ol']) : '';
    items.push({ checked: checkboxState($, checkbox), text: text || '未命名任务' });
  });
  return items;
}

function dedupeAdjacentBlocks(blocks) {
  const output = [];
  for (const block of blocks) {
    const previous = output[output.length - 1];
    if (previous && block.type === 'paragraph' && previous.type === 'paragraph' && block.text === previous.text) {
      continue;
    }
    output.push(block);
  }
  return output;
}

export function parseNoteContent({ content = '', type = 'html' } = {}) {
  const source = String(content || '');
  const format = normalizeNoteFormat(type, source);
  let html = source;
  if (format === 'markdown') {
    html = marked.parse(source, { async: false, gfm: true, breaks: false });
  }
  const $ = load(`<body>${html}</body>`);
  $('script,style,noscript,template').remove();
  const blocks = [];
  for (const child of $('body').get(0)?.children || []) processNode($, child, blocks);
  const normalizedBlocks = dedupeAdjacentBlocks(blocks);
  // 复选状态直接以 DOM 中的 input 为权威来源，既覆盖段落/列表，也覆盖表格单元格等结构。
  // 普通 ul/ol 不含 checkbox，因此不会被误判成“全部未完成”。
  const tasks = collectChecklist($);
  return {
    format,
    blocks: normalizedBlocks,
    images: collectImages($),
    checklist: {
      total: tasks.length,
      completed: tasks.filter((task) => task.checked).length,
      pending: tasks.filter((task) => !task.checked).length,
      completedItems: tasks.filter((task) => task.checked).map((task) => task.text),
      pendingItems: tasks.filter((task) => !task.checked).map((task) => task.text),
    },
  };
}

function escapeTableCell(value) {
  return cleanInline(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function renderBlock(block) {
  if (block.type === 'heading') return `${'#'.repeat(Math.min(6, Math.max(1, block.level || 1)))} ${block.text}`;
  if (block.type === 'paragraph') return block.text;
  if (block.type === 'task') return `${'  '.repeat(block.depth || 0)}- [${block.checked ? 'x' : ' '}] ${block.text}`;
  if (block.type === 'list_item') {
    const marker = block.ordered ? `${block.index || 1}.` : '-';
    return `${'  '.repeat(block.depth || 0)}${marker} ${block.text}`;
  }
  if (block.type === 'quote')
    return block.text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  if (block.type === 'code') return `\`\`\`${block.language || ''}\n${block.text}\n\`\`\``;
  if (block.type === 'divider') return '---';
  if (block.type === 'image') {
    const label = block.alt ? `图片：${block.alt}` : '图片';
    return block.url ? `[${label}](${block.url})` : `[${label}]`;
  }
  if (block.type === 'table') {
    const width = Math.max(block.headers?.length || 0, ...(block.rows || []).map((row) => row.length), 1);
    const headers = block.headers?.length
      ? block.headers
      : Array.from({ length: width }, (_, index) => `列${index + 1}`);
    const normalizeRow = (row) => Array.from({ length: width }, (_, index) => escapeTableCell(row[index] || ''));
    return [
      `| ${normalizeRow(headers).join(' | ')} |`,
      `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
      ...(block.rows || []).map((row) => `| ${normalizeRow(row).join(' | ')} |`),
    ].join('\n');
  }
  return '';
}

function chooseBlocks(document, { question = '', focus = 'all', taskStatus = 'all' } = {}) {
  const taskIntent = focus === 'tasks' || TASK_INTENT_PATTERN.test(String(question || ''));
  const imageIntent = focus === 'images' || IMAGE_INTENT_PATTERN.test(String(question || ''));
  if (taskIntent) {
    return document.blocks.filter(
      (block) =>
        block.type === 'heading' ||
        (block.type === 'task' &&
          (taskStatus === 'all' || (taskStatus === 'pending' ? !block.checked : block.checked))),
    );
  }
  if (imageIntent) {
    const selected = document.blocks.filter((block) => block.type === 'heading' || block.type === 'image');
    return selected.length ? selected : document.blocks;
  }
  return document.blocks;
}

function renderOcrResults(ocrResults) {
  if (!Array.isArray(ocrResults) || !ocrResults.length) return '';
  const lines = ['## 笔记图片文字识别'];
  for (const result of ocrResults) {
    const label = result.alt || `第 ${result.order || 1} 张图片`;
    if (result.status === 'success') lines.push(`### ${label}\n${result.content}`);
    else if (result.status === 'failed') lines.push(`### ${label}\n[这张图片的文字暂未识别成功]`);
    else if (result.status === 'unsupported') lines.push(`### ${label}\n[该图片不是轻笺本地上传图片，未自动读取]`);
  }
  return lines.join('\n\n');
}

export function renderNoteForAi(
  document,
  { question = '', focus = 'all', taskStatus = 'all', maxChars = 12000, ocrResults = [] } = {},
) {
  const sections = [];
  if (document.checklist?.total > 0) {
    sections.push(
      `[任务统计] 共 ${document.checklist.total} 项；已完成 ${document.checklist.completed} 项；未完成 ${document.checklist.pending} 项。` +
        '复选框 [x] 表示已完成，[ ] 表示未完成。',
    );
  }
  for (const block of chooseBlocks(document, { question, focus, taskStatus })) {
    const rawRendered = renderBlock(block);
    // 嵌套列表依赖行首缩进表达层级，不能被通用 trim 清掉。
    const rendered = ['task', 'list_item'].includes(block.type)
      ? String(rawRendered || '').replace(/[ \t]+$/g, '')
      : cleanInline(rawRendered);
    if (rendered) sections.push(rendered);
  }
  const ocrText = renderOcrResults(ocrResults);
  if (ocrText) sections.push(ocrText);

  const limit = Math.max(500, Number(maxChars || 12000));
  let output = '';
  for (const section of sections) {
    const separator = output ? '\n\n' : '';
    if (output.length + separator.length + section.length <= limit) {
      output += separator + section;
      continue;
    }
    const remaining = limit - output.length - separator.length;
    if (remaining > 80) output += separator + section.slice(0, remaining - 16) + '\n[内容已截断]';
    break;
  }
  return output || '(笔记正文为空)';
}

export function noteQuestionNeedsImageOcr(question, document) {
  if (!document?.images?.length) return false;
  const text = Array.isArray(document.blocks)
    ? renderNoteForAi(document, { maxChars: 400 }).replace(/\s+/g, ' ').trim()
    : '';
  return (
    IMAGE_INTENT_PATTERN.test(String(question || '')) ||
    (Number(document.checklist?.total || 0) === 0 && text.length < 80)
  );
}

export function noteQuestionNeedsTaskDetails(question) {
  return TASK_INTENT_PATTERN.test(String(question || ''));
}
