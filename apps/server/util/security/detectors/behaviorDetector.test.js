import { describe, expect, it } from 'vitest';
import { detectRequestBehavior, isPublicSeoReadRequest } from './behaviorDetector.js';

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
});
