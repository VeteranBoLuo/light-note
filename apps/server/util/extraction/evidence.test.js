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
  it.each([
    [
      '该命令将完成：源码构建（含 TS 编译、资源打包）、镜像生成、本地标签（如 `demo:latest`）',
      ['该命令将完成：', '  – 源码构建（含 TS 编译、资源打包）', '  – 镜像生成', '  – 本地标签（如 `demo:latest`）'],
    ],
    [
      '① 先启动 `demo-child`（监听如 4101）；② 再启动 `demo-shell`（监听如 4100）',
      ['① 先启动 `demo-child`（监听如 4101）；', '② 再启动 `demo-shell`（监听如 4100）；'],
    ],
    ['4101、4100', ['先启动子应用（监听如 4101）；', '再启动主应用（监听如 4100）；']],
    [
      '修改 `.env` 文件：将 `OLD_URL` 替换为：https://example.test；同步更新至 **`example.test` 域名**。',
      [
        '* 修改 `.env` 文件：',
        '* 将 `OLD_URL` 替换为：',
        '[https://example.test](https://example.test)',
        '* 同步更新至 **`example.test` 域名**。',
      ],
    ],
    [
      'https://example.test、https://api.example.test',
      ['[https://example.test](https://example.test)', '例如：`https://api.example.test`。'],
    ],
    [
      '推荐 · 快速预览；已验证可正常启动，适用于编写与即时查看',
      ['**方案 A（推荐 · 快速预览）**：', '`pnpm dev` —— 已验证可正常启动，适用于编写与即时查看。'],
    ],
    ['`SESSION_NAME`、`SESSION_VALUE`', ['– `SESSION_NAME`', '– `SESSION_VALUE`']],
    [
      '必须设置；仅需两项；请从测试环境复制当前值',
      ['* **调试参数（必须设置）**：', '（注：仅需两项；请从测试环境复制当前值）'],
    ],
    ['进入 `demo` 目录，将其值设为：`"mode": "local"`', ['5\\. 进入 `demo` 目录，将其值设为：', '`"mode": "local"`；']],
  ])('完整引用片段可用分隔符拼接，保留代码字面内容：%s', (value, quotes) => {
    expect(
      checkEvidence(
        value,
        'text',
        quotes.map((q) => ref(q)),
      ),
    ).toEqual([]);
  });
  it('拼接不是拆词或语义改写，也不能改动字面值、借用链接或代码内部片段', () => {
    const cases = [
      ['编辑 package.json 中 mode 字段', ['进入目录，编辑 `package.json`，在配置中定位 `"mode"` 字段。']],
      ['用户名：demo-wrong；密码：test-only', ['用户名：demo-user', '密码：test-only']],
      ['用户名：demo-wrong；密码：test-only', ['用户名：demo-user', '示例：`demo-wrong`', '密码：test-only']],
      ['禁止、发布', ['禁止（测试文件）发布']],
      ['禁止、发布', ['禁止上线', '允许发布']],
      ['1、2', ['端口 11', '端口 22']],
      ['1、2', ['温度 -1', '比率 2.5']],
      ['1、2', ['值 1,000', '版本 v2']],
      ['1、2', ['费用 1元', '费用 2元']],
      ['https://example.test、ok', ['[https://example.test](https://different.test)', '`ok`']],
      ['删除、文件', ['~~删除~~', '文件']],
      ['a；b', ['`x:a;y:b`']],
      ['echo ab、done', ['`echo a*b`', '`done`']],
      ['甲乙', ['甲', '乙']],
    ];
    for (const [value, quotes] of cases)
      expect(
        checkEvidence(
          value,
          'text',
          quotes.map((q) => ref(q)),
        ),
        value,
      ).toEqual(['value_not_in_cited_text']);
    expect(
      checkEvidence('`left`、`right`', 'text', [ref('`left`', { kind: 'ocr' }), ref('`right`', { kind: 'ocr' })]),
    ).not.toEqual([]);
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
  it('已保存的逐段摘录重新判断，仍保留人工核对与原始证据', () => {
    const record = {
      cells: [cell({ originalValue: '`left`、`right`', evidence: [ref('– `left`'), ref('– `right`')] })],
      reviews: { f1: { overridden: true, value: '', checked: false } },
    };
    const original = structuredClone(record);
    const result = revalidateRecordEvidence(record, fields);
    expect(result.cells[0].status).toBe('found');
    expect(result.cells[0].originalValue).toBe(original.cells[0].originalValue);
    expect(result.cells[0].evidence).toEqual(original.cells[0].evidence);
    expect(result.reviews).toEqual(original.reviews);
    expect(record).toEqual(original);
  });
});
