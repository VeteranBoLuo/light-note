import { expect, it } from 'vitest';
import { normalizeComparisonColumns, comparisonTableMarkdown } from '@lightnote/shared/comparison-table';
import { suggestComparisonColumns, comparisonCsv, comparisonExportRows } from './comparisonTable';
it('suggests readable headings from a simple comparison request', () => {
  expect(
    suggestComparisonColumns('比较这几份方案的价格、支持平台、团队协作和离线能力。', '内容、范围').map((c) => c.label),
  ).toEqual(['价格', '支持平台', '团队协作', '离线能力']);
  expect(suggestComparisonColumns('帮我比较一下', '内容、范围')).toHaveLength(2);
});
it('rejects blank, duplicate and oversized column configurations', () => {
  for (const labels of [[], [''], ['价格', '价格'], ['x'.repeat(41)], Array.from({ length: 13 }, (_, i) => String(i))])
    expect(() => normalizeComparisonColumns(labels.map((label) => ({ label })))).toThrow();
});
it('escapes spreadsheet formulas and markdown while retaining original text as data', () => {
  expect(comparisonCsv([['=HYPERLINK("test")', '+10']])).toContain("'=HYPERLINK");
  const content = comparisonTableMarkdown({
    columns: [{ label: 'a|b', type: 'auto', rule: '' }],
    rows: [
      {
        sourceId: 'note:a',
        title: '<script>',
        cells: [{ value: '[x](javascript:bad)', status: 'found', quotes: ['<img>'] }],
      },
    ],
  });
  expect(content).toContain('a&#124;b');
  expect(content).toContain('&lt;script&gt;');
  expect(content).toContain('\\[x\\]');
});

it('exports cleared values as empty markers while retaining review status', () => {
  const rows = comparisonExportRows(
    {
      columns: [{ label: 'Price', type: 'auto', rule: '' }],
      rows: [
        {
          sourceId: 'note:a',
          title: 'A',
          cells: [{ value: '', status: 'found', quotes: ['39'], edited: true, reviewed: true, originalValue: '39' }],
        },
      ],
    },
    (key) => key,
  );
  expect(rows[1][1]).toBe('— (edited)');
  expect(
    comparisonTableMarkdown({
      columns: [{ label: 'Price', type: 'auto', rule: '' }],
      rows: [
        {
          sourceId: 'note:a',
          title: 'A',
          cells: [{ value: '', status: 'conflict', quotes: ['39'], edited: true, reviewed: true }],
        },
      ],
    }),
  ).toContain('—（已修改）');
});
