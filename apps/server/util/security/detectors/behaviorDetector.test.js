import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectRequestBehavior,
  detectResponseBehavior,
  isPublicSeoReadRequest,
  normalizeBehaviorPath,
} from './behaviorDetector.js';
import { SECURITY_CONFIG } from '../rules.js';

describe('登录失败行为检测', () => {
  afterEach(() => vi.useRealTimers());

  const contextFor = (sourceIp, patch = {}) => ({
    method: 'POST',
    path: '/user/login',
    sourceIp,
    body: { email: 'user@example.invalid' },
    ...patch,
  });
  const fail = (context, payload = { status: 401, msg: '认证失败' }, httpStatus = 200) =>
    detectResponseBehavior(context, httpStatus, payload);

  it('成功响应中的密码字段和正文关键词不会累计失败', () => {
    const context = contextFor('login-success');
    const success = JSON.stringify({
      status: 200,
      data: { password: '******', hasPassword: true },
      msg: '登录失败 password',
    });
    for (let i = 0; i < SECURITY_CONFIG.loginFailFiveMinutes + 5; i++) {
      expect(fail(context, success)).toEqual([]);
    }
    expect(fail(context)).toEqual([]);
  });

  it.each([false, true])('按业务失败码识别对象或JSON响应，超阈值不重复告警（JSON=%s）', (serialized) => {
    const context = contextFor(`login-failure-${serialized}`);
    const payload = serialized ? JSON.stringify({ status: 401, msg: 'Incorrect credentials' }) : { status: 401 };
    const events = [];
    for (let i = 0; i < SECURITY_CONFIG.loginFailFiveMinutes + 5; i++) events.push(...fail(context, payload));
    expect(events).toEqual([expect.objectContaining({ ruleCode: 'BRUTE_FORCE' })]);
  });

  it('HTTP 401 无需依赖响应语言或有效JSON', () => {
    const context = contextFor('login-http-401');
    const events = [];
    for (let i = 0; i < SECURITY_CONFIG.loginFailFiveMinutes; i++) events.push(...fail(context, 'Unauthorized', 401));
    expect(events).toEqual([expect.objectContaining({ ruleCode: 'BRUTE_FORCE' })]);
  });

  it.each([
    [200, '登录失败 password'],
    [200, { status: 403, msg: 'password denied' }],
    [200, { status: 400, msg: '登录失败' }],
    [429, { status: 429 }],
    [500, { status: 500 }],
  ])('非认证失败响应不会累计失败（HTTP %s，%j）', (httpStatus, payload) => {
    const context = contextFor(`not-auth-failure-${httpStatus}-${JSON.stringify(payload)}`);
    for (let i = 0; i < SECURITY_CONFIG.loginFailFiveMinutes + 5; i++) {
      expect(fail(context, payload, httpStatus)).toEqual([]);
    }
  });

  it.each([
    { method: 'GET', path: '/user/login' },
    { method: 'POST', path: '/user/loginExtra' },
    { method: 'POST', path: '/note/query', originalUrl: '/note/query?next=/user/login' },
  ])('非登录接口不累计认证失败：%j', (patch) => {
    const context = contextFor(`non-login-${JSON.stringify(patch)}`, patch);
    for (let i = 0; i < SECURITY_CONFIG.loginFailFiveMinutes + 5; i++) expect(fail(context)).toEqual([]);
  });

  it('兼容带API前缀和查询参数的精确登录路径', () => {
    const context = contextFor('api-login', { path: '/api/user/login?next=home' });
    const events = [];
    for (let i = 0; i < SECURITY_CONFIG.loginFailFiveMinutes; i++) events.push(...fail(context));
    expect(events).toEqual([expect.objectContaining({ ruleCode: 'BRUTE_FORCE' })]);
  });

  it('超阈值后首次扩展到四个账号会升级撞库告警，邮箱大小写不算新账号', () => {
    const context = contextFor('login-escalation');
    for (let i = 1; i < SECURITY_CONFIG.loginFailFiveMinutes; i++) expect(fail(context)).toEqual([]);
    expect(fail(context)).toEqual([expect.objectContaining({ ruleCode: 'BRUTE_FORCE' })]);
    expect(fail({ ...context, body: { email: ' USER@EXAMPLE.INVALID ' } })).toEqual([]);
    expect(fail({ ...context, body: { email: 'second@example.invalid' } })).toEqual([]);
    expect(fail({ ...context, body: { email: 'third@example.invalid' } })).toEqual([]);
    expect(fail({ ...context, body: { email: 'fourth@example.invalid' } })).toEqual([
      expect.objectContaining({ ruleCode: 'CREDENTIAL_STUFFING' }),
    ]);
    expect(fail({ ...context, body: { email: 'fifth@example.invalid' } })).toEqual([]);
  });

  it('窗口过期后可再次告警，初次越线已涉及多账号时直接识别撞库', () => {
    vi.useFakeTimers();
    const context = contextFor('login-window-reset');
    const runWindow = () => {
      const events = [];
      for (let i = 0; i < SECURITY_CONFIG.loginFailFiveMinutes; i++) {
        events.push(...fail({ ...context, body: { email: `user${i}@example.invalid` } }));
      }
      return events;
    };
    expect(runWindow()).toEqual([expect.objectContaining({ ruleCode: 'CREDENTIAL_STUFFING' })]);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(runWindow()).toEqual([expect.objectContaining({ ruleCode: 'CREDENTIAL_STUFFING' })]);
  });
});

describe('公开 SEO 页面行为检测', () => {
  it('GET/HEAD 的 sitemap 与帮助中心页面不计入高频和路径枚举', () => {
    const paths = ['/sitemap.xml', '/helpCenter', '/helpCenter/article-id'];

    for (const method of ['GET', 'HEAD']) {
      for (const path of paths) {
        const context = { method, path, sourceIp: `seo-crawler-${method}` };
        expect(isPublicSeoReadRequest(context)).toBe(true);
        expect(detectRequestBehavior(context)).toEqual({
          evidence: [],
          metrics: { requestCount1m: 0, uniquePathCount1m: 0 },
        });
      }
    }
  });

  it('写请求和其他业务页面仍然进入行为检测', () => {
    const postSeo = { method: 'POST', path: '/helpCenter/article-id', sourceIp: 'post-seo-test' };
    const businessGet = { method: 'GET', path: '/api/note/getNote', sourceIp: 'business-get-test' };

    expect(isPublicSeoReadRequest(postSeo)).toBe(false);
    expect(detectRequestBehavior(postSeo).metrics).toEqual({ requestCount1m: 1, uniquePathCount1m: 1 });
    expect(isPublicSeoReadRequest(businessGet)).toBe(false);
    expect(detectRequestBehavior(businessGet).metrics).toEqual({ requestCount1m: 1, uniquePathCount1m: 1 });
  });

  it('帮助中心的深层伪造路径不进入豁免范围', () => {
    expect(isPublicSeoReadRequest({ method: 'GET', path: '/helpCenter/a/b' })).toBe(false);
  });

  it('资源 ID 不会把同一路由膨胀成不同接口', () => {
    expect(normalizeBehaviorPath('/api/file/123/preview')).toBe('/api/file/:id/preview');
    expect(normalizeBehaviorPath('/api/note/5153dc70-918e-1191-8f98-dbf9fc0824c0')).toBe('/api/note/:id');
    expect(normalizeBehaviorPath('/api/file/123?ticket=secret')).toBe('/api/file/:id');
  });

  it('已认证应用首屏不会在匿名阈值 41 个路径时误报接口枚举', () => {
    const sourceIp = 'authenticated-app-test';
    let result;
    for (let index = 0; index < 41; index += 1) {
      result = detectRequestBehavior({
        method: 'GET',
        path: `/api/module-${index}/summary`,
        sourceIp,
        userId: 'user-1',
      });
    }
    expect(result.evidence.some((item) => item.ruleCode === 'API_ENUMERATION')).toBe(false);
  });

  it('高频请求只在一分钟窗口首次越线时产生一条证据', () => {
    const sourceIp = 'high-frequency-threshold-test';
    const evidence = [];
    for (let index = 0; index < SECURITY_CONFIG.highFrequencyPerMinute + 20; index += 1) {
      evidence.push(
        ...detectRequestBehavior({
          method: 'GET',
          path: '/api/note/queryNoteTree',
          sourceIp,
          userId: 'root-test',
        }).evidence,
      );
    }
    expect(evidence.filter((item) => item.ruleCode === 'HIGH_FREQUENCY_REQUEST')).toEqual([
      expect.objectContaining({
        evidenceMessage: `同一 IP 1 分钟内请求 ${SECURITY_CONFIG.highFrequencyPerMinute + 1} 次`,
      }),
    ]);
  });
});

describe('404 扫描行为检测', () => {
  afterEach(() => vi.useRealTimers());

  it('已匹配业务路由的资源缺失不进入扫描器窗口', () => {
    const context = {
      method: 'GET',
      path: '/note/image-thumbnail/missing.webp',
      sourceIp: 'matched-business-404-test',
      routeMatched: true,
    };
    for (let index = 0; index < 30; index += 1) {
      expect(detectResponseBehavior(context, 404)).toEqual([]);
    }
  });

  it('未知路径只在五分钟窗口首次越线时产生一条扫描证据', () => {
    const context = {
      method: 'GET',
      path: '/unknown-probe',
      sourceIp: 'unmatched-404-threshold-test',
      routeMatched: false,
    };
    const evidence = [];
    for (let index = 0; index < 30; index += 1) {
      evidence.push(...detectResponseBehavior(context, 404));
    }
    expect(evidence).toEqual([
      expect.objectContaining({
        ruleCode: 'SCANNER_404_PATTERN',
        evidenceMessage: '同一 IP 5 分钟内产生 21 次 404',
      }),
    ]);
  });

  it('旧404陆续过期、计数持续等于阈值加一时不会重复告警，窗口恢复后可再次告警', () => {
    vi.useFakeTimers();
    const context = {
      method: 'GET',
      path: '/unknown-probe',
      sourceIp: 'sustained-404-window-test',
      routeMatched: false,
    };
    const events = [];
    // 每15秒一次使5分钟滑窗稳定保持21次，不能把每次21都视作首次越线。
    for (let index = 0; index < 50; index++) {
      events.push(...detectResponseBehavior(context, 404));
      vi.advanceTimersByTime(15_000);
    }
    expect(events).toEqual([expect.objectContaining({ ruleCode: 'SCANNER_404_PATTERN' })]);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    const nextWindow = [];
    for (let index = 0; index < SECURITY_CONFIG.scanner404FiveMinutes + 1; index++) {
      nextWindow.push(...detectResponseBehavior(context, 404));
    }
    expect(nextWindow).toEqual([expect.objectContaining({ ruleCode: 'SCANNER_404_PATTERN' })]);
  });
});
