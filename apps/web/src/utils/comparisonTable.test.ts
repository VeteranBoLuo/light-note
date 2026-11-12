import { expect, it } from 'vitest';
import { comparisonTableMarkdown } from '@lightnote/shared/comparison-table';
import { comparisonCsv, comparisonExportRows } from './comparisonTable';
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
