import { afterEach, describe, expect, it } from 'vitest';
import { syncRouteSeoMeta } from './seoMeta';

const originalHead = document.head.innerHTML;

afterEach(() => {
  document.head.innerHTML = originalHead;
});

describe('SPA 路由 SEO 元数据', () => {
  it('公开根官网使用 index 与自引用 canonical', () => {
    document.head.innerHTML = '<meta name="robots" content="noindex, nofollow">';

    syncRouteSeoMeta({ meta: { seoIndexable: true, canonicalPath: '/' } });

    expect(document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('index, follow');
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      'https://boluo66.top/',
    );
  });

  it('进入应用私有路由时恢复 noindex 并移除官网 canonical', () => {
    document.head.innerHTML =
      '<meta name="robots" content="index, follow"><link rel="canonical" href="https://boluo66.top/">';

    syncRouteSeoMeta({ meta: {} });

    expect(document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content).toBe('noindex, nofollow');
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
