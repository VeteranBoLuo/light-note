/**
 * 网页元信息抓取
 *
 * 书签「AI 智能生成」用途：抓取用户填写的书签 URL 的真实网页内容（标题/描述/正文），
 * 交给 LLM 基于真实信息生成名称、描述、推荐标签，而不是让模型凭域名瞎猜
 * （DeepSeek / 千问的 chat 接口都没有联网能力，必须由后端自己抓）。
 *
 * ⚠️ 安全：本函数会让服务器主动请求用户提供的任意 URL（SSRF 攻击面）。
 * 通过自定义 DNS lookup 在「建立连接」这一层校验目标 IP：无论首个请求还是
 * 后续 302 重定向，只要解析到 localhost / 内网 / 保留网段就直接阻断，
 * 防止被用来探测内网服务或读取云厂商元数据（169.254.169.254）。
 */

import axios from 'axios';
import { load } from 'cheerio';
import { renderWebPage } from './webPageRenderer.js';
import { guardedHttpAgent, guardedHttpsAgent, validatePublicWebUrl } from './webUrlSafety.js';

const FETCH_TIMEOUT = 8000; // 8s：服务器 1 核，不宜久等
const LIVENESS_TIMEOUT = 12000; // 死活探测用更宽松超时:宁可慢也别误判成死链
const DEFAULT_MAX_CONTENT_BYTES = 1.5 * 1024 * 1024; // 元信息等轻量调用默认最多读取 1.5MB HTML
export const EXPLICIT_WEB_READ_MAX_BYTES = 4 * 1024 * 1024; // 用户主动读取或分析网页时的统一预算
const ABSOLUTE_MAX_CONTENT_BYTES = EXPLICIT_WEB_READ_MAX_BYTES; // 所有调用都必须保留绝对内存上限
const MAX_REDIRECTS = 3;
const BODY_TEXT_LIMIT = 2000; // 正文摘录上限，够 LLM 判断即可，避免 prompt 过长
// 统一用浏览器 UA(抓正文 + 探活):爬虫 UA(如 LightNoteBot)会被知乎等反爬站直接 403,反而抓不到正文;
// 浏览器 UA 命中率更高(个别站如 CSDN 对无 cookie 的浏览器 UA 反而更严,属可接受的个别情况)。
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MAX_STORABLE_BOOKMARK_URL_LENGTH = 255;
const XHS_SHORT_LINK_HOSTS = new Set(['xhslink.cn', 'www.xhslink.cn', 'xhslink.com', 'www.xhslink.com']);

function axiosResponseUrl(response, fallbackUrl) {
  const candidates = [
    response?.request?.res?.responseUrl,
    response?.request?._redirectable?._currentUrl,
    response?.config?.url,
    fallbackUrl,
  ];
  for (const candidate of candidates) {
    try {
      const parsed = new URL(String(candidate || ''));
      if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
        return parsed.href;
      }
    } catch {
      // 继续尝试下一个 Axios 兼容字段。
    }
  }
  return String(fallbackUrl || '');
}

function normalizeMaxContentBytes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_CONTENT_BYTES;
  return Math.min(Math.trunc(parsed), ABSOLUTE_MAX_CONTENT_BYTES);
}

function isContentLimitError(error) {
  return /maxContentLength size of \d+ exceeded/i.test(String(error?.message || ''));
}

function isXiaohongshuHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com');
}

/**
 * 小红书短链会跳到带大量分享跟踪参数的长地址，直接保存既超过 bookmark.url 的 255 字符，
 * 去掉全部参数又会丢失站外访问所需的 xsec_token。这里只保留真实笔记 ID 与访问必需参数，
 * 得到可展示、可打开、可持久化的 HTTPS 地址；其他站点不做猜测性改写。
 */
function resolveKnownShortLinkTarget(originalUrl, responseUrl) {
  let original;
  let resolved;
  try {
    original = new URL(String(originalUrl || ''));
    resolved = new URL(String(responseUrl || ''));
  } catch {
    return '';
  }
  if (!XHS_SHORT_LINK_HOSTS.has(original.hostname.toLowerCase()) || !isXiaohongshuHost(resolved.hostname)) {
    return '';
  }

  const noteId = resolved.pathname.match(/\/(?:explore|discovery\/item)\/([a-z\d]{24})(?:\/|$)/iu)?.[1];
  const accessToken = resolved.searchParams.get('xsec_token');
  if (!noteId || !accessToken) {
    return resolved.href.length <= MAX_STORABLE_BOOKMARK_URL_LENGTH ? resolved.href : '';
  }

  const stableUrl = new URL(`/explore/${noteId}`, 'https://www.xiaohongshu.com');
  stableUrl.searchParams.set('xsec_token', accessToken);
  const accessSource = resolved.searchParams.get('xsec_source');
  if (accessSource) stableUrl.searchParams.set('xsec_source', accessSource);
  return stableUrl.href.length <= MAX_STORABLE_BOOKMARK_URL_LENGTH ? stableUrl.href : '';
}

function storablePublicUrl(candidate) {
  try {
    const parsed = validatePublicWebUrl(candidate);
    return parsed.href.length <= MAX_STORABLE_BOOKMARK_URL_LENGTH ? parsed.href : '';
  } catch {
    return '';
  }
}

function resolveFetchedUrl(originalUrl, responseUrl, canonicalUrl = '') {
  let absoluteCanonical = canonicalUrl;
  try {
    absoluteCanonical = canonicalUrl ? new URL(canonicalUrl, responseUrl || originalUrl).href : '';
  } catch {
    absoluteCanonical = '';
  }
  return (
    resolveKnownShortLinkTarget(originalUrl, responseUrl) ||
    storablePublicUrl(absoluteCanonical) ||
    storablePublicUrl(responseUrl) ||
    storablePublicUrl(originalUrl) ||
    String(originalUrl || '')
  );
}

/** 常见 HTML 实体解码（仅覆盖高频实体，够用即可） */
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // &amp; 最后解码，避免二次转义
}

function safeFromCodePoint(cp) {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 抽取指定 name/property 的 meta content（兼顾 content 在 name 前后的属性顺序） */
function extractMeta(html, key) {
  const re = new RegExp(`<meta[^>]*?(?:name|property)\\s*=\\s*["']${escapeRegExp(key)}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  if (!tag) return '';
  const content = tag.match(/content\s*=\s*["']([\s\S]*?)["']/i)?.[1];
  return content ? decodeEntities(content).replace(/\s+/g, ' ').trim() : '';
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

function boundedDiagnosticText(value, limit = 260_000) {
  const source = String(value || '');
  if (source.length <= limit) return source;
  const half = Math.floor(limit / 2);
  return `${source.slice(0, half)}\n${source.slice(-half)}`;
}

function jsonLdString(value, limit = 8_000) {
  if (Array.isArray(value))
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join(', ')
      .slice(0, limit);
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, limit) : '';
}

function extractJsonLdFields(sources, bodyLimit = BODY_TEXT_LIMIT) {
  const candidates = [];
  let visited = 0;
  const visit = (value, depth = 0) => {
    if (visited >= 500 || depth > 8 || value === null || typeof value !== 'object') return;
    visited += 1;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const types = (Array.isArray(value['@type']) ? value['@type'] : [value['@type']])
      .map((item) => String(item || '').toLowerCase())
      .filter(Boolean);
    const preferredType = types.some((type) =>
      /article|posting|webpage|videoobject|audioobject|creativework|product|recipe|event/u.test(type),
    );
    const title = jsonLdString(value.headline || value.name, 1_000);
    const description = jsonLdString(value.description, 4_000);
    const bodyText = jsonLdString(value.articleBody || value.text, Math.max(bodyLimit, 8_000));
    const keywords = jsonLdString(value.keywords, 2_000);
    const siteName = jsonLdString(value.publisher?.name || value.isPartOf?.name, 1_000);
    if (title || description || bodyText || keywords || siteName) {
      candidates.push({
        title,
        description,
        bodyText,
        keywords,
        siteName,
        score: (preferredType ? 10_000 : 0) + bodyText.length * 2 + description.length + title.length,
      });
    }
    for (const nested of Object.values(value)) visit(nested, depth + 1);
  };
  for (const source of Array.isArray(sources) ? sources : []) {
    try {
      visit(JSON.parse(String(source || '')));
    } catch {
      // 单个站点常混入非标准 JSON-LD；跳过坏块，不能拖垮其余元信息。
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = (field) => candidates.find((candidate) => candidate[field])?.[field] || '';
  return {
    title: best('title'),
    description: best('description'),
    bodyText: best('bodyText').slice(0, Math.max(0, bodyLimit)),
    keywords: best('keywords'),
    siteName: best('siteName'),
  };
}

const SCRIPT_ACCESS_CHALLENGE_PATTERNS = Object.freeze([
  /(?:id|class|action|src)\s*=\s*["'][^"']*(?:captcha|human[-_]?verification|challenge[-_/]platform|security[-_]?check)/iu,
  /document\.cookie[\s\S]{0,20000}(?:location\.(?:reload|href)|window\.location)/iu,
]);
const VISIBLE_ACCESS_CHALLENGE_PATTERNS = Object.freeze([
  /访问验证|安全验证|环境异常|人机验证|异常流量|完成验证|滑动验证|滑块验证/iu,
  /verify (?:that )?you are human|checking your browser|unusual traffic|security check/iu,
]);
const ACCESS_CHALLENGE_PATTERNS = Object.freeze([
  ...SCRIPT_ACCESS_CHALLENGE_PATTERNS,
  ...VISIBLE_ACCESS_CHALLENGE_PATTERNS,
]);
const AUTH_REQUIRED_PATTERNS = Object.freeze([
  /登录后(?:查看|继续|访问)|请先登录|账号登录|扫码登录/iu,
  /sign in to (?:continue|view)|log in to (?:continue|view)|authentication required/iu,
]);
const VISIBLE_ERROR_PATTERNS = Object.freeze([
  /抱歉.{0,20}(?:出错|无法|不可用)|页面.{0,10}(?:出错|异常)|内容.{0,10}(?:不存在|不可用|已删除)/iu,
  /unexpected application error|something went wrong|content (?:is )?(?:unavailable|not found)/iu,
]);
const LOADING_SHELL_PATTERNS = Object.freeze([
  /(?:视频|直播|页面|内容|数据)?(?:正在)?加载中/u,
  /\b(?:loading|please wait)\b/iu,
]);

/**
 * 不按站点名判断，而按页面可观察特征区分脚本空壳、环境验证、登录门槛与真空页。
 * 只有正文/元信息不足时才把通用 captcha 脚本等信号当成拦截，避免误伤正文里提到验证的文章。
 */
export function classifyWebPageSnapshot({
  title = '',
  description = '',
  bodyText = '',
  diagnosticText = '',
  noscriptText = '',
  scriptCount = 0,
  passwordInput = false,
  status = 200,
  minimumBodyLength = 0,
} = {}) {
  const normalizedTitle = String(title || '').trim();
  const normalizedDescription = String(description || '').trim();
  const normalizedBody = String(bodyText || '').trim();
  const evidence = boundedDiagnosticText(
    `${diagnosticText}\n${noscriptText}\n${normalizedTitle}\n${normalizedDescription}\n${normalizedBody}`,
  );
  const hasUsefulMetadata = normalizedTitle.length >= 3 && normalizedDescription.length >= 8;
  const hasUsefulBody = normalizedBody.length >= 40;
  const lowInformation = normalizedBody.length < 600 && !hasUsefulMetadata;
  const visibleChallenge = VISIBLE_ACCESS_CHALLENGE_PATTERNS.some((pattern) =>
    pattern.test(`${normalizedTitle}\n${normalizedBody}`),
  );
  const visibleText = `${normalizedTitle}\n${normalizedBody}`;

  if ([401, 403].includes(Number(status)) && !hasUsefulMetadata && !hasUsefulBody) return 'ACCESS_DENIED';
  if (normalizedBody.length < 240 && VISIBLE_ERROR_PATTERNS.some((pattern) => pattern.test(visibleText))) {
    return 'ACCESS_DENIED';
  }
  if ((lowInformation || visibleChallenge) && ACCESS_CHALLENGE_PATTERNS.some((pattern) => pattern.test(evidence))) {
    return 'ACCESS_CHALLENGE';
  }
  if (
    normalizedBody.length < 600 &&
    !hasUsefulMetadata &&
    (passwordInput || AUTH_REQUIRED_PATTERNS.some((pattern) => pattern.test(evidence)))
  ) {
    return 'AUTH_REQUIRED';
  }
  if (Number(minimumBodyLength) > 0 && normalizedBody.length < Number(minimumBodyLength)) {
    return Number(scriptCount) > 0 || /javascript|enable js|启用\s*javascript/iu.test(noscriptText)
      ? 'JS_REQUIRED'
      : 'EMPTY_CONTENT';
  }
  if (
    normalizedBody.length < 800 &&
    !hasUsefulMetadata &&
    LOADING_SHELL_PATTERNS.some((pattern) => pattern.test(normalizedBody))
  ) {
    return 'JS_REQUIRED';
  }
  if (normalizedTitle || normalizedDescription || hasUsefulBody) return '';
  if (Number(scriptCount) > 0 || /javascript|enable js|启用\s*javascript/iu.test(noscriptText)) return 'JS_REQUIRED';
  return 'EMPTY_CONTENT';
}

const READABLE_CANDIDATE_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '[itemprop="articleBody"]',
  '.article-content',
  '.article_content',
  '.post-content',
  '.post_content',
  '.entry-content',
  '.markdown-body',
  '#article_content',
  '#articleContent',
  '#content',
];
const READABLE_NOISE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  '[aria-hidden="true"]',
  '.advertisement',
  '.ads',
  '.sidebar',
  '.comments',
  '.comment-list',
  '.related-posts',
].join(',');
const READABLE_BLOCK_SELECTOR = 'p,li,blockquote,pre,h1,h2,h3,h4,h5,h6,section,div,table,tr';

function normalizeReadableText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readableCandidate($, element) {
  const node = $(element).clone();
  node.find(READABLE_NOISE_SELECTOR).remove();
  node.find('br').replaceWith('\n');
  node.find(READABLE_BLOCK_SELECTOR).each((_, block) => {
    $(block).append('\n');
  });
  const text = normalizeReadableText(node.text());
  const linkTextLength = normalizeReadableText(node.find('a').text()).length;
  const paragraphCount = node.find('p').length;
  const linkDensity = text.length ? linkTextLength / text.length : 1;
  return {
    text,
    score: text.length * Math.max(0.15, 1 - linkDensity * 0.85) + paragraphCount * 40,
  };
}

/**
 * 先从 article/main/常见正文容器中选择信息密度最高的候选，再回退 body。
 * 避免旧实现把导航、登录框和页脚排在真正正文前面，截 2000 字后反而没有文章内容。
 */
export function extractReadableBodyText(html, limit = BODY_TEXT_LIMIT) {
  const boundedLimit = Math.max(0, Number(limit) || BODY_TEXT_LIMIT);
  if (!boundedLimit) return '';
  try {
    const $ = load(String(html || ''));
    $(READABLE_NOISE_SELECTOR).remove();
    const candidates = [];
    const seen = new Set();
    for (const selector of READABLE_CANDIDATE_SELECTORS) {
      $(selector).each((_, element) => {
        if (seen.has(element)) return;
        seen.add(element);
        const candidate = readableCandidate($, element);
        if (candidate.text.length >= 80) candidates.push(candidate);
      });
    }
    // 只在没有明确正文容器时使用整个 body；否则页面上大量推荐卡片可能仅凭长度
    // 压过 article/main，让正文预算再次被非文章内容占满。
    if (!candidates.length) {
      candidates.push(readableCandidate($, $('body').get(0) || $.root().get(0)));
    }
    candidates.sort((a, b) => b.score - a.score || b.text.length - a.text.length);
    return String(candidates[0]?.text || '').slice(0, boundedLimit);
  } catch {
    const plain = String(html || '')
      .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<head[\s\S]*?<\/head>/i, ' ')
      .replace(/<[^>]+>/g, ' ');
    return decodeEntities(plain).replace(/\s+/g, ' ').trim().slice(0, boundedLimit);
  }
}

function extractStaticPageSnapshot(html, bodyLimit) {
  let jsonLdSources = [];
  let noscriptText = '';
  let scriptCount = 0;
  let passwordInput = false;
  let canonicalUrl = '';
  try {
    const $ = load(String(html || ''));
    jsonLdSources = $('script[type="application/ld+json"]')
      .toArray()
      .map((element) => $(element).text())
      .filter(Boolean)
      .slice(0, 20);
    noscriptText = $('noscript').text().replace(/\s+/gu, ' ').trim().slice(0, 2_000);
    scriptCount = $('script').length;
    passwordInput = $('input[type="password"]').length > 0;
    canonicalUrl = $('link[rel~="canonical" i]').first().attr('href') || '';
  } catch {
    scriptCount = (String(html || '').match(/<script\b/giu) || []).length;
    passwordInput = /<input[^>]+type\s*=\s*["']password["']/iu.test(String(html || ''));
  }
  const jsonLd = extractJsonLdFields(jsonLdSources, bodyLimit);
  const readableBody = extractReadableBodyText(html, bodyLimit);
  const bodyText = readableBody.length >= 40 ? readableBody : jsonLd.bodyText || readableBody;
  return {
    title: extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || extractTitle(html) || jsonLd.title,
    description:
      extractMeta(html, 'og:description') ||
      extractMeta(html, 'twitter:description') ||
      extractMeta(html, 'description') ||
      jsonLd.description,
    siteName: extractMeta(html, 'og:site_name') || extractMeta(html, 'application-name') || jsonLd.siteName,
    keywords: extractMeta(html, 'keywords') || jsonLd.keywords,
    bodyText,
    canonicalUrl,
    signals: {
      diagnosticText: boundedDiagnosticText(html),
      noscriptText,
      scriptCount,
      passwordInput,
    },
  };
}

function renderedMetaValue(meta, ...keys) {
  for (const key of keys) {
    const value = String(meta?.[key] || '')
      .replace(/\s+/gu, ' ')
      .trim();
    if (value) return value;
  }
  return '';
}

function normalizeRenderedPageSnapshot(snapshot, { originalUrl, bodyLimit, minimumBodyLength }) {
  if (!snapshot?.ok) return snapshot || { ok: false, reason: 'RENDERER_FAILED' };
  const jsonLd = extractJsonLdFields(snapshot.jsonLd, bodyLimit);
  const title =
    renderedMetaValue(snapshot.meta, 'og:title', 'twitter:title') ||
    String(snapshot.documentTitle || '').trim() ||
    jsonLd.title;
  const description =
    renderedMetaValue(snapshot.meta, 'og:description', 'twitter:description', 'description') || jsonLd.description;
  const siteName = renderedMetaValue(snapshot.meta, 'og:site_name', 'application-name') || jsonLd.siteName;
  const keywords = renderedMetaValue(snapshot.meta, 'keywords') || jsonLd.keywords;
  const renderedBody = String(snapshot.bodyText || '')
    .trim()
    .slice(0, Math.max(0, bodyLimit));
  const bodyText = renderedBody.length >= 40 ? renderedBody : jsonLd.bodyText || renderedBody;
  const reason = classifyWebPageSnapshot({
    title,
    description,
    bodyText,
    diagnosticText: snapshot.signals?.diagnosticText,
    noscriptText: snapshot.signals?.noscriptText,
    scriptCount: snapshot.signals?.scriptCount,
    passwordInput: snapshot.signals?.passwordInput,
    status: snapshot.status,
    minimumBodyLength,
  });
  if (reason) return { ok: false, reason };
  return {
    ok: true,
    url: resolveFetchedUrl(originalUrl, snapshot.url, snapshot.canonicalUrl),
    title,
    description,
    siteName,
    keywords,
    bodyText,
    source: 'rendered_dom',
  };
}

const RENDER_FALLBACK_REASONS = new Set(['ACCESS_CHALLENGE', 'ACCESS_DENIED', 'EMPTY_CONTENT', 'JS_REQUIRED']);
const MOBILE_PROFILE_RETRY_REASONS = new Set(['ACCESS_CHALLENGE', 'ACCESS_DENIED', 'EMPTY_CONTENT', 'JS_REQUIRED']);

/** 探测响应编码：优先 HTTP header，其次 HTML <meta charset>（国内站点常见 GBK） */
function detectCharset(contentType, buf) {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType || '')?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const head = buf.slice(0, 2048).toString('latin1'); // 用 latin1 无损读字节找 charset 声明
  const m = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || /charset=["']?([\w-]+)/i.exec(head);
  return (m?.[1] || 'utf-8').toLowerCase();
}

function decodeBuffer(buf, charset) {
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    try {
      return new TextDecoder('utf-8').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  }
}

/**
 * 抓取网页并提取元信息。
 * 失败时返回 { ok:false, reason }。调用方不得在没有真实页面证据时让模型猜测。
 *
 * @param {string} rawUrl 用户填写的书签地址
 * @returns {Promise<
 *   | { ok: true, url: string, title: string, description: string, siteName: string, keywords: string, bodyText: string }
 *   | { ok: false, reason: string }
 * >}
 */
export async function fetchWebMeta(
  rawUrl,
  {
    bodyLimit = BODY_TEXT_LIMIT,
    maxContentBytes = DEFAULT_MAX_CONTENT_BYTES,
    minimumBodyLength = 0,
    renderFallback = false,
    renderer = renderWebPage,
    signal,
    timeout = FETCH_TIMEOUT,
  } = {},
) {
  // 归一化:无协议头补 https://(与 read_url 一致)。老书签/导入的 URL 常不带协议,
  // 不补会直接 new URL() 抛错 → INVALID_URL,导致归档失败/死链误报。
  let input = String(rawUrl || '').trim();
  if (input && !/^https?:\/\//i.test(input)) input = 'https://' + input;
  let target;
  try {
    target = validatePublicWebUrl(input);
  } catch (error) {
    return { ok: false, reason: String(error?.code || 'INVALID_URL') };
  }

  let buf;
  let contentType = '';
  let responseUrl = target.href;
  let staticFailure = '';
  const contentBudget = normalizeMaxContentBytes(maxContentBytes);
  try {
    const resp = await axios.get(target.href, {
      timeout,
      maxRedirects: MAX_REDIRECTS,
      maxContentLength: contentBudget,
      responseType: 'arraybuffer',
      httpAgent: guardedHttpAgent,
      httpsAgent: guardedHttpsAgent,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        // 补两个浏览器常带的头,进一步降低被 WAF/反爬识别为机器人的概率
        Referer: target.origin + '/',
        'Upgrade-Insecure-Requests': '1',
      },
      signal,
    });
    responseUrl = axiosResponseUrl(resp, target.href);
    contentType = resp.headers?.['content-type'] || '';
    // 只处理 HTML/文本，二进制（PDF/图片等）直接放弃
    if (contentType && !/text\/html|application\/xhtml|text\/plain|application\/xml/i.test(contentType)) {
      return { ok: false, reason: 'NOT_HTML' };
    }
    buf = Buffer.from(resp.data);
    if (buf.length > contentBudget) return { ok: false, reason: 'CONTENT_TOO_LARGE' };
  } catch (e) {
    // 用户主动停止或上游超时时必须继续向上传播，不能降级成 FETCH_FAILED 后又调用模型，
    // 否则界面虽然显示“已停止”，服务器仍会在后台继续消耗资源。
    if (signal?.aborted || e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') {
      throw e;
    }
    if (String(e?.message || '').includes('BLOCKED_PRIVATE_IP')) {
      return { ok: false, reason: 'BLOCKED_HOST' };
    }
    if (isContentLimitError(e)) return { ok: false, reason: 'CONTENT_TOO_LARGE' };
    const status = Number(e?.response?.status || 0);
    if (status === 401 || status === 403) staticFailure = 'ACCESS_DENIED';
    if (status === 404 || status === 410) return { ok: false, reason: 'NOT_FOUND' };
    if (status === 429) return { ok: false, reason: 'RATE_LIMITED' };
    if (
      !staticFailure &&
      (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT' || String(e?.message || '').includes('timeout'))
    ) {
      return { ok: false, reason: 'TIMEOUT' };
    }
    if (!staticFailure && (e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN'))
      return { ok: false, reason: 'DNS_FAILED' };
    if (
      !staticFailure &&
      ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(e?.code)
    ) {
      return { ok: false, reason: 'TLS_FAILED' };
    }
    if (!staticFailure) return { ok: false, reason: 'FETCH_FAILED' };
  }

  if (!staticFailure) {
    const html = decodeBuffer(buf, detectCharset(contentType, buf));
    const snapshot = extractStaticPageSnapshot(html, bodyLimit);
    staticFailure = classifyWebPageSnapshot({
      title: snapshot.title,
      description: snapshot.description,
      bodyText: snapshot.bodyText,
      diagnosticText: snapshot.signals.diagnosticText,
      noscriptText: snapshot.signals.noscriptText,
      scriptCount: snapshot.signals.scriptCount,
      passwordInput: snapshot.signals.passwordInput,
      minimumBodyLength,
    });
    if (!staticFailure) {
      return {
        ok: true,
        url: resolveFetchedUrl(target.href, responseUrl, snapshot.canonicalUrl),
        title: snapshot.title,
        description: snapshot.description,
        siteName: snapshot.siteName,
        keywords: snapshot.keywords,
        bodyText: snapshot.bodyText,
        source: 'static_html',
      };
    }
  }

  if (!renderFallback || !RENDER_FALLBACK_REASONS.has(staticFailure)) {
    return { ok: false, reason: staticFailure || 'EMPTY_CONTENT' };
  }
  const renderWithProfile = async (profile) => {
    let rendered;
    try {
      rendered = await renderer(target.href, {
        bodyLimit,
        signal,
        timeout: Math.max(12_000, Number(timeout) || 0),
        profile,
      });
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;
      rendered = { ok: false, reason: 'RENDERER_FAILED' };
    }
    return normalizeRenderedPageSnapshot(rendered, {
      originalUrl: target.href,
      bodyLimit,
      minimumBodyLength,
    });
  };
  let normalized = await renderWithProfile('desktop');
  // 同一套通用提取规则下，移动页面通常比桌面 SPA 更轻；首个渲染仍是空壳、验证或错误页时
  // 再尝试一次移动视口，不读取用户浏览器 Cookie，也不引入任何站点选择器。
  if (!normalized.ok && MOBILE_PROFILE_RETRY_REASONS.has(normalized.reason)) {
    normalized = await renderWithProfile('mobile');
  }
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason || staticFailure, staticReason: staticFailure };
  }
  return normalized;
}

/**
 * 死活探测(死链检测用)。返回 { status, code }:
 *  - 'suspect':服务器对该 URL 返回 404/410。**不等于真失效**——单页应用(SPA)深层路由、
 *              被删的子页、或托管未做 SPA 兜底,都会让"浏览器能开、服务器直取却 404"。故仅标"疑似",由用户确认。
 *  - 'alive':2xx/3xx,以及 401/403/429/412/400/5xx(站点存在,只是反爬/限流/鉴权/临时错)
 *  - 'unknown':超时 / 连接错 / 证书错 / 无效 URL(拿不到结论,绝不判失效,避免误报)
 *  - 'skip':内网/被 SSRF 拦截
 * 流式请求:拿到状态码即丢弃响应体,不下载正文。复用 fetchWebMeta 的 guardedLookup agents 做 SSRF 防护。
 */
export async function checkUrlLiveness(rawUrl, { timeout = LIVENESS_TIMEOUT } = {}) {
  let input = String(rawUrl || '').trim();
  if (!input) return { status: 'unknown', code: 'EMPTY' };
  if (!/^https?:\/\//i.test(input)) input = 'https://' + input;
  let target;
  try {
    target = validatePublicWebUrl(input);
  } catch (error) {
    const code = String(error?.code || 'INVALID_URL');
    if (code === 'BLOCKED_HOST') return { status: 'skip', code: 'BLOCKED' };
    return { status: 'suspect', code: code === 'UNSUPPORTED_PROTOCOL' ? 'PROTO' : code };
  }
  try {
    const resp = await axios.get(target.href, {
      timeout,
      maxRedirects: MAX_REDIRECTS,
      validateStatus: () => true, // 接受所有状态码,自行按 code 判定
      httpAgent: guardedHttpAgent,
      httpsAgent: guardedHttpsAgent,
      responseType: 'stream',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    const code = resp.status;
    const responseUrl = axiosResponseUrl(resp, target.href);
    const resolvedUrl = resolveFetchedUrl(target.href, responseUrl);
    resp.data?.destroy?.(); // 拿到状态码即丢弃响应体,不下载
    if (code === 404 || code === 410) return { status: 'suspect', code }; // 仅疑似,交用户确认(SPA/子页删除都可能)
    return { status: 'alive', code, ...(resolvedUrl && resolvedUrl !== target.href ? { resolvedUrl } : {}) };
  } catch (e) {
    if (String(e?.message || '').includes('BLOCKED_PRIVATE_IP')) return { status: 'skip', code: 'BLOCKED' };
    const code = e?.code || 'ERR';
    // 域名不存在(DNS NXDOMAIN)= 基本可判失效;超时/连接重置/拒绝/证书错 = 未知不判(避免误报)
    if (code === 'ENOTFOUND') return { status: 'suspect', code };
    return { status: 'unknown', code };
  }
}
