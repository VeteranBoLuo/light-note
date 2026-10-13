import { Lexer } from 'marked';

export const EVIDENCE_VALIDATION_VERSION = 2;
// Deterministic support only. Formatting equivalence is not semantic entailment.
const clean = (value) => String(value).normalize('NFKC').trim().replace(/\s+/g, ' ');
export function textTables(text) {
  const tables = [];
  let table = null;
  let offset = 0;
  for (const line of text.split('\n')) {
    const raw = line.replace(/\r$/, '');
    const parts = raw.split('|');
    if (parts.length < 2 || raw.includes('\\|')) {
      table = null;
      offset += line.length + 1;
      continue;
    }
    let columnOffset = offset;
    const cells = parts.map((part) => {
      const start = columnOffset + part.length - part.trimStart().length;
      columnOffset += part.length + 1;
      return { text: part.trim(), offset: start, end: start + part.trim().length };
    });
    if (!cells[0].text) cells.shift();
    if (!cells.at(-1)?.text) cells.pop();
    if (cells.length < 2) {
      table = null;
      offset += line.length + 1;
      continue;
    }
    if (!table || table.width !== cells.length) {
      table = { width: cells.length, rows: [] };
      tables.push(table);
    }
    if (!cells.every((c) => /^:?-+:?$/.test(c.text)))
      table.rows.push({ text: raw, offset, end: offset + raw.length, cells });
    offset += line.length + 1;
  }
  return tables.filter((t) => t.rows.length > 1);
}

export function findOffsets(text, quote) {
  const result = [];
  let from = 0;
  while (from <= text.length) {
    const offset = text.indexOf(quote, from);
    if (offset < 0) break;
    result.push(offset);
    from = offset + 1;
  }
  return result;
}
export function exactCellOffsets(text, quote) {
  return textTables(text).flatMap((t) =>
    t.rows.flatMap((r) => r.cells.filter((c) => c.text === quote).map((c) => c.offset)),
  );
}
function anchorPosition(table, anchor) {
  for (let row = 0; row < table.rows.length; row++) {
    const col = table.rows[row].cells.findIndex((c) => anchor.offset >= c.offset && anchor.offset < c.end);
    if (col >= 0 && ((row === 0 && col > 0) || (row > 0 && col === 0))) return { row, col };
  }
  return null;
}

// The server binds a cited table row/column to the record's original anchor. It does
// not infer a field's semantics or transform units. Context snippets remain verbatim.
export function bindTableEvidence(evidence, anchor, source, { exactPositions = false } = {}) {
  if (evidence.segmentId !== anchor.segmentId) return evidence;
  const segment = source.segments.find((s) => s.id === evidence.segmentId);
  for (const table of textTables(segment.text)) {
    const position = anchorPosition(table, anchor);
    if (!position) continue;
    const rowIndex = table.rows.findIndex(
      (r) => evidence.offset >= r.offset && evidence.offset + evidence.quote.length <= r.end,
    );
    if (rowIndex < 0) {
      if (evidence.offset < table.rows.at(-1).end && evidence.offset + evidence.quote.length > table.rows[0].offset)
        return { ...evidence, bindingIssue: 'table_span_not_specific' };
      continue;
    }
    let row = rowIndex;
    let col = position.col;
    if (exactPositions) {
      const citedColumn = table.rows[rowIndex].cells.findIndex(
        (c) => evidence.offset >= c.offset && evidence.offset + evidence.quote.length <= c.end,
      );
      if (position.row > 0) {
        if (rowIndex !== position.row)
          return rowIndex > 0 ? { ...evidence, bindingIssue: 'table_row_outside_record' } : evidence;
        if (citedColumn < 0) return evidence; // Whole record row already supplies context.
        col = citedColumn;
      } else if (citedColumn >= 0 && citedColumn !== position.col) {
        // A reference already identifies the exact cell. Never relocate it just
        // because another product has equal text, or infer a value from a label.
        return citedColumn === 0 ? evidence : { ...evidence, bindingIssue: 'table_column_outside_record' };
      }
    } else if (position.row > 0) {
      // A narrow repeated quote may initially resolve to an earlier record's row.
      const candidates = table.rows[position.row].cells
        .map((c, i) => (c.text.includes(evidence.quote) ? i : -1))
        .filter((i) => i >= 0);
      if (candidates.length === 1) {
        row = position.row;
        col = candidates[0];
      } else if (candidates.length > 1) {
        return { ...evidence, bindingIssue: 'table_column_ambiguous' };
      } else if (rowIndex === position.row) {
        const cells = table.rows[rowIndex].cells
          .map((c, i) => (evidence.offset >= c.offset && evidence.offset + evidence.quote.length <= c.end ? i : -1))
          .filter((i) => i >= 0);
        if (cells.length !== 1) return evidence; // Whole record row is already contextual.
        col = cells[0];
      } else return rowIndex > 0 ? { ...evidence, bindingIssue: 'table_row_outside_record' } : evidence;
    }
    const cell = table.rows[row].cells[col];
    const valueOffset = cell.text.indexOf(evidence.quote);
    const relocated = valueOffset >= 0 ? cell.offset + valueOffset : evidence.offset;
    return {
      ...evidence,
      offset: relocated,
      table: {
        orientation: position.row === 0 ? 'records_in_columns' : 'records_in_rows',
        row,
        column: col,
        cell: { quote: cell.text, offset: cell.offset },
        rowHeader: table.rows[row].cells[0],
        columnHeader: table.rows[0].cells[col],
      },
    };
  }
  return evidence;
}

function supportsDate(value, quotes) {
  const [year, month, day] = value.split('-').map(Number);
  const text = quotes.join('\n');
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const monthName = monthNames[month - 1];
  const yearPresent = new RegExp(`\\b${year}\\b`).test(text);
  const numeric = new RegExp(`(?:^|\\D)${year}[-/.年]0?${month}[-/.月]0?${day}(?:日|\\D|$)`).test(text);
  const english =
    monthName && new RegExp(`(?:\\b0?${day}\\s+${monthName}\\b|\\b${monthName}\\s+0?${day}\\b)`, 'i').test(text);
  const chinese = new RegExp(`(?:^|\\D)0?${month}月0?${day}日`).test(text);
  return numeric || (yearPresent && (english || chinese));
}
function readableQuote(quote, cache) {
  if (cache?.has(quote)) return cache.get(quote);
  const codes = [];
  const flatten = (tokens) =>
    tokens
      .map((token) => {
        if (token.type === 'codespan') {
          codes.push(clean(token.text));
          return token.text; // Code contents are literal: never parse/unescape them again.
        }
        if (['strong', 'em'].includes(token.type)) return flatten(token.tokens);
        if (['text', 'escape'].includes(token.type)) return token.text;
        // Do not erase links, deleted text or HTML and accidentally join their neighbours.
        return `\u0000${token.raw}\u0000`;
      })
      .join('');
  const result = { text: clean(flatten(Lexer.lexInline(quote, { gfm: true }))), codes };
  // Request-local, bounded reuse for repeated section headings and table cells.
  if (cache && cache.size < 2048) cache.set(quote, result);
  return result;
}
function quoteText(evidence, quote, options) {
  return evidence.kind !== 'ocr' && (evidence.format === 'markdown' || options.markdown)
    ? readableQuote(quote, options.cache)
    : { text: clean(quote), codes: [] };
}
export function checkEvidence(value, type, evidence, options = {}) {
  const bindingIssues = [...new Set(evidence.map((e) => e.bindingIssue).filter(Boolean))];
  if (bindingIssues.length) return bindingIssues;
  const quotes = evidence.map((e) => e.quote);
  const bound = evidence.filter((e) => e.table?.orientation === 'records_in_columns');
  if (type === 'date') {
    const contextualQuotes = evidence.map((e) =>
      e.table?.orientation === 'records_in_columns' ? e.table.cell.quote : e.quote,
    );
    return supportsDate(value, contextualQuotes) ? [] : ['date_components_not_cited'];
  }
  if (bound.length && !bound.some((e) => quoteText(e, e.table.cell.quote, options).text === clean(value)))
    return ['table_column_value_mismatch'];
  const readable = () => evidence.map((e) => quoteText(e, e.quote, options));
  if (type === 'number') {
    // A full stop after an ordered-list marker is not a decimal point. Keep
    // signs, decimal/group separators and identifiers from matching a sub-number.
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const number = new RegExp(`(?<![\\dA-Za-z_+\\-−.]|\\d,)${escaped}(?![\\dA-Za-z_]|[.,]\\d)`);
    return readable().some((q) => number.test(q.text)) ? [] : ['number_not_in_cited_text'];
  }
  if (quotes.some((q) => clean(q).includes(clean(value)))) return [];
  const texts = readable();
  if (texts.some((q) => q.text.includes(clean(value)))) return [];
  // A list of complete code literals can cite separate lines. Do not use a bag
  // of words, substring fragments, paraphrases or inferred categories as proof.
  const parts = value.split('、').map(clean);
  if (parts.length > 1 && parts.every((part) => part && texts.some((q) => q.codes.includes(part)))) return [];
  return ['value_not_in_cited_text'];
}

/** Read-time assessment of saved evidence, never a rewrite of paid output or
 * human review. All consumers (page/filter/export/review response) share it.
 */
export function revalidateRecordEvidence(record, fields, options = {}) {
  const fieldTypes = new Map(fields.map((f) => [f.id, f.type]));
  const recheckable = new Set([
    'value_not_in_cited_text',
    'number_not_in_cited_text',
    'date_components_not_cited',
    'table_column_value_mismatch',
  ]);
  return {
    ...record,
    cells: record.cells.map((cell) => {
      const type = fieldTypes.get(cell.fieldId);
      if (
        !type ||
        !['found', 'evidence_incomplete'].includes(cell.status) ||
        !cell.evidence?.length ||
        cell.alternatives?.length ||
        cell.evidenceIssues?.some((issue) => !recheckable.has(issue))
      )
        return cell;
      const issues = checkEvidence(cell.originalValue, type, cell.evidence, options);
      return { ...cell, status: issues.length ? 'evidence_incomplete' : 'found', evidenceIssues: issues };
    }),
  };
}
