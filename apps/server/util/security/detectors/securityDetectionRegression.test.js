import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectRequestBehavior } from './behaviorDetector.js';
import { detectSignatures } from './signatureDetector.js';
import { MAX_EXPLICIT_RESOURCE_SELECTION } from '@lightnote/shared/resource-selection';

afterEach(() => vi.restoreAllMocks());
const selection = (count) => Array.from({ length: count }, (_, i) => ({ type: 'bookmark', id: `resource-${i}` }));
const signatures = (items, patch = {}) => detectSignatures({
  method: 'POST', path: '/search/batchDeleteResources', query: {}, params: {},
  body: { items }, headersSummary: {}, files: [], ...patch,
});
const overflow = (items, patch) => signatures(items, patch).filter(x => x.ruleCode === 'PARAMETER_OVERFLOW');

describe('批量删除的结构化选择预算', () => {
  it.each([0, 1, 416, MAX_EXPLICIT_RESOURCE_SELECTION])('合法的 %i 项选择按项数校验', (count) => {
    expect(overflow(selection(count))).toEqual([]);
    expect(overflow(selection(count), { path: '/api/search/batchDeleteResources/' })).toEqual([]);
  });

  it('同时接受三种资源类型与有限数值 ID', () => {
    const items = selection(416).map((item, i) => ({ type: ['bookmark', 'note', 'file'][i % 3], id: i + 1 }));
    expect(overflow(items)).toEqual([]);
  });

  it('超过共享上限仍然产生溢出证据', () => {
    expect(overflow(selection(MAX_EXPLICIT_RESOURCE_SELECTION + 1))).toEqual([
      expect.objectContaining({ matchedField: 'body.items', evidenceMessage: expect.stringContaining('limit=1000') }),
    ]);
  });

  it.each([
    { type: 'tag', id: 'tag-1' }, { type: 'bookmark', id: '' },
    { type: 'bookmark', id: 'x'.repeat(1000) }, { type: 'bookmark', id: Infinity },
    { type: 'bookmark', id: {} }, { type: 'bookmark', id: 'ok', extra: 'unexpected' },
    { type: 'bookmark', id: 'UNION SELECT password FROM user' }, [], null,
  ])('数组尾部的畸形或异常字段不能获取结构化豁免：%j', (invalid) => {
    const items = selection(416); items[415] = invalid;
    expect(overflow(items)).toHaveLength(1);
  });

  it('子字段签名检测继续生效', () => {
    expect(signatures([{ type: 'bookmark', id: 'UNION SELECT password FROM user' }])).toContainEqual(
      expect.objectContaining({ ruleCode: 'SQL_UNION_SELECT' }),
    );
  });

  it.each([
    { method: 'GET' }, { path: '/other/search/batchDeleteResources' },
    { path: '/search/batchDeleteResourcesExtra' }, { path: '/search/other' },
    { body: { otherItems: selection(416) } }, { body: { items: 'x'.repeat(5001) } },
  ])('方法、路径、字段与类型必须精确匹配：%j', (patch) => {
    expect(overflow(selection(416), patch)).toHaveLength(1);
  });
});

describe('持续高频请求告警周期', () => {
  const request = (sourceIp) => detectRequestBehavior({ method: 'GET', path: '/community-chat/rooms', sourceIp });
  const frequency = (result) => result.evidence.filter(x => x.ruleCode === 'HIGH_FREQUENCY_REQUEST');

  it('滑窗持续保持 301 次时只记录首次告警，计数不受影响', () => {
    let now = Date.UTC(2026, 9, 26);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const events = [];
    for (let i = 0; i < 600; i++) {
      now = Date.UTC(2026, 9, 26) + i * 200;
      const result = request('sustained-traffic');
      if (i >= 300) expect(result.metrics.requestCount1m).toBe(301);
      events.push(...frequency(result));
    }
    expect(events).toHaveLength(1);
  });

  it('窗口回落至阈值可重新越线，清空后与不同来源也独立告警', () => {
    let now = Date.UTC(2026, 9, 27);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const ip = 'rearm-traffic';
    // Two early requests expire together, leaving 299 old + one new = 300.
    request(ip); request(ip);
    now += 1000;
    for (let i = 0; i < 298; i++) expect(frequency(request(ip))).toEqual([]);
    expect(frequency(request(ip))).toHaveLength(1);
    now += 59001;
    expect(frequency(request(ip))).toEqual([]);
    expect(frequency(request(ip))).toHaveLength(1);
    expect(frequency(request(ip))).toEqual([]);
    now += 60001;
    for (let i = 0; i < 300; i++) expect(frequency(request(ip))).toEqual([]);
    expect(frequency(request(ip))).toHaveLength(1);
    for (let i = 0; i < 300; i++) expect(frequency(request('other-source'))).toEqual([]);
    expect(frequency(request('other-source'))).toHaveLength(1);
  });

  it('高频去重不会抑制同一来源的接口枚举异常', () => {
    const ip = 'different-rules';
    for (let i = 0; i < 301; i++) request(ip);
    const events = [];
    for (let i = 0; i < 45; i++) events.push(...detectRequestBehavior({
      method: 'GET', sourceIp: ip, path: `/endpoint-${String.fromCharCode(65 + i)}`,
    }).evidence);
    expect(events.some(x => x.ruleCode === 'API_ENUMERATION')).toBe(true);
    expect(events.some(x => x.ruleCode === 'HIGH_FREQUENCY_REQUEST')).toBe(false);
  });
});
