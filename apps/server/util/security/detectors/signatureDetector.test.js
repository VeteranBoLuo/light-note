import { describe, expect, it } from 'vitest';
import { detectSignatures } from './signatureDetector.js';

const detectNumericAnomalies = (path, body) =>
  detectSignatures({
    method: 'POST',
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
    expect(detectNumericAnomalies('/todo/list', { sort: 'DROP TABLE' })).toEqual([
      expect.objectContaining({
        ruleCode: 'NUMERIC_PARAM_ANOMALY',
        matchedField: 'body.sort',
      }),
    ]);
  });
});
