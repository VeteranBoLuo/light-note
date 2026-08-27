import { describe, expect, it } from 'vitest';
import { detectSignatures } from './signatureDetector.js';

const detectNumericAnomalies = (path, body, method = 'POST') =>
  detectSignatures({
    method,
    path,
    query: {},
    params: {},
    body,
    headersSummary: {},
    files: [],
  }).filter((item) => item.ruleCode === 'NUMERIC_PARAM_ANOMALY');

const detectRequestSignatures = (path, body, method = 'POST') =>
  detectSignatures({
    method,
    path,
    query: {},
    params: {},
    body,
    headersSummary: {},
    files: [],
  });

describe('请求参数异常检测', () => {
  it.each([
    ['/todo/list', 'newest'],
    ['/api/todo/list', 'smart'],
    ['/todo/list', 'due'],
    ['/inbox/list', 'oldest'],
    ['/search/global', 'relevance'],
    ['/api/search/global', 'updated'],
    ['/search/global', 'name'],
    ['/featureRequest/listPublic', 'popular'],
  ])('允许列表接口的合法排序枚举：%s %s', (path, sort) => {
    expect(detectNumericAnomalies(path, { sort, status: 'pending', keyword: '' })).toEqual([]);
  });

  it('其他接口的数值排序字段仍会检测非数值内容', () => {
    expect(detectNumericAnomalies('/bookmark/updateSort', { sort: 'newest' })).toEqual([
      expect.objectContaining({
        ruleCode: 'NUMERIC_PARAM_ANOMALY',
        matchedField: 'body.sort',
      }),
    ]);
  });

  it('列表接口不在白名单内的排序内容仍会被检测', () => {
    for (const path of ['/todo/list', '/search/global']) {
      expect(detectNumericAnomalies(path, { sort: 'DROP TABLE' })).toEqual([
        expect.objectContaining({
          ruleCode: 'NUMERIC_PARAM_ANOMALY',
          matchedField: 'body.sort',
        }),
      ]);
    }
  });

  it.each(['official', 'mentions_only', 'mentions', 'all'])('允许聊天室提醒设置的合法级别：%s', (level) => {
    for (const path of ['/community-chat/settings/notifications', '/api/community-chat/settings/notifications']) {
      expect(detectNumericAnomalies(path, { enabled: true, level }, 'PUT')).toEqual([]);
    }
  });

  it('聊天室提醒设置接口的非法级别仍会被检测', () => {
    expect(
      detectNumericAnomalies('/community-chat/settings/notifications', { enabled: true, level: 'unexpected' }, 'PUT'),
    ).toEqual([
      expect.objectContaining({
        ruleCode: 'NUMERIC_PARAM_ANOMALY',
        matchedField: 'body.level',
      }),
    ]);
  });

  it.each([
    ['其他接口', '/community-chat/other', 'PUT'],
    ['其他方法', '/community-chat/settings/notifications', 'POST'],
  ])('%s 的非数值 level 不受聊天室提醒枚举白名单影响', (_label, path, method) => {
    expect(detectNumericAnomalies(path, { level: 'all' }, method)).toEqual([
      expect.objectContaining({
        ruleCode: 'NUMERIC_PARAM_ANOMALY',
        matchedField: 'body.level',
      }),
    ]);
  });
});

describe('业务载荷语义检测', () => {
  it('合法 WebP Data URL 不会把 ;base64 误报为命令注入或参数溢出', () => {
    const thumbnail = `data:image/webp;base64,${Buffer.alloc(6000, 1).toString('base64')}`;
    const evidence = detectRequestSignatures('/note/uploadDrawingThumbnail', { thumbnail });
    expect(evidence.filter((item) => ['COMMAND_INJECTION', 'PARAMETER_OVERFLOW'].includes(item.ruleCode))).toEqual([]);
  });

  it('缩略图字段形态不合法时不会获得豁免，真实命令特征仍会命中', () => {
    expect(
      detectRequestSignatures('/note/uploadDrawingThumbnail', {
        thumbnail: 'data:image/webp;base64,AAAA;curl https://attacker.invalid',
      }),
    ).toContainEqual(expect.objectContaining({ ruleCode: 'COMMAND_INJECTION', matchedField: 'body.thumbnail' }));
  });

  it('通用命令规则区分 Data URL 分隔符与真实 shell 命令边界', () => {
    expect(detectRequestSignatures('/other', { payload: 'data:image/webp;base64,AAAA' })).not.toContainEqual(
      expect.objectContaining({ ruleCode: 'COMMAND_INJECTION' }),
    );
    expect(detectRequestSignatures('/other', { payload: ';base64 -d /tmp/input' })).toContainEqual(
      expect.objectContaining({ ruleCode: 'COMMAND_INJECTION', matchedField: 'body.payload' }),
    );
  });

  it('手绘场景在共享协议预算内不套用 5000 字符通用阈值，超限仍记录异常', () => {
    const accepted = detectRequestSignatures('/note/updateDrawingNote', {
      scene: `{"v":4,"data":"${'x'.repeat(6000)}"}`,
    });
    const oversized = detectRequestSignatures('/note/updateDrawingNote', { scene: 'x'.repeat(750_001) });
    expect(accepted).not.toContainEqual(expect.objectContaining({ ruleCode: 'PARAMETER_OVERFLOW' }));
    expect(oversized).toContainEqual(
      expect.objectContaining({ ruleCode: 'PARAMETER_OVERFLOW', matchedField: 'body.scene' }),
    );
  });

  it.each([
    ['/note/convertMode', { convertedContent: '正文'.repeat(3000) }],
    ['/note/exportFile', { contentBase64: Buffer.alloc(6000, 1).toString('base64') }],
    ['/bookmark/addTag', { iconUrl: `data:image/svg+xml;base64,${Buffer.alloc(6000, 1).toString('base64')}` }],
  ])('合法大载荷使用业务预算：%s', (path, body) => {
    expect(detectRequestSignatures(path, body)).not.toContainEqual(
      expect.objectContaining({ ruleCode: 'PARAMETER_OVERFLOW' }),
    );
  });

  it('书签分享文案允许多行输入，但其他 URL 字段仍检测 CRLF', () => {
    const multiline = '教程标题\n第一步\nhttps://example.com/article';
    expect(detectRequestSignatures('/bookmark/resolveUrl', { url: multiline })).not.toContainEqual(
      expect.objectContaining({ ruleCode: 'CRLF_INJECTION' }),
    );
    expect(detectRequestSignatures('/other', { callbackUrl: 'https://example.com/%0d%0aX-Test:1' })).toContainEqual(
      expect.objectContaining({ ruleCode: 'CRLF_INJECTION', matchedField: 'body.callbackUrl' }),
    );
  });

  it('书签多行输入只豁免 CRLF，私网 URL 仍保留 SSRF 证据', () => {
    expect(detectRequestSignatures('/bookmark/resolveUrl', { url: 'http://127.0.0.1/admin' })).toContainEqual(
      expect.objectContaining({ ruleCode: 'SSRF_PRIVATE_HOST', matchedField: 'body.url' }),
    );
  });

  it('业务字段策略只作用于精确路由，未知入口的超长同名字段仍会告警', () => {
    expect(detectRequestSignatures('/other', { scene: 'x'.repeat(6000) })).toContainEqual(
      expect.objectContaining({ ruleCode: 'PARAMETER_OVERFLOW', matchedField: 'body.scene' }),
    );
  });

  it.each(['/ai/skills/execute', '/api/ai/skills/stream/'])('AI 笔记原文中的 shell 命令不作为命令注入：%s', (path) => {
    const body = {
      skillId: 'note.transform_text',
      input: { text: '先执行 sudo apt update && sudo apt full-upgrade -y，再安装面板。' },
    };
    expect(detectRequestSignatures(path, body)).not.toContainEqual(
      expect.objectContaining({ ruleCode: 'COMMAND_INJECTION', matchedField: 'body.input.text' }),
    );
  });

  it('AI 字段豁免不扩散到其他技能或未知路由', () => {
    const input = { text: 'sudo apt update && sudo apt full-upgrade -y' };
    expect(detectRequestSignatures('/ai/skills/stream', { skillId: 'help.answer', input })).toContainEqual(
      expect.objectContaining({ ruleCode: 'COMMAND_INJECTION', matchedField: 'body.input.text' }),
    );
    expect(detectRequestSignatures('/other', { skillId: 'note.transform_text', input })).toContainEqual(
      expect.objectContaining({ ruleCode: 'COMMAND_INJECTION', matchedField: 'body.input.text' }),
    );
  });
});
