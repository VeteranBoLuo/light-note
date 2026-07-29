import type { RouteLocationNormalizedLoaded, RouteMeta } from 'vue-router';

const SITE_ORIGIN = 'https://boluo66.top';

type SeoRouteMeta = RouteMeta & {
  seoIndexable?: boolean;
  canonicalPath?: string;
};

function ensureRobotsMeta() {
  let element = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!element) {
    element = document.createElement('meta');
    element.name = 'robots';
    document.head.appendChild(element);
  }
  return element;
}

function ensureCanonicalLink() {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  return element;
}

/**
 * SPA 内导航时同步索引指令，避免从官网进入应用后遗留 index，或从应用返回官网后
 * 遗留 noindex。服务端/构建产物仍是最终兜底：私有路由首个响应始终 noindex。
 */
export function syncRouteSeoMeta(route: Pick<RouteLocationNormalizedLoaded, 'meta'>) {
  if (typeof document === 'undefined') return;
  const meta = route.meta as SeoRouteMeta;
  const robots = ensureRobotsMeta();

  if (meta.seoIndexable !== true) {
    robots.content = 'noindex, nofollow';
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.remove();
    return;
  }

  const canonicalPath = String(meta.canonicalPath || '/');
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`;
  robots.content = 'index, follow';
  ensureCanonicalLink().href = canonicalUrl;

  const ogUrl = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (ogUrl) {
    ogUrl.content = canonicalUrl;
  }
}
