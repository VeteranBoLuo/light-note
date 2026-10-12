import { describe, expect, it } from 'vitest';
import { fixtures } from './fixtures.js';
import { validatePlan, validateRecords } from './contract.js';
import { planIssues } from './planQuality.js';
import { score } from './score.js';

const plan = (type = 'text') =>
  validatePlan({ recordDefinition: '一条记录', fields: [{ key: 'value', label: '值', type, rule: '保持原值' }] });
const result = (source, anchor, value, evidence, type = 'text') =>
  validateRecords(
    {
      records: [
        {
          anchor: { segment: 0, quote: anchor },
          cells: [{ value, status: 'found', evidence: evidence.map((quote) => ({ segment: 0, quote })) }],
        },
      ],
    },
    plan(type),
    source,
  )[0];

describe('table position and evidence completeness', () => {
  const products = fixtures.find((f) => f.id === 'products').source;
  it('resolves a unique full table cell despite a longer product name sharing the same prefix', () => {
    const r = result(products, 'Camera Module 3', '4 g', ['Weight | 3 g | 3 g | 4 g | 4 g']);
    expect(r.anchor.offset).toBe(products.segments[0].text.indexOf('Camera Module 3 |'));
    expect(r.cells[0]).toMatchObject({ status: 'found', evidenceIssues: [] });
    expect(r.cells[0].evidence[0].table).toMatchObject({
      column: 3,
      cell: { quote: '4 g' },
      columnHeader: { text: 'Camera Module 3' },
      rowHeader: { text: 'Weight' },
    });
  });
  it('does not accept a valid quote from the wrong product column', () => {
    const r = result(products, 'Camera Module 1', '8 megapixels', [
      'Still resolution | 5 megapixels | 8 megapixels | 11.9 megapixels | 11.9 megapixels',
    ]);
    expect(r.cells[0]).toMatchObject({
      status: 'evidence_incomplete',
      originalValue: '8 megapixels',
      evidenceIssues: ['table_column_value_mismatch'],
    });
  });
  it('preserves the original quote and stores its source row/column headers', () => {
    const quote = 'Sensor | OmniVision OV5647 | Sony IMX219 | Sony IMX708 | Sony IMX708';
    const r = result(products, 'Camera Module 2', 'Sony IMX219', [quote]);
    expect(r.cells[0].evidence[0]).toMatchObject({
      quote,
      table: { cell: { quote: 'Sony IMX219' }, columnHeader: { text: 'Camera Module 2' } },
    });
  });
  it('does not borrow another product identity from a shared header or accept a whole-table citation', () => {
    const header = products.segments[0].text.split('\n')[1];
    expect(result(products, 'Camera Module 3', 'Camera Module 2', [header]).cells[0].status).toBe(
      'evidence_incomplete',
    );
    expect(result(products, 'Camera Module 3', '4 g', [products.segments[0].text]).cells[0].status).toBe(
      'evidence_incomplete',
    );
  });
  it('does not guess between genuinely duplicate table headings', () => {
    const duplicate = structuredClone(products);
    duplicate.segments[0].text = duplicate.segments[0].text.replace('Camera Module 3 Wide', 'Camera Module 3');
    expect(() => result(duplicate, 'Camera Module 3', '4 g', ['Weight | 3 g | 3 g | 4 g | 4 g'])).toThrow('ambiguous');
  });
  it('does not match a partial numeric value or a date belonging to another product column', () => {
    const s = {
      id: 't',
      version: 'v1',
      complete: true,
      segments: [
        {
          id: 's1',
          text: 'Field | Product A | Product B\nCount | 12 | 2\nDate | 2025-01-01 | 2025-02-02',
          kind: 'original',
          locator: 'table',
        },
      ],
    };
    expect(result(s, 'Product A', '2', ['Count | 12 | 2'], 'number').cells[0].status).toBe('evidence_incomplete');
    expect(result(s, 'Product A', '2025-02-02', ['Date | 2025-01-01 | 2025-02-02'], 'date').cells[0].status).toBe(
      'evidence_incomplete',
    );
  });
  it('flags a narrow quote when two columns of the same record contain identical values', () => {
    const s = {
      id: 't',
      version: 'v1',
      complete: true,
      segments: [{ id: 's1', text: 'Item | Price | Count\nA | 1 | 1', kind: 'original', locator: 'table' }],
    };
    expect(result(s, 'A', '1', ['1'], 'number').cells[0]).toMatchObject({
      status: 'evidence_incomplete',
      evidenceIssues: ['table_column_ambiguous'],
    });
  });
  it('binds repeated room text to the current meeting, not the first identical room', () => {
    const events = fixtures.find((f) => f.id === 'events').source;
    const r = result(events, 'Advisory Board', 'Floor 5 - 503', ['Floor 5 - 503']);
    expect(r.cells[0].status).toBe('found');
    expect(r.cells[0].evidence[0].offset).toBe(events.segments[0].text.lastIndexOf('Floor 5 - 503'));
    expect(r.cells[0].evidence[0].table.rowHeader.text).toBe('Advisory Board');
  });
  it('flags a whole quote from another meeting even if its value occurs there', () => {
    const events = fixtures.find((f) => f.id === 'events').source;
    const r = result(events, 'Advisory Board', '16:45', ['Accessibility Guidelines WG | Floor 4 - 402 | 09:00–16:45']);
    expect(r.cells[0].status).toBe('evidence_incomplete');
  });
  it('requires the year as well as month/day for a normalized date', () => {
    const events = fixtures.find((f) => f.id === 'events').source;
    expect(result(events, 'Advisory Board', '2025-11-10', ['Monday 10 November'], 'date').cells[0].status).toBe(
      'evidence_incomplete',
    );
    expect(
      result(events, 'Advisory Board', '2025-11-10', ['TPAC 2025', 'Monday 10 November'], 'date').cells[0].status,
    ).toBe('found');
    expect(
      result(events, 'Advisory Board', '2026-11-10', ['TPAC 2025', 'Monday 10 November'], 'date').cells[0].status,
    ).toBe('evidence_incomplete');
  });
  it('does not mark invented summaries or partial numeric matches as supported', () => {
    const source = {
      id: 'a',
      version: 'v1',
      complete: true,
      segments: [{ id: 's1', text: '课程 A 共 12 课时。', kind: 'original', locator: '段落 1' }],
    };
    expect(result(source, '课程 A', '完整', ['课程 A 共 12 课时。']).cells[0].status).toBe('evidence_incomplete');
    expect(result(source, '课程 A', '2', ['课程 A 共 12 课时。'], 'number').cells[0].status).toBe(
      'evidence_incomplete',
    );
  });
});
describe('field suggestions', () => {
  it('scores a combined time range without hiding incorrect or unsupported endpoints', () => {
    const fixture = fixtures.find((f) => f.id === 'events');
    const p = { fields: ['name', 'date', 'time', 'timezone', 'room'].map((key) => ({ key, label: key })) };
    const records = fixture.rows.map((row) => ({
      cells: [row.name, row.date, `${row.start}–${row.end}`, row.timezone, row.room].map((originalValue) => ({
        originalValue,
        status: 'found',
      })),
    }));
    expect(score(fixture, p, records).correctCells).toBe(24);
    records[0].cells[2].originalValue = '09:00–16:40';
    expect(score(fixture, p, records).correctCells).toBe(23);
    records[0].cells[2].status = 'evidence_incomplete';
    expect(score(fixture, p, records).correctCells).toBe(22);
  });
  it('rejects cosmetically repeated labels with different keys', () => {
    expect(() =>
      validatePlan({
        recordDefinition: '一条记录',
        fields: [
          { key: 'room', label: '地点', type: 'text', rule: '原文' },
          { key: 'location', label: ' 地 点 ', type: 'text', rule: '原文' },
        ],
      }),
    ).toThrow('Repeated field label');
  });
  it('flags potentially redundant columns and system metadata without silently deleting them', () => {
    const fields = ['room', 'location', 'start_time', 'end_time', 'time_range', 'readability'].map((key) => ({
      id: key,
      key,
      label: key,
    }));
    expect(planIssues(fields).map((i) => i.code)).toEqual([
      'system_metadata_field',
      'possibly_redundant_fields',
      'redundant_time_range',
    ]);
    expect(fields).toHaveLength(6);
  });
  it('keeps legitimate distinct fields that happen to have equal values', () => {
    expect(
      planIssues([
        { id: '1', key: 'hours', label: '课时' },
        { id: '2', key: 'credits', label: '学分' },
      ]),
    ).toEqual([]);
  });
});
