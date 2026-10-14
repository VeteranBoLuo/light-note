import { extractTool, MAX_CELL_EVIDENCE, sourcePayload, validateRecords } from './contract.js';
import { findOffsets, textTables } from './evidence.js';

const fail = (reason) => {
  throw Object.assign(new Error(reason), { code: 'EXTRACTION_CONTRACT_INVALID', validationReason: reason });
};
const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const referenceSchema = { type: 'string', pattern: '^s[0-9]+_(?:l[0-9]+_p[0-9]+|t[0-9]+_r[0-9]+_c[0-9]+)$' };

/** Compile citations from this exact processing window. Provider output selects
 * references; only the server copies source text, offsets, version and locator.
 * Repeated text retains distinct identities, including equal table cells.
 */
export function compileExtractionCitations(source, plan) {
  sourcePayload(source); // Keep the original material budget; never silently clip it.
  const references = new Map();
  const segments = source.segments.map((segment, segmentIndex) => {
    const add = (reference, quote, offset) => {
      references.set(reference, {
        sourceId: source.id,
        sourceVersion: source.version,
        segmentId: segment.id,
        locator: segment.locator,
        kind: segment.kind,
        ...(segment.format ? { format: segment.format } : {}),
        offset,
        quote,
      });
      return { reference, text: quote };
    };
    const lines = [];
    let offset = 0;
    segment.text.split('\n').forEach((line, lineIndex) => {
      let start = 0,
        part = 0;
      while (start < line.length) {
        let end = Math.min(start + 1000, line.length);
        // Do not split a surrogate pair while retaining UTF-16 source offsets.
        if (end < line.length && /[\uD800-\uDBFF]/.test(line[end - 1])) end--;
        const text = line.slice(start, end);
        if (text.trim()) lines.push(add(`s${segmentIndex}_l${lineIndex}_p${part}`, text, offset + start));
        start = end;
        part++;
      }
      offset += line.length + 1;
    });
    const tables = textTables(segment.text).map((table, tableIndex) => ({
      rows: table.rows.map((row, rowIndex) =>
        row.cells.map((cell, columnIndex) => {
          // Long cells are still fully available through their numbered line parts.
          if (!cell.text || cell.text.length > 1000) return null;
          return add(`s${segmentIndex}_t${tableIndex}_r${rowIndex}_c${columnIndex}`, cell.text, cell.offset);
        }),
      ),
    }));
    return { index: segmentIndex, kind: segment.kind, lines, ...(tables.length ? { tables } : {}) };
  });
  const payload = JSON.stringify({
    title: source.title,
    complete: source.complete,
    coverage: source.coverage,
    segments,
  });
  if (references.size > 1200 || Buffer.byteLength(payload, 'utf8') > 64000) fail('Citation catalog exceeds budget');

  const tool = structuredClone(extractTool);
  const record = tool.parameters.properties.records.items.properties;
  record.anchor = object({
    reference: referenceSchema,
    quote: {
      type: 'string',
      maxLength: 1000,
      description: '通常省略；同一行包含多个独立条目时，填该条目的短原文以区分。',
    },
  });
  record.anchor.required = ['reference'];
  record.cells.minItems = plan.fields.length;
  record.cells.maxItems = plan.fields.length;
  // Only the wire format is compact. Persisted cells keep explicit status and
  // server-bound evidence, and still pass the same validator after expansion.
  record.cells.items.type = ['object', 'null'];
  record.cells.items.required = ['value', 'evidence'];
  record.cells.items.properties.status.description =
    '省略表示 found；不同说法须明确填 conflict。缺失单元格直接填 null。';
  record.cells.items.properties.evidence.items = referenceSchema;
  tool.parameters.properties.complete = { type: 'boolean' };
  tool.parameters.required = ['records', 'complete'];

  function locate(raw, _source, anchor) {
    const allowed = anchor ? ['reference', 'quote'] : ['reference'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some((key) => !allowed.includes(key)))
      fail('Unexpected object shape');
    if (typeof raw.reference !== 'string' || !references.has(raw.reference)) fail('Unknown citation reference');
    const citation = references.get(raw.reference);
    if (!anchor) return { ...citation };
    if (typeof raw.quote !== 'string' || raw.quote.length > 1000) fail('Invalid string');
    if (!raw.quote) return { ...citation };
    if (!raw.quote.trim()) fail('Empty quote');
    const offsets = findOffsets(citation.quote, raw.quote);
    if (offsets.length !== 1) fail('Missing or ambiguous quote');
    return { ...citation, quote: raw.quote, offset: citation.offset + offsets[0] };
  }
  return {
    tool,
    payload,
    validate: (raw) =>
      validateRecords(expandExtractionRecords(raw), plan, source, { locateEvidence: locate, exactPositions: true }),
    // For targeted repair only: reuse the exact validator for each existing cell,
    // retaining its record identity. No permissive second validation policy.
    validateCell: (rawRecord, index) => {
      const record = expandExtractionRecords({ records: [rawRecord] }).records[0];
      return validateRecords(
        { records: [{ anchor: record.anchor, cells: [record.cells[index]] }] },
        { fields: [plan.fields[index]] },
        source,
        { locateEvidence: locate, exactPositions: true },
      )[0];
    },
  };
}

// Preserve unknown properties and invalid values so expansion cannot hide an
// identity injection, a bad enum, omitted cells or malformed evidence.
export function expandExtractionRecords(raw) {
  if (!raw || !Array.isArray(raw.records)) return raw;
  return {
    ...raw,
    records: raw.records.map((record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
      return {
        ...record,
        ...(record.anchor && typeof record.anchor === 'object' && !Array.isArray(record.anchor)
          ? { anchor: { quote: '', ...record.anchor } }
          : {}),
        ...(Array.isArray(record.cells)
          ? {
              cells: record.cells.map((cell) => {
                if (cell === null) return { value: '', status: 'missing', evidence: [] };
                if (!cell || typeof cell !== 'object' || Array.isArray(cell)) return cell;
                return {
                  status: 'found',
                  ...cell,
                  ...(Array.isArray(cell.evidence)
                    ? {
                        evidence: cell.evidence.map((ref) => (typeof ref === 'string' ? { reference: ref } : ref)),
                      }
                    : {}),
                };
              }),
            }
          : {}),
      };
    }),
  };
}

export const referencedCitationInstructions = `原文已由服务端编号。anchor 和每条 evidence 只能选择材料中实际存在的 reference，不能自行编造编号、抄写 evidence 的 quote 或填写 segment。系统会按编号回填原文、页码和位置。anchor 优先选择条目起始行；横向产品表用该产品表头单元格编号，纵向表用该条目名称单元格编号，不能用共享整行代表多个产品。anchor.quote 通常省略；仅同一行包含多个独立条目时填短原文来区分。命令、反斜线、Markdown 转义、缩进均由系统保留，不需要重写。每个 found/conflict 字段给 1–${MAX_CELL_EVIDENCE} 个能支持它且属于该条目的原文编号，只引用支持当前值所需的原文，不重复堆叠编号；多行说明须保留各行依据，共享日期或表头可追加依据。相同文字出现在不同位置时按上下文选择编号，不能只凭文字相同借用别的条目。跨行信息可引用多个编号，不要合并或省略条目。`;

export const compactExtractionInstructions =
  '使用紧凑 JSON：evidence 直接填编号字符串数组，不套 reference 对象；正常单元格省略 status（系统按 found 校验），存在不同说法必须显式 status="conflict"。缺失单元格填 null，仍占据原字段位置，不能省略数组项。anchor.quote 没有细分原文时省略。value、全部必要依据、所有记录及字段均须完整保留，不因简写丢失信息。';
