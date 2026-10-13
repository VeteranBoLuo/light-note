import { describe, expect, it } from 'vitest';
import { checkEvidence, revalidateRecordEvidence } from './evidence.js';
import { compileExtractionCitations } from './citations.js';
import { validatePlan } from './contract.js';

const ref = (quote, extra = {}) => ({ quote, kind: 'original', format: 'markdown', ...extra });
const check = (value, quote, type = 'text') => checkEvidence(value, type, [ref(quote)]);

describe('提取值与原文展示格式的确定性等价', () => {
  it.each([
    ['CA 系统（app-shell + app-main）', '### 2\\. CA 系统（`app-shell` + `app-main`）'],
    ['确保 Docker Desktop 已启动', '1. 确保 **Docker Desktop 已启动**；'],
    ['lib-core、lib-ui', '* **组件库**：`lib-core`、`lib-ui`'],
    ['app_main', '名称：app\\_main'],
    ['app-shell 所监听的端口', '始终通过 `app-shell` 所监听的端口访问。'],
  ])('只还原 Markdown 展示语法：%s', (value, quote) => {
    expect(check(value, quote)).toEqual([]);
  });
  it('代码内部反斜线、星号、下划线与比较符不被当成格式删掉', () => {
    for (const code of ['echo **word**', 'app\\_main', 'x < 3 && y > 1', 'C:\\demo\\*.*']) {
      expect(check(code, '`' + code + '`')).toEqual([]);
      expect(check(code.replace(/[\\*_<>&]/g, ''), '`' + code + '`')).not.toEqual([]);
    }
  });
  it('不把纯文本或 OCR 的标点误当成 Markdown，不跨链接或删除文字拼接', () => {
    expect(checkEvidence('甲乙', 'text', [ref('甲**乙**', { format: undefined })])).not.toEqual([]);
    expect(checkEvidence('甲乙', 'text', [ref('甲**乙**', { kind: 'ocr' })], { markdown: true })).not.toEqual([]);
    expect(check('甲乙', '甲[旧名称](https://example.test)乙')).not.toEqual([]);
    expect(check('甲乙', '甲~~旧名称~~乙')).not.toEqual([]);
    expect(check('甲乙', '甲<br>乙')).not.toEqual([]);
  });
  it('完整代码名称可来自多段引用，摘要、拆词、遗漏与推断仍待核对', () => {
    const evidence = [ref('– 主模块：`app-shell`'), ref('– 子模块：`app-main`')];
    expect(checkEvidence('app-shell、app-main', 'text', evidence)).toEqual([]);
    for (const value of ['shell、main', 'app-shell、other', '主模块包含 app-shell 和 app-main', '通用'])
      expect(checkEvidence(value, 'text', evidence)).toEqual(['value_not_in_cited_text']);
    expect(check('可选', '推荐采用方案 A')).toEqual(['value_not_in_cited_text']);
    expect(check('必须', '推荐采用方案 A')).toEqual(['value_not_in_cited_text']);
    expect(checkEvidence('禁止、发布', 'text', [ref('禁止上线'), ref('允许发布')])).not.toEqual([]);
  });
  it.each(['1. 启动服务', '1\\. 启动服务', '1) 启动服务', '**1**. 启动服务', '步骤 1：启动服务'])(
    '明确步骤编号通过：%s',
    (quote) => expect(check('1', quote, 'number')).toEqual([]),
  );
  it.each(['12', '1.2', '-1', '−1', '+1', '1,000', '1e3', 'v1', 'A_1', '0.1', '-**1**', '1.**2**'])(
    '不把符号、数值或标识符的一部分当作 1：%s',
    (quote) => expect(check('1', quote, 'number')).toEqual(['number_not_in_cited_text']),
  );
  it('保留负数和小数，无单位换算', () => {
    expect(check('-1.25', '温度 -1.25 °C', 'number')).toEqual([]);
    expect(check('1.25', '温度 -1.25 °C', 'number')).not.toEqual([]);
    expect(check('1000', '1 kg', 'number')).not.toEqual([]);
    expect(check('000', '1,000', 'number')).not.toEqual([]);
  });
  it('格式还原仍受横表产品列约束', () => {
    const plan = validatePlan({
      recordDefinition: '一个产品',
      fields: [{ key: 'value', label: '组件', type: 'text', rule: '原文' }],
    });
    const source = {
      id: 's',
      version: 'v1',
      title: '产品',
      complete: true,
      coverage: {},
      segments: [
        {
          id: 'p',
          kind: 'original',
          format: 'markdown',
          locator: '段落',
          text: '参数 | 甲 | 乙\n组件 | `core-a` | `core-b`',
        },
      ],
    };
    const compiled = compileExtractionCitations(source, plan);
    const row = (reference, value) => ({
      anchor: { reference: 's0_t0_r0_c1', quote: '' },
      cells: [{ value, status: 'found', evidence: [{ reference }] }],
    });
    expect(compiled.validate({ records: [row('s0_t0_r1_c1', 'core-a')] })[0].cells[0].status).toBe('found');
    expect(compiled.validate({ records: [row('s0_t0_r1_c2', 'core-b')] })[0].cells[0]).toMatchObject({
      status: 'evidence_incomplete',
      evidenceIssues: ['table_column_outside_record'],
    });
    expect(compiled.validate({ records: [row('s0_l1_p0', 'core-b')] })[0].cells[0].status).toBe('evidence_incomplete');
  });
});

describe('已保存结果的只读依据复核', () => {
  const cell = (overrides = {}) => ({
    fieldId: 'f1',
    originalValue: '模块 app-shell',
    status: 'evidence_incomplete',
    evidenceIssues: ['value_not_in_cited_text'],
    evidence: [ref('模块 `app-shell`', { format: undefined })],
    ...overrides,
  });
  const fields = [{ id: 'f1', type: 'text' }];
  it('旧笔记和新结果共享校验，不改原值、原片段、人工空值或版本', () => {
    const record = {
      id: 'r',
      version: 7,
      excluded: true,
      cells: [cell()],
      reviews: { f1: { overridden: true, value: '', checked: true } },
    };
    const original = structuredClone(record);
    const result = revalidateRecordEvidence(record, fields, { markdown: true, cache: new Map() });
    expect(result.cells[0]).toMatchObject({ originalValue: '模块 app-shell', status: 'found', evidenceIssues: [] });
    expect(result.cells[0].evidence).toEqual(original.cells[0].evidence);
    expect(result).toMatchObject({ id: 'r', version: 7, excluded: true, reviews: original.reviews });
    expect(record).toEqual(original);
    expect(revalidateRecordEvidence(result, fields, { markdown: true })).toEqual(result);
    expect(revalidateRecordEvidence(record, fields).cells[0].status).toBe('evidence_incomplete');
  });
  it('已存在缺失、冲突、格式异常、跨记录或未知告警不会被取消', () => {
    for (const overrides of [
      { status: 'missing' },
      { status: 'unavailable' },
      { status: 'format_error' },
      { status: 'conflict' },
      { evidenceIssues: ['table_row_outside_record'] },
      { evidenceIssues: ['future_check'] },
      { alternatives: [{ value: '其他值' }] },
    ]) {
      const record = { cells: [cell(overrides)], reviews: {} };
      expect(revalidateRecordEvidence(record, fields, { markdown: true })).toEqual(record);
    }
  });
  it('旧校验已放行的符号错误也会重新提示，但不撤销人工核对', () => {
    const record = {
      cells: [cell({ originalValue: '1', status: 'found', evidenceIssues: [], evidence: [ref('-1')] })],
      reviews: { f1: { checked: true } },
    };
    const result = revalidateRecordEvidence(record, [{ id: 'f1', type: 'number' }]);
    expect(result.cells[0].status).toBe('evidence_incomplete');
    expect(result.reviews).toEqual(record.reviews);
  });
});
