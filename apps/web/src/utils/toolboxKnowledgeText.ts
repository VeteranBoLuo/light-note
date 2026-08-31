export class ToolboxKnowledgeTextError extends Error {
  constructor(
    public readonly code:
      'INPUT_TOO_LARGE' | 'INVALID_REGEX' | 'TOO_MANY_MATCHES' | 'INVALID_JSON' | 'INVALID_PATH' | 'INVALID_CITATION',
  ) {
    super(code);
    this.name = 'ToolboxKnowledgeTextError';
  }
}

export interface TextBatchOptions {
  trimLines: boolean;
  normalizeWhitespace: boolean;
  removeBlankLines: boolean;
  deduplicate: boolean;
  sort: 'none' | 'asc' | 'desc';
  find: string;
  replacement: string;
  prefix: string;
  suffix: string;
}

export interface TextBatchResult {
  output: string;
  beforeLines: number;
  afterLines: number;
  changedLines: number;
  removedLines: number;
}

export function processTextBatch(source: string, options: TextBatchOptions): TextBatchResult {
  if (source.length > 1_000_000) throw new ToolboxKnowledgeTextError('INPUT_TOO_LARGE');
  const before = String(source || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n');
  let changedLines = 0;
  let lines = before.map((rawLine) => {
    let line = rawLine;
    if (options.trimLines) line = line.trim();
    if (options.normalizeWhitespace) line = line.replace(/[\t \u00a0]+/gu, ' ');
    if (options.find) line = line.split(options.find).join(options.replacement);
    if (options.prefix) line = `${options.prefix}${line}`;
    if (options.suffix) line = `${line}${options.suffix}`;
    if (line !== rawLine) changedLines += 1;
    return line;
  });
  if (options.removeBlankLines) lines = lines.filter((line) => line.trim());
  if (options.deduplicate) {
    const seen = new Set<string>();
    lines = lines.filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
  }
  if (options.sort !== 'none') {
    lines = [...lines].sort((left, right) =>
      options.sort === 'asc' ? left.localeCompare(right) : right.localeCompare(left),
    );
  }
  return {
    output: lines.join('\n'),
    beforeLines: before.length,
    afterLines: lines.length,
    changedLines,
    removedLines: Math.max(0, before.length - lines.length),
  };
}

export interface RegexMatchResult {
  index: number;
  line: number;
  column: number;
  value: string;
  groups: string[];
  namedGroups: Record<string, string>;
}

export function extractRegexMatches(source: string, pattern: string, flags = 'gu') {
  if (source.length > 1_000_000) throw new ToolboxKnowledgeTextError('INPUT_TOO_LARGE');
  if (!pattern || pattern.length > 500) throw new ToolboxKnowledgeTextError('INVALID_REGEX');
  let expression: RegExp;
  try {
    const normalizedFlags = [...new Set(`${flags}g`.split(''))].join('');
    expression = new RegExp(pattern, normalizedFlags);
  } catch {
    throw new ToolboxKnowledgeTextError('INVALID_REGEX');
  }
  const matches: RegexMatchResult[] = [];
  let match: RegExpExecArray | null;
  while ((match = expression.exec(source))) {
    if (matches.length >= 10_000) throw new ToolboxKnowledgeTextError('TOO_MANY_MATCHES');
    const before = source.slice(0, match.index);
    const lastBreak = before.lastIndexOf('\n');
    matches.push({
      index: match.index,
      line: before.split('\n').length,
      column: match.index - lastBreak,
      value: match[0],
      groups: match.slice(1).map((value) => value ?? ''),
      namedGroups: Object.fromEntries(Object.entries(match.groups || {}).map(([key, value]) => [key, value ?? ''])),
    });
    if (match[0] === '') expression.lastIndex += 1;
  }
  return matches;
}

export type MarkdownIssueCode =
  | 'missing_h1'
  | 'multiple_h1'
  | 'heading_jump'
  | 'duplicate_heading'
  | 'empty_link'
  | 'broken_link'
  | 'broken_wikilink';

export interface MarkdownCheckIssue {
  file: string;
  line: number;
  code: MarkdownIssueCode;
  severity: 'error' | 'warning';
  detail: string;
}

export interface MarkdownSourceFile {
  name: string;
  content: string;
}

function normalizeVaultPath(value: string) {
  return decodeURIComponent(value.split('#')[0] || '')
    .replace(/^\.\//u, '')
    .replace(/\\/gu, '/')
    .toLocaleLowerCase();
}

function resolveRelativePath(baseFile: string, target: string) {
  const base = baseFile.replace(/\\/gu, '/').split('/').slice(0, -1);
  for (const segment of normalizeVaultPath(target).split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') base.pop();
    else base.push(segment);
  }
  return base.join('/');
}

export function checkMarkdownKnowledgeBase(files: MarkdownSourceFile[]) {
  const filePaths = new Set(
    files.flatMap((file) => {
      const path = normalizeVaultPath(file.name);
      const withoutExtension = path.replace(/\.md$/u, '');
      const basename = withoutExtension.split('/').pop() || withoutExtension;
      return [path, withoutExtension, basename];
    }),
  );
  const issues: MarkdownCheckIssue[] = [];
  for (const file of files) {
    if (file.content.length > 1_000_000) throw new ToolboxKnowledgeTextError('INPUT_TOO_LARGE');
    const lines = file.content.replace(/\r\n?/gu, '\n').split('\n');
    const headings: Array<{ level: number; text: string; line: number }> = [];
    lines.forEach((line, index) => {
      const heading = /^(#{1,6})\s+(.+?)\s*#*$/u.exec(line);
      if (heading) headings.push({ level: heading[1]!.length, text: heading[2]!.trim(), line: index + 1 });
      for (const match of line.matchAll(/(?<!!)\[[^\]]*\]\(([^)]*)\)/gu)) {
        const target = (match[1] || '').trim();
        if (!target) {
          issues.push({ file: file.name, line: index + 1, code: 'empty_link', severity: 'error', detail: '' });
        } else if (!/^(?:https?:|mailto:|tel:|#)/iu.test(target)) {
          const resolved = resolveRelativePath(file.name, target);
          const alternatives = [resolved, resolved.replace(/\.md$/u, ''), `${resolved}.md`];
          if (!alternatives.some((path) => filePaths.has(path))) {
            issues.push({ file: file.name, line: index + 1, code: 'broken_link', severity: 'error', detail: target });
          }
        }
      }
      for (const match of line.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/gu)) {
        const target = normalizeVaultPath(match[1] || '');
        if (target && !filePaths.has(target) && !filePaths.has(target.replace(/\.md$/u, ''))) {
          issues.push({
            file: file.name,
            line: index + 1,
            code: 'broken_wikilink',
            severity: 'error',
            detail: match[1] || '',
          });
        }
      }
    });
    const h1 = headings.filter((heading) => heading.level === 1);
    if (!h1.length) issues.push({ file: file.name, line: 1, code: 'missing_h1', severity: 'warning', detail: '' });
    if (h1.length > 1) {
      for (const heading of h1.slice(1)) {
        issues.push({
          file: file.name,
          line: heading.line,
          code: 'multiple_h1',
          severity: 'warning',
          detail: heading.text,
        });
      }
    }
    const seenHeadings = new Set<string>();
    headings.forEach((heading, index) => {
      const normalized = heading.text.toLocaleLowerCase();
      if (seenHeadings.has(normalized)) {
        issues.push({
          file: file.name,
          line: heading.line,
          code: 'duplicate_heading',
          severity: 'warning',
          detail: heading.text,
        });
      }
      seenHeadings.add(normalized);
      const previous = headings[index - 1];
      if (previous && heading.level > previous.level + 1) {
        issues.push({
          file: file.name,
          line: heading.line,
          code: 'heading_jump',
          severity: 'warning',
          detail: `${previous.level}->${heading.level}`,
        });
      }
    });
  }
  return issues.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

export interface FrontmatterDocument {
  attributes: Record<string, string>;
  body: string;
  hasFrontmatter: boolean;
}

export function parseFrontmatterDocument(content: string): FrontmatterDocument {
  const normalized = String(content || '').replace(/\r\n?/gu, '\n');
  if (!normalized.startsWith('---\n')) return { attributes: {}, body: normalized, hasFrontmatter: false };
  const closing = normalized.indexOf('\n---\n', 4);
  if (closing < 0) return { attributes: {}, body: normalized, hasFrontmatter: false };
  const block = normalized.slice(4, closing);
  const attributes: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
    if (match) attributes[match[1]!] = match[2] || '';
  }
  return { attributes, body: normalized.slice(closing + 5), hasFrontmatter: true };
}

export function updateFrontmatterDocument(content: string, updates: Record<string, string>, removeKeys: string[] = []) {
  const parsed = parseFrontmatterDocument(content);
  const attributes = { ...parsed.attributes };
  for (const key of removeKeys) delete attributes[key];
  for (const [key, value] of Object.entries(updates)) {
    const normalizedKey = key.trim();
    if (/^[A-Za-z0-9_-]+$/u.test(normalizedKey)) attributes[normalizedKey] = value.trim();
  }
  const lines = Object.entries(attributes).map(([key, value]) => `${key}: ${value}`);
  if (!lines.length) return parsed.body.replace(/^\n+/u, '');
  return `---\n${lines.join('\n')}\n---\n${parsed.body.replace(/^\n*/u, '\n')}`;
}

export interface CitationRecord {
  id: string;
  type: string;
  title: string;
  authors: string[];
  year: string;
  container: string;
  doi: string;
  url: string;
}

function cleanCitationValue(value: string) {
  return value
    .trim()
    .replace(/^\{+|\}+$/gu, '')
    .replace(/^"+|"+$/gu, '')
    .trim();
}

function parseBibtex(source: string) {
  const records: CitationRecord[] = [];
  for (const entry of source.matchAll(/@(\w+)\s*\{\s*([^,]+),([\s\S]*?)(?=\n?\s*\}\s*(?:@|$))/gu)) {
    const fields: Record<string, string> = {};
    for (const field of (entry[3] || '').matchAll(/(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,\n]+)\s*,?/gu)) {
      fields[(field[1] || '').toLocaleLowerCase()] = cleanCitationValue(field[2] || '');
    }
    records.push({
      id: (entry[2] || `ref-${records.length + 1}`).trim(),
      type: (entry[1] || 'article').toLocaleLowerCase(),
      title: fields.title || '',
      authors: (fields.author || '').split(/\s+and\s+/iu).filter(Boolean),
      year: fields.year || fields.date?.slice(0, 4) || '',
      container: fields.journal || fields.booktitle || fields.publisher || '',
      doi: fields.doi || '',
      url: fields.url || '',
    });
  }
  return records;
}

function parseRis(source: string) {
  const records: CitationRecord[] = [];
  let current: CitationRecord | null = null;
  for (const line of source.replace(/\r\n?/gu, '\n').split('\n')) {
    const match = /^([A-Z0-9]{2})\s*-\s?(.*)$/u.exec(line);
    if (!match) continue;
    const tag = match[1]!;
    const value = match[2]!.trim();
    if (tag === 'TY') {
      current = {
        id: `ref-${records.length + 1}`,
        type: value || 'GEN',
        title: '',
        authors: [],
        year: '',
        container: '',
        doi: '',
        url: '',
      };
    }
    if (!current) continue;
    if (tag === 'TI' || tag === 'T1') current.title = value;
    else if (tag === 'AU' || tag === 'A1') current.authors.push(value);
    else if (tag === 'PY' || tag === 'Y1') current.year = value.slice(0, 4);
    else if (tag === 'JO' || tag === 'JF' || tag === 'T2') current.container = value;
    else if (tag === 'DO') current.doi = value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '');
    else if (tag === 'UR') current.url = value;
    else if (tag === 'ID') current.id = value || current.id;
    else if (tag === 'ER') {
      records.push(current);
      current = null;
    }
  }
  if (current) records.push(current);
  return records;
}

export function parseCitations(source: string, format: 'auto' | 'bibtex' | 'ris') {
  if (source.length > 500_000) throw new ToolboxKnowledgeTextError('INPUT_TOO_LARGE');
  const resolved =
    format === 'auto' ? (/^\s*@\w+\s*\{/u.test(source) ? 'bibtex' : /^TY\s*-/mu.test(source) ? 'ris' : null) : format;
  const records = resolved === 'bibtex' ? parseBibtex(source) : resolved === 'ris' ? parseRis(source) : [];
  if (!records.length) throw new ToolboxKnowledgeTextError('INVALID_CITATION');
  return records;
}

function citationId(record: CitationRecord, index: number) {
  return record.id.replace(/[^A-Za-z0-9_:-]+/gu, '') || `lightnote${index + 1}`;
}

export function formatCitations(records: CitationRecord[], format: 'apa' | 'bibtex' | 'ris') {
  if (format === 'apa') {
    return records
      .map((record) => {
        const authors = record.authors.length ? record.authors.join(', ') : 'Unknown author';
        const year = record.year || 'n.d.';
        const location = record.doi ? `https://doi.org/${record.doi}` : record.url;
        return `${authors} (${year}). ${record.title || '[Untitled]'}.${record.container ? ` ${record.container}.` : ''}${location ? ` ${location}` : ''}`;
      })
      .join('\n\n');
  }
  if (format === 'ris') {
    return records
      .map((record) =>
        [
          `TY  - ${record.type.toLocaleUpperCase().slice(0, 4) || 'GEN'}`,
          `ID  - ${record.id}`,
          `TI  - ${record.title}`,
          ...record.authors.map((author) => `AU  - ${author}`),
          ...(record.year ? [`PY  - ${record.year}`] : []),
          ...(record.container ? [`JO  - ${record.container}`] : []),
          ...(record.doi ? [`DO  - ${record.doi}`] : []),
          ...(record.url ? [`UR  - ${record.url}`] : []),
          'ER  -',
        ].join('\n'),
      )
      .join('\n\n');
  }
  return records
    .map((record, index) => {
      const fields = [
        `  title = {${record.title}}`,
        ...(record.authors.length ? [`  author = {${record.authors.join(' and ')}}`] : []),
        ...(record.year ? [`  year = {${record.year}}`] : []),
        ...(record.container ? [`  journal = {${record.container}}`] : []),
        ...(record.doi ? [`  doi = {${record.doi}}`] : []),
        ...(record.url ? [`  url = {${record.url}}`] : []),
      ];
      return `@${record.type || 'article'}{${citationId(record, index)},\n${fields.join(',\n')}\n}`;
    })
    .join('\n\n');
}

function sortStructuredKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStructuredKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortStructuredKeys(entry)]),
  );
}

function flattenStructuredValue(value: unknown, prefix = '$', output: Record<string, unknown> = {}) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => flattenStructuredValue(entry, `${prefix}[${index}]`, output));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      flattenStructuredValue(entry, `${prefix}.${key}`, output);
    }
  } else output[prefix] = value;
  return output;
}

export function queryStructuredPath(value: unknown, path: string) {
  const normalized = path.trim();
  if (!normalized || normalized === '$') return value;
  if (!normalized.startsWith('$')) throw new ToolboxKnowledgeTextError('INVALID_PATH');
  const tokens: Array<string | number> = [];
  const matcher = /\.([A-Za-z_$][\w$-]*)|\[(\d+)\]|\[['"]([^'"]+)['"]\]/gu;
  let consumed = 1;
  for (const match of normalized.slice(1).matchAll(matcher)) {
    if ((match.index || 0) !== consumed - 1) throw new ToolboxKnowledgeTextError('INVALID_PATH');
    tokens.push(match[1] || match[3] || Number(match[2]));
    consumed += match[0].length;
  }
  if (consumed !== normalized.length) throw new ToolboxKnowledgeTextError('INVALID_PATH');
  let current = value;
  for (const token of tokens) {
    if (current == null || typeof current !== 'object' || !(token in (current as Record<string | number, unknown>))) {
      throw new ToolboxKnowledgeTextError('INVALID_PATH');
    }
    current = (current as Record<string | number, unknown>)[token];
  }
  return current;
}

export function transformStructuredData(
  source: string,
  operation: 'format' | 'minify' | 'sort_keys' | 'flatten' | 'query',
  path = '$',
) {
  if (source.length > 1_000_000) throw new ToolboxKnowledgeTextError('INPUT_TOO_LARGE');
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ToolboxKnowledgeTextError('INVALID_JSON');
  }
  if (operation === 'query') value = queryStructuredPath(value, path);
  else if (operation === 'sort_keys') value = sortStructuredKeys(value);
  else if (operation === 'flatten') value = flattenStructuredValue(value);
  return JSON.stringify(value, null, operation === 'minify' ? 0 : 2);
}
