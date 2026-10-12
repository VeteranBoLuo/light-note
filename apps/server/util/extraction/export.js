import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
import { extractionCurrentValue } from '@lightnote/shared/extraction';
import { fail, digest } from './domain.js';
export function safeCsvValue(value) {
  const text = String(value ?? '');
  // Leading whitespace/control characters must not hide a spreadsheet formula.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export async function buildExtractionExport(snapshot, format) {
  const fields = snapshot.table.plan?.fields || [],
    sourceMap = new Map(snapshot.sources.map((s) => [s.id, s]));
  const headers = [
    '记录 ID',
    ...fields.map((f) => f.label),
    '来源',
    '来源版本',
    '已核对字段数',
    '已排除',
    '来源处理状态',
    '读取覆盖',
    '异常字段',
    '数据版本',
  ];
  const values = (record) => [
    record.id,
    ...fields.map((field) =>
      extractionCurrentValue(
        record.cells.find((c) => c.fieldId === field.id),
        record.reviews[field.id],
      ),
    ),
    sourceMap.get(record.sourceId)?.title || '',
    sourceMap.get(record.sourceId)?.version || '',
    record.cells.filter((c) => record.reviews[c.fieldId]?.checked).length,
    record.excluded ? '是' : '否',
    sourceMap.get(record.sourceId)?.status || '',
    JSON.stringify(sourceMap.get(record.sourceId)?.coverage || {}),
    record.cells
      .filter((c) => c.status !== 'found')
      .map((c) => `${fields.find((f) => f.id === c.fieldId)?.label}:${c.status}`)
      .join('; '),
    snapshot.table.dataVersion,
  ];
  if (format === 'csv')
    return {
      mime: 'text/csv; charset=utf-8',
      extension: 'csv',
      data:
        '\uFEFF' +
        [headers, ...snapshot.records.map(values)].map((row) => row.map(safeCsvValue).join(',')).join('\r\n'),
    };
  if (format !== 'xlsx') fail('EXPORT_FORMAT', '请选择 CSV 或 Excel');
  const stream = new PassThrough(),
    chunks = [];
  let outputBytes = 0;
  stream.on('data', (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > 64 * 1024 * 1024)
      stream.destroy(Object.assign(new Error('导出文件超过处理上限'), { code: 'EXTRACTION_EXPORT_LIMIT' }));
    else chunks.push(chunk);
  });
  const completion = finished(stream);
  // A streaming workbook releases committed rows; 120,000 evidence cells/rows
  // must not become a second in-memory copy of the full snapshot.
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: false });
  const sheet = (name, columns) => {
    const value = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    value.columns = Array.from({ length: columns.length }, () => ({ width: 24 }));
    const head = value.addRow(columns);
    head.font = { bold: true };
    head.commit();
    return value;
  };
  const data = sheet('数据', headers);
  for (const record of snapshot.records) data.addRow(values(record)).commit();
  data.commit();
  const evidence = sheet('依据与核对', [
    '记录 ID',
    '字段',
    '原始值',
    '当前值',
    '人工修改',
    '已核对',
    '状态',
    '原文依据',
    '定位',
    '文字类型',
    '来源版本',
    '依据对应提取值',
    '表格定位',
  ]);
  for (const record of snapshot.records)
    for (const cell of record.cells) {
      const review = record.reviews[cell.fieldId];
      for (const variant of [{ value: cell.originalValue, evidence: cell.evidence }, ...(cell.alternatives || [])])
        for (const ref of variant.evidence.length ? variant.evidence : [null])
          evidence
            .addRow([
              record.id,
              fields.find((f) => f.id === cell.fieldId)?.label || cell.fieldId,
              cell.originalValue,
              extractionCurrentValue(cell, review),
              review?.overridden ? '是' : '否',
              review?.checked ? '是' : '否',
              cell.status,
              ref?.quote || '',
              typeof ref?.locator === 'object' ? ref.locator.value : ref?.locator || '',
              ref?.kind || '',
              ref?.sourceVersion || '',
              variant.value,
              ref?.table ? JSON.stringify(ref.table) : '',
            ])
            .commit();
    }
  evidence.commit();
  const info = sheet('处理说明', ['项目', '内容']);
  for (const line of [
    ['提取表', snapshot.table.title],
    ['数据版本', snapshot.table.dataVersion],
    ['处理状态', snapshot.table.status],
    ['记录数', snapshot.records.length],
    ['说明', '引用存在不代表语义正确；请人工核对。缺失值未按零计算。'],
    ['范围', '导出选定范围的完整快照，非当前加载页。'],
    ['筛选与排序', JSON.stringify(snapshot.filter || {})],
    ['来源', '处理状态', '覆盖说明'],
    ...snapshot.sources.map((s) => [s.title, s.status, JSON.stringify(s.coverage)]),
  ])
    info.addRow(line).commit();
  info.commit();
  await Promise.all([workbook.commit(), completion]);
  return {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
    data: Buffer.concat(chunks),
  };
}

export function extractionNoteSummary(snapshot, locale = 'zh-CN') {
  const english = locale === 'en-US',
    fields = snapshot.table.plan?.fields || [];
  const escape = (value) =>
    String(value ?? '')
      .replaceAll('|', '\\|')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[<>]/g, '');
  const rows = snapshot.records.slice(0, 20);
  const content = [
    `# ${escape(snapshot.table.title)}`,
    english
      ? `Data version: ${snapshot.table.dataVersion}. Selected: ${snapshot.records.length} records. Summary: first ${rows.length} records, up to 100 characters per cell. Export CSV/Excel for complete values.`
      : `数据版本：${snapshot.table.dataVersion}。选定范围 ${snapshot.records.length} 条；摘要展示前 ${rows.length} 条，每个值最多 100 字符。完整数据请导出 CSV / Excel。`,
    [
      `| ${fields.map((f) => escape(f.label)).join(' | ')} |`,
      `| ${fields.map(() => '---').join(' | ')} |`,
      ...rows.map(
        (record) =>
          `| ${fields
            .map((field) => {
              const cell = record.cells.find((c) => c.fieldId === field.id),
                value = extractionCurrentValue(cell, record.reviews[field.id]);
              return escape(value.length > 100 ? value.slice(0, 100) + '…' : value);
            })
            .join(' | ')} |`,
      ),
    ].join('\n'),
    english ? '## Sources and coverage' : '## 来源与覆盖',
    ...snapshot.sources.map(
      (s) =>
        `- ${escape(s.title)} · ${escape(s.version)} · ${s.coverage?.complete === true ? (english ? 'Readable range complete' : '可读取范围完整') : english ? 'Partial reading' : '部分读取'} · ${escape(s.status)}`,
    ),
    english
      ? 'Matching evidence does not replace human review. This note is a saved snapshot and does not sync automatically.'
      : '引用匹配不代表已人工核对。本笔记是保存时的快照，不与提取表自动同步。',
    `[${english ? 'Open extraction table' : '打开提取表'}](/toolbox/extraction?id=${encodeURIComponent(snapshot.table.id)})`,
  ].join('\n\n');
  return {
    title: snapshot.table.title,
    content,
    dataVersion: snapshot.table.dataVersion,
    snapshotId: digest({ id: snapshot.table.id, content }),
  };
}
