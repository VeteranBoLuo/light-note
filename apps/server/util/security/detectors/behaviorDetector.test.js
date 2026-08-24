import { describe, expect, it } from 'vitest';
import {
  detectRequestBehavior,
  detectResponseBehavior,
  isPublicSeoReadRequest,
  normalizeBehaviorPath,
} from './behaviorDetector.js';

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
});

describe('404 扫描行为检测', () => {
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
});
