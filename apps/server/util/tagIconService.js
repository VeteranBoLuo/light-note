import { requestAi } from './agent/aiGateway.js';
import { safeAgentError } from './agent/logSafety.js';
import { TAG_ICON_MAX_SVG_BYTES } from './contentLimits.js';

const ICONIFY_API = 'https://api.iconify.design';
const SEARCH_PREFIXES = ['simple-icons', 'material-symbols', 'material-symbols-light', 'lucide', 'tabler'];
const ALLOWED_PREFIXES = new Set(SEARCH_PREFIXES);
const SEARCH_PAGE_SIZE = 24;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

const searchCache = new Map();
const keywordCache = new Map();
const svgCache = new Map();
// 所有图标请求共用有界并发，批量补全不会瞬间冲击外部服务。
let activeRequests = 0;
const requestWaiters = [];
async function withIconRequest(work) {
  if (requestWaiters.length >= 100)
    throw Object.assign(new Error('图标服务繁忙，请稍后重试'), { code: 'ICON_SERVICE_BUSY', status: 503 });
  if (activeRequests >= 3) await new Promise((resolve) => requestWaiters.push(resolve));
  else activeRequests++;
  try {
    return await work();
  } finally {
    const next = requestWaiters.shift();
    if (next) next();
    else activeRequests--;
  }
}
const BRAND_ALIASES = new Map([
  ['github', 'github'],
  ['gitlab', 'gitlab'],
  ['redis', 'redis'],
  ['mysql', 'mysql'],
  ['python', 'python'],
  ['javascript', 'javascript'],
  ['typescript', 'typescript'],
  ['docker', 'docker'],
  ['react', 'react'],
  ['vue', 'vuedotjs'],
  ['vue.js', 'vuedotjs'],
  ['微信', 'wechat'],
  ['wechat', 'wechat'],
  ['支付宝', 'alipay'],
  ['alipay', 'alipay'],
]);

const LOCAL_KEYWORDS = new Map([
  ['证书', ['award', 'badge']],
  ['证件', ['id-card', 'contact']],
  ['网络安全', ['shield', 'lock']],
  ['法律', ['scale', 'gavel']],
  ['健康', ['heart', 'activity']],
  ['阅读', ['book-open', 'book']],
  ['代码', ['code', 'terminal']],
  ['开发', ['code', 'developer']],
  ['数据库', ['database', 'server']],
  ['游戏', ['game', 'controller']],
  ['视频', ['video', 'play']],
  ['设计', ['design', 'palette']],
  ['云', ['cloud']],
  ['文档', ['document', 'file-text']],
  ['学习', ['study', 'book']],
  ['工作', ['work', 'briefcase']],
  ['音乐', ['music', 'headphones']],
  ['购物', ['shopping', 'cart']],
  ['金融', ['finance', 'wallet']],
  ['社交', ['social', 'users']],
  ['健身', ['fitness', 'dumbbell']],
  ['旅行', ['travel', 'plane']],
  ['美食', ['food', 'restaurant']],
  ['菜谱', ['recipe', 'cooking']],
  ['图片', ['image', 'photo']],
  ['书签', ['bookmark']],
  ['笔记', ['note', 'edit']],
  ['文件', ['file', 'folder']],
]);

function getCached(cache, key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(cache, key, value) {
  if (cache.size >= MAX_CACHE_SIZE) cache.delete(cache.keys().next().value);
  cache.set(key, { createdAt: Date.now(), value });
}

export function normalizeIconQuery(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

export function containsCjk(value) {
  return /[\u3400-\u9fff]/u.test(String(value || ''));
}

function uniqueKeywords(values) {
  return [
    ...new Set(
      values
        .map((item) =>
          String(item || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ].slice(0, 4);
}

export function getLocalKeywords(query) {
  const values = [];
  for (const [word, keywords] of LOCAL_KEYWORDS.entries()) {
    if (query.includes(word)) values.push(...keywords);
  }
  return uniqueKeywords(values);
}

export function parseKeywordResponse(content) {
  const cleaned = String(content || '')
    .replace(/```json|```/gi, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed?.keywords)) return [];
    return uniqueKeywords(
      parsed.keywords.filter((item) => typeof item === 'string' && /^[a-z0-9][a-z0-9 .+#-]*$/i.test(item)),
    );
  } catch {
    return [];
  }
}

async function translateToIconKeywords(query, trace, signal) {
  const cacheKey = query.toLowerCase();
  const cached = getCached(keywordCache, cacheKey);
  if (cached) return cached;
  const localKeywords = getLocalKeywords(query);
  let aiKeywords = [];
  try {
    const result = await requestAi(
      [
        {
          role: 'system',
          content:
            '你负责把标签名称转换成适合 Iconify 搜索的英文关键词。保留品牌英文名，返回 2 到 4 个简短关键词，只输出 JSON：{"keywords":["keyword"]}。不要生成 SVG，不要解释。',
        },
        { role: 'user', content: query },
      ],
      {
        signal,
        toolChoice: 'none',
        maxTokens: 120,
        temperature: 0.1,
        trace: { ...trace, taskType: 'tag_icon_search', stage: 'tag_icon_keywords' },
      },
    );
    aiKeywords = parseKeywordResponse(result.content);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('[tag-icon] AI 关键词转换失败:', safeAgentError(error));
    }
    // 这是用户显式点击并可能消耗额度的动作。普通免费搜索已经提供本地语义降级，
    // 这里不能把 Provider 失败伪装成“AI 扩展成功”。保留页面现有免费结果并明确报错。
    throw error;
  }
  if (!aiKeywords.length) {
    const error = new Error('AI 图标关键词格式无效');
    error.code = 'AI_SKILL_STRUCTURED_OUTPUT_INVALID';
    throw error;
  }
  const asciiWords = query.match(/[a-z][a-z0-9.+#-]{1,}/gi) || [];
  const keywords = uniqueKeywords([...asciiWords, ...aiKeywords, ...localKeywords]);
  const fallback = keywords.length ? keywords : ['tag'];
  setCached(keywordCache, cacheKey, fallback);
  return fallback;
}

async function fetchIconifyJson(url) {
  return withIconRequest(async () => {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`Iconify 请求失败：${response.status}`);
    return await response.json();
  });
}

async function searchOneKeyword(keyword) {
  const url = new URL('/search', ICONIFY_API);
  url.searchParams.set('query', keyword);
  url.searchParams.set('limit', '64');
  url.searchParams.set('prefixes', SEARCH_PREFIXES.join(','));
  const data = await fetchIconifyJson(url);
  return Array.isArray(data?.icons) ? data.icons : [];
}

function rankIcons(icons, keywords) {
  const normalizedKeywords = keywords.map((item) => item.toLowerCase().replace(/\s+/g, '-'));
  const prefixScore = {
    'simple-icons': 40,
    'material-symbols': 30,
    'material-symbols-light': 25,
    lucide: 20,
    tabler: 15,
  };
  return [...new Set(icons)]
    .filter((icon) => {
      const [prefix, name] = String(icon).split(':');
      return ALLOWED_PREFIXES.has(prefix) && !!name;
    })
    .map((icon, index) => {
      const [prefix, name] = icon.split(':');
      let score = prefixScore[prefix] || 0;
      normalizedKeywords.forEach((keyword, keywordIndex) => {
        if (name === keyword) score += 120 - keywordIndex * 10;
        else if (name.startsWith(`${keyword}-`) || name.endsWith(`-${keyword}`)) score += 70 - keywordIndex * 5;
        else if (name.includes(keyword)) score += 40 - keywordIndex * 4;
      });
      return { icon, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.icon);
}

export async function searchTagIcons({ query, page = 0, useAi = false, signal, trace, mode = 'browse' } = {}) {
  const normalizedQuery = normalizeIconQuery(query);
  if (!normalizedQuery) throw new Error('ICON_QUERY_REQUIRED');
  const normalizedPage = Math.max(0, Math.min(20, Number(page) || 0));
  const aiExpanded = useAi === true && containsCjk(normalizedQuery);
  const recommend = mode === 'recommend';
  const brand = BRAND_ALIASES.get(normalizedQuery.toLowerCase());
  const cacheKey = `${mode}:${aiExpanded ? 'ai' : 'direct'}:${normalizedQuery.toLowerCase()}`;
  let result = getCached(searchCache, cacheKey);
  const cacheHit = !!result;

  if (!result) {
    const keywords = aiExpanded
      ? await translateToIconKeywords(normalizedQuery, trace, signal)
      : uniqueKeywords([
          ...(normalizedQuery.match(/[a-z][a-z0-9.+#-]{1,}/gi) || []),
          ...getLocalKeywords(normalizedQuery),
        ]);
    const asciiWords = normalizedQuery.match(/[a-z][a-z0-9.+#-]{1,}/gi) || [];
    const searchTerms = uniqueKeywords([
      ...(brand ? [brand] : []),
      ...asciiWords,
      ...keywords,
      ...(recommend ? [] : ['tag']),
    ]).slice(0, 3);
    const settled = await Promise.allSettled(searchTerms.map(searchOneKeyword));
    const icons = settled.flatMap((item) => (item.status === 'fulfilled' ? item.value : []));
    if (settled.length && !icons.length && settled.every((item) => item.status === 'rejected')) throw settled[0].reason;
    result = {
      icons: recommend ? rankRecommendedIcons(icons, searchTerms, brand) : rankIcons(icons, searchTerms),
      keywords,
      translatedQuery: searchTerms.join(' '),
    };
    setCached(searchCache, cacheKey, result);
  }

  const start = normalizedPage * SEARCH_PAGE_SIZE;
  const items = result.icons.slice(start, start + SEARCH_PAGE_SIZE);
  return {
    icons: items,
    keywords: result.keywords,
    translatedQuery: result.translatedQuery,
    page: normalizedPage,
    hasMore: start + items.length < result.icons.length,
    cached: cacheHit,
    aiExpanded,
  };
}

export function validateIconName(value) {
  const icon = String(value || '')
    .trim()
    .toLowerCase();
  const match = icon.match(/^([a-z0-9-]+):([a-z0-9][a-z0-9-]*)$/);
  if (!match || !ALLOWED_PREFIXES.has(match[1])) throw new Error('ICON_NAME_INVALID');
  return { icon, prefix: match[1], name: match[2] };
}

export function sanitizeIconifySvg(value) {
  let svg = String(value || '').trim();
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) throw new Error('ICON_SVG_INVALID');
  if (Buffer.byteLength(svg, 'utf8') > TAG_ICON_MAX_SVG_BYTES) throw new Error('ICON_SVG_TOO_LARGE');
  if (
    /<(script|style|foreignObject|iframe|object|embed|image|use|a)\b/i.test(svg) ||
    /\son[a-z]+\s*=/i.test(svg) ||
    /javascript:|data:text\/html|url\s*\(|\s(?:href|xlink:href)\s*=/i.test(svg)
  ) {
    throw new Error('ICON_SVG_UNSAFE');
  }
  const allowedTags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'ellipse']);
  for (const match of svg.matchAll(/<\/?([a-z][\w:-]*)\b/gi)) {
    if (!allowedTags.has(match[1].toLowerCase())) throw new Error('ICON_SVG_UNSAFE');
  }
  svg = svg.replace(/\s(?:width|height)="[^"]*"/gi, '');
  if (!/\sxmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg;
}

export async function resolveTagIcon(iconName) {
  const { icon, prefix, name } = validateIconName(iconName);
  const cached = getCached(svgCache, icon);
  if (cached) return cached;
  const url = `${ICONIFY_API}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;
  const svg = await withIconRequest(async () => {
    const response = await fetch(url, {
      headers: { Accept: 'image/svg+xml' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok)
      throw new Error(response.status === 404 ? 'ICON_NOT_FOUND' : `Iconify 请求失败：${response.status}`);
    return sanitizeIconifySvg(await response.text());
  });
  const result = {
    icon,
    svg,
    iconUrl: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
  };
  setCached(svgCache, icon, result);
  return result;
}

// 自动推荐不能依赖图标库的热门度或泛化 tag 兜底。
export function rankRecommendedIcons(icons, keywords, brand) {
  const terms = keywords.map((term) => term.toLowerCase().replace(/\s+/g, '-'));
  const styleScore = { lucide: 5, tabler: 4, 'material-symbols': 3, 'material-symbols-light': 2 };
  return [...new Set(icons)]
    .flatMap((icon) => {
      try {
        validateIconName(icon);
      } catch {
        return [];
      }
      const [prefix, name] = icon.split(':');
      if (prefix === 'simple-icons') return brand && name === brand ? [{ icon, score: 1000 }] : [];
      if (/^(?:tag|tags|label)(?:-|$)/.test(name)) return [];
      const matches = terms.map((term, index) => {
        if (name === term) return 200 - index * 10;
        if (name.startsWith(`${term}-`) || name.endsWith(`-${term}`)) return 100 - index * 10;
        return 0;
      });
      const semantic = Math.max(0, ...matches);
      return semantic ? [{ icon, score: semantic + (styleScore[prefix] || 0) }] : [];
    })
    .sort((a, b) => b.score - a.score || a.icon.localeCompare(b.icon))
    .map((item) => item.icon);
}

export async function recommendTagIcons(query) {
  const result = await searchTagIcons({ query, mode: 'recommend', useAi: false });
  const candidates = [];
  for (const iconName of result.icons.slice(0, 6)) {
    try {
      const resolved = await resolveTagIcon(iconName);
      candidates.push({ iconName, iconUrl: resolved.iconUrl, color: 'currentColor' });
      if (candidates.length === 3) break;
    } catch {
      /* 不可解析的候选不展示，继续尝试有限备选。 */
    }
  }
  if (result.icons.length && !candidates.length) throw new Error('ICON_RESOLVE_FAILED');
  return candidates;
}

export async function prepareTagIconChoice(value, candidates = []) {
  if (!value || typeof value !== 'object' || typeof value.iconName !== 'string')
    throw Object.assign(new Error('请选择有效图标'), { code: 'ORGANIZE_ICON_INVALID', status: 400 });
  const color = value.color || 'currentColor';
  if (typeof color !== 'string' || (color !== 'currentColor' && !/^#[0-9a-f]{6}$/i.test(color)))
    throw Object.assign(new Error('请选择有效颜色'), { code: 'ORGANIZE_ICON_INVALID', status: 400 });
  let icon;
  try {
    icon = validateIconName(value.iconName).icon;
  } catch {
    throw Object.assign(new Error('请选择有效图标'), { code: 'ORGANIZE_ICON_INVALID', status: 400 });
  }
  const saved = candidates.find((candidate) => candidate.iconName === icon);
  const resolved = saved
    ? {
        icon,
        svg: sanitizeIconifySvg(Buffer.from(String(saved.iconUrl).split(',')[1] || '', 'base64').toString('utf8')),
      }
    : await resolveTagIcon(icon);
  const svg = resolved.svg.replace(/currentColor/gi, color).replace('<svg', `<svg data-light-note-color="${color}"`);
  return {
    iconName: resolved.icon,
    color,
    iconUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  };
}
