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
