import { describe, expect, it } from 'vitest';
import {
  checkMarkdownKnowledgeBase,
  extractRegexMatches,
  formatCitations,
  parseCitations,
  processTextBatch,
  queryStructuredPath,
  transformStructuredData,
  updateFrontmatterDocument,
} from './toolboxKnowledgeText';

describe('toolbox knowledge text utilities', () => {
  it('batches line cleanup deterministically', () => {
    const result = processTextBatch('  B  \nA\nA\n\n', {
      trimLines: true,
      normalizeWhitespace: true,
      removeBlankLines: true,
      deduplicate: true,
      sort: 'asc',
      find: '',
      replacement: '',
      prefix: '',
      suffix: '',
    });
    expect(result.output).toBe('A\nB');
    expect(result.removedLines).toBe(3);
  });

  it('extracts regex matches with lines and groups', () => {
    const matches = extractRegexMatches('alpha=12\nbeta=35', '(?<key>\\w+)=(\\d+)', 'gu');
    expect(matches).toHaveLength(2);
    expect(matches[1]).toMatchObject({ line: 2, column: 1, groups: ['beta', '35'] });
    expect(matches[0]?.namedGroups).toEqual({ key: 'alpha' });
  });

  it('finds heading and link problems across a Markdown vault', () => {
    const issues = checkMarkdownKnowledgeBase([
      { name: 'index.md', content: '# Home\n### Jump\n[Good](note.md)\n[Bad](missing.md)\n[[Ghost]]' },
      { name: 'note.md', content: '## No H1' },
    ]);
    expect(issues.some((issue) => issue.code === 'heading_jump')).toBe(true);
    expect(issues.some((issue) => issue.code === 'broken_link')).toBe(true);
    expect(issues.some((issue) => issue.code === 'broken_wikilink')).toBe(true);
    expect(issues.some((issue) => issue.file === 'note.md' && issue.code === 'missing_h1')).toBe(true);
  });

  it('updates simple frontmatter while preserving the body', () => {
    const updated = updateFrontmatterDocument(
      '---\ntitle: Old\ntags: demo\n---\n# Body',
      { title: 'New', status: 'ready' },
      ['tags'],
    );
    expect(updated).toContain('title: New');
    expect(updated).toContain('status: ready');
    expect(updated).not.toContain('tags:');
    expect(updated).toContain('# Body');
  });

  it('converts BibTeX to normalized text and RIS', () => {
    const records = parseCitations(
      '@article{demo,\n title={A useful paper},\n author={Ada Lovelace and Alan Turing},\n year={2024},\n doi={10.1/demo}\n}',
      'bibtex',
    );
    expect(records[0]?.authors).toEqual(['Ada Lovelace', 'Alan Turing']);
    expect(formatCitations(records, 'apa')).toContain('https://doi.org/10.1/demo');
    expect(formatCitations(records, 'ris')).toContain('TI  - A useful paper');
  });

  it('formats, flattens, sorts and queries structured data', () => {
    const source = '{"b":2,"a":{"items":[{"name":"first"}]}}';
    expect(transformStructuredData(source, 'sort_keys')).toMatch(/^\{\n  "a"/u);
    expect(transformStructuredData(source, 'flatten')).toContain('$.a.items[0].name');
    const value = JSON.parse(source);
    expect(queryStructuredPath(value, '$.a.items[0].name')).toBe('first');
  });
});
