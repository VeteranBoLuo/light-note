import { describe, expect, it } from 'vitest';
import { compileExtractionCitations } from './citations.js';
import { extractionRepairInstruction, extractionValidationPath, validatePlan, validateRecords } from './contract.js';
import { fixtures } from '../../evaluation/extraction/fixtures.js';

const plan = (type = 'text') =>
  validatePlan({
    recordDefinition: '一个独立条目',
    fields: [{ key: 'value', label: '值', type, rule: '原文' }],
  });
const source = (texts) => ({
  id: 'owned-source',
  version: 'v1',
  title: '合成验证资料',
  complete: true,
  coverage: {},
  segments: texts.map((text, i) => ({
    id: `paragraph:${i * 1000}`,
    text,
    kind: 'original',
    locator: { paragraph: i + 1 },
  })),
});
const row = (reference, value, evidenceReference = reference, quote = '') => ({
  anchor: { reference, quote },
  cells: [{ value, status: 'found', evidence: [{ reference: evidenceReference }] }],
});

describe('服务端原文编号与确定性引用', () => {
  it('17 个片段中的代码与转义字符由服务端原样回填，不依赖模型重抄', () => {
    const texts = Array.from({ length: 17 }, (_, i) => `阶段 ${i + 1}`);
    texts[16] = '启动 web\\_app\n    APP_MODE=dev node ./bin/start.js --path="C:\\demo\\files"\n';
    const s = source(texts);
    const compiled = compileExtractionCitations(s, plan());
    const [record] = compiled.validate({ records: [row('s16_l0_p0', 'APP_MODE=dev', 's16_l1_p0')] });
    expect(record.cells[0]).toMatchObject({ status: 'found', originalValue: 'APP_MODE=dev' });
    expect(record.cells[0].evidence[0]).toMatchObject({
      sourceId: s.id,
      sourceVersion: s.version,
      segmentId: s.segments[16].id,
      quote: texts[16].split('\n')[1],
      offset: texts[16].indexOf('    APP_MODE'),
      locator: { paragraph: 17 },
      kind: 'original',
    });
    expect(JSON.parse(compiled.payload).segments).toHaveLength(17);
  });
  it('同段中重复标题可以用实际行位置区分，稳定 ID 不依赖窗口内编号', () => {
    const s = source(['重启服务\n服务甲\n重启服务\n服务乙']);
    const compiled = compileExtractionCitations(s, plan());
    const records = compiled.validate({
      records: [row('s0_l0_p0', '服务甲', 's0_l1_p0'), row('s0_l2_p0', '服务乙', 's0_l3_p0')],
    });
    expect(new Set(records.map((r) => r.id)).size).toBe(2);
    expect(records[1].anchor.offset).toBe(s.segments[0].text.lastIndexOf('重启服务'));
    const shifted = { ...s, segments: [{ ...s.segments[0], id: 'preceding', text: '前文' }, ...s.segments] };
    const shiftedRecord = compileExtractionCitations(shifted, plan()).validate({
      records: [row('s1_l2_p0', '服务乙', 's1_l3_p0')],
    })[0];
    expect(shiftedRecord.id).toBe(records[1].id);
  });
  it('同一行多个条目可用短原文区分，不合并、不丢弃重复输出', () => {
    const compiled = compileExtractionCitations(source(['课程甲 3 学分；课程乙 4 学分']), plan());
    const a = row('s0_l0_p0', '3 学分', undefined, '课程甲');
    const b = row('s0_l0_p0', '4 学分', undefined, '课程乙');
    expect(compiled.validate({ records: [a, b] })).toHaveLength(2);
    expect(() => compiled.validate({ records: [a, a] })).toThrow('Repeated record anchor');
    expect(() => compiled.validate({ records: [row('s0_l0_p0', '3', undefined, '课程')] })).toThrow('ambiguous');
  });
  it('现有精确锚点保持相同 ID；已有结果不需要迁移', () => {
    const s = source(['课程甲 3 学分']);
    const current = compileExtractionCitations(s, plan()).validate({
      records: [row('s0_l0_p0', '3 学分', undefined, '课程甲')],
    })[0];
    const previous = validateRecords(
      {
        records: [
          {
            anchor: { segment: 0, quote: '课程甲' },
            cells: [{ value: '3 学分', status: 'found', evidence: [{ segment: 0, quote: '课程甲 3 学分' }] }],
          },
        ],
      },
      plan(),
      s,
    )[0];
    expect(current.id).toBe(previous.id);
  });
  it('横向产品表选择具体表头和证据列，错误产品值仍标依据不足', () => {
    const s = fixtures.find((f) => f.id === 'products').source;
    const compiled = compileExtractionCitations(s, plan());
    const table = JSON.parse(compiled.payload).segments[0].tables[0];
    const anchor = table.rows[0].find((c) => c.text === 'Camera Module 3').reference;
    const evidence = table.rows.find((r) => r[0].text === 'Weight')[3].reference;
    const good = compiled.validate({ records: [row(anchor, '4 g', evidence)] })[0];
    expect(good.cells[0].status).toBe('found');
    expect(good.cells[0].evidence[0].table.column).toBe(3);
    expect(compiled.validate({ records: [row(anchor, '3 g', evidence)] })[0].cells[0].status).toBe(
      'evidence_incomplete',
    );
  });
  it('引用有效不代表值正确，缺失、格式错误和 OCR 身份仍如实保留', () => {
    const s = source(['课程甲 共 12 课时']);
    s.segments[0].kind = 'ocr';
    const compiled = compileExtractionCitations(s, plan('number'));
    const [bad] = compiled.validate({ records: [row('s0_l0_p0', '2')] });
    expect(bad.cells[0].status).toBe('evidence_incomplete');
    expect(bad.cells[0].evidence[0].kind).toBe('ocr');
    expect(compiled.validate({ records: [row('s0_l0_p0', '12课时')] })[0].cells[0].status).toBe('format_error');
    const missing = row('s0_l0_p0', '');
    missing.cells[0] = { value: '', status: 'missing', evidence: [] };
    expect(
      compileExtractionCitations({ ...s, complete: false }, plan()).validate({ records: [missing] })[0].cells[0].status,
    ).toBe('unavailable');
  });
  it('明确单元格编号不因相同值跳到另一行或另一产品列', () => {
    const horizontal = compileExtractionCitations(source(['项目 | 产品甲 | 产品乙\n重量 | 3 g | 3 g']), plan());
    const wrongColumn = horizontal.validate({ records: [row('s0_t0_r0_c1', '3 g', 's0_t0_r1_c2')] })[0].cells[0];
    expect(wrongColumn).toMatchObject({
      status: 'evidence_incomplete',
      evidenceIssues: ['table_column_outside_record'],
    });
    expect(wrongColumn.evidence[0].offset).toBe('项目 | 产品甲 | 产品乙\n重量 | 3 g | '.length);
    expect(horizontal.validate({ records: [row('s0_t0_r0_c1', '3 g', 's0_t0_r1_c0')] })[0].cells[0].status).toBe(
      'evidence_incomplete',
    );
    const vertical = compileExtractionCitations(source(['产品 | 数量 | 价格\n甲 | 1 | 1\n乙 | 1 | 1']), plan('number'));
    expect(vertical.validate({ records: [row('s0_t0_r2_c0', '1', 's0_t0_r1_c1')] })[0].cells[0].status).toBe(
      'evidence_incomplete',
    );
    const precise = vertical.validate({ records: [row('s0_t0_r2_c0', '1', 's0_t0_r2_c2')] })[0].cells[0];
    expect(precise.status).toBe('found');
    expect(precise.evidence[0].table).toMatchObject({ row: 2, column: 2 });
  });
  it.each([
    (r) => {
      r.anchor.reference = 'other_source';
    },
    (r) => {
      r.cells[0].evidence[0].reference = 's17_l0_p0';
    },
    (r) => {
      r.cells[0].evidence[0].quote = '伪造原文';
    },
    (r) => {
      r.anchor.sourceId = 'another-owner';
    },
    (r) => {
      r.anchor.quote = '原文不存在';
    },
    (r) => {
      r.cells[0].evidence = [];
    },
  ])('拒绝越界编号、模型伪造引用与身份、无依据值', (mutate) => {
    const compiled = compileExtractionCitations(source(['课程甲 3']), plan());
    const record = row('s0_l0_p0', '3');
    mutate(record);
    expect(() => compiled.validate({ records: [record] })).toThrow();
  });
  it('修复得到具体记录/字段/依据位置，诊断不包含正文或任意属性', () => {
    const compiled = compileExtractionCitations(source(['课程甲 3']), plan());
    try {
      compiled.validate({ records: [row('s0_l0_p0', '3', 's99_l0_p0')] });
      expect.unreachable();
    } catch (error) {
      expect(extractionValidationPath(error)).toBe('records[0].cells[0].evidence[0]');
      expect(extractionRepairInstruction({ error, toolName: 'extract_records' })).toContain(
        'records[0].cells[0].evidence[0]',
      );
    }
    expect(extractionValidationPath({ validationPath: 'private content' })).toBeNull();
  });
  it('长行分段保留所有字符和实际位置，不拆散 Unicode 字符', () => {
    const text = '甲'.repeat(999) + '🎵' + '乙'.repeat(999);
    const s = source([text]);
    const compiled = compileExtractionCitations(s, plan());
    const lines = JSON.parse(compiled.payload).segments[0].lines;
    expect(lines.map((l) => l.text).join('')).toBe(text);
    for (const line of lines) {
      const [record] = compiled.validate({ records: [row(line.reference, line.text)] });
      expect(s.segments[0].text.slice(record.anchor.offset, record.anchor.offset + record.anchor.quote.length)).toBe(
        line.text,
      );
    }
  });
  it('接近正文预算仍完整编制，引用膨胀超过预算时明确失败', () => {
    const s = source(Array.from({ length: 100 }, (_, i) => `项目 ${i} ${'a'.repeat(125)}`));
    expect(JSON.parse(compileExtractionCitations(s, plan()).payload).segments).toHaveLength(100);
    expect(() => compileExtractionCitations(source(['甲\n'.repeat(1500)]), plan())).toThrow(
      'Citation catalog exceeds budget',
    );
  });
});
