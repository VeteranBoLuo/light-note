import { describe, expect, it } from 'vitest';
import {
  extractRegexMatches,
  formatCitations,
  parseCitations,
  queryStructuredPath,
  transformStructuredData,
  updateFrontmatterDocument,
} from './toolboxKnowledgeText';

describe('toolbox knowledge text utilities', () => {

  it('extracts regex matches with lines and groups', () => {
    const matches = extractRegexMatches('alpha=12\nbeta=35', '(?<key>\\w+)=(\\d+)', 'gu');
    expect(matches).toHaveLength(2);
    expect(matches[1]).toMatchObject({ line: 2, column: 1, groups: ['beta', '35'] });
    expect(matches[0]?.namedGroups).toEqual({ key: 'alpha' });
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
