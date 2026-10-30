import pool from '../db/index.js';
import { isSelfTraffic } from './logExclude.js';

// 取真实客户端 IP：用 req.ip(trust proxy=1 下由 nginx 追加的 X-Forwarded-For 链末尾解析出的真实客户端 IP)，
// 不取 XFF 首段——首段可被客户端任意伪造，会让 uniqueIps 等统计被刷虚高(与安全模块 requestContext.js 的修复同理)
const clientIp = (req) => {
  const ip = req?.ip || req?.socket?.remoteAddress || '';
  return ip.replace(/^::ffff:/, '');
};

// 渠道归因 source 白名单(与前端 utils/conversion.ts 的 SOURCES 保持一致):
// 仅用于「渠道归因类」事件(signup_open/signup_submit/register/demo_enter/share_*)的 context;
// 非白名单值一律降级 unknown,防止把 URL/邮箱/正文等脏值当 source 落库。
// 注意:wall_hit 的 context 存的是「撞墙操作」(另一维度,给热点表用),不走此白名单。
export const CONVERSION_SOURCES = new Set([
  'landing_primary',
  'landing_final',
  'landing_demo',
  'nav',
  'home_demo_hint',
  'browse_nudge',
  'preview_guide',
  'write_add_bookmark',
  'write_add_note',
  'write_upload_file',
  'write_edit_bookmark',
  'write_edit_note',
  'write_ai',
  'share',
  'auth_switch',
  'unknown',
]);

/** 归一渠道 source:白名单命中原样返回,否则降级 unknown(最长 64)。 */
export function normalizeConversionSource(source) {
  const s = String(source || '').slice(0, 64);
  return CONVERSION_SOURCES.has(s) ? s : 'unknown';
}

// 访客来源:新版客户端随每个浏览器会话首个 page_view 附带来源网站域名与推广参数,
// 服务端归类后另记一条 entry_source(context 为归类结果),只存归类,不存完整网址。
export const ENTRY_SOURCE_EVENT = 'entry_source';
const SEARCH_ENGINES = [
  ['baidu', /(^|\.)baidu\.com$/],
  ['bing', /(^|\.)bing\.com$/],
  ['google', /(^|\.)google\.[a-z.]+$/],
  ['sogou', /(^|\.)sogou\.com$/],
  ['360', /(^|\.)so\.com$/],
  ['shenma', /(^|\.)sm\.cn$/],
  ['duckduckgo', /(^|\.)duckduckgo\.com$/],
  ['yandex', /(^|\.)yandex\.[a-z.]+$/],
];
// 顺序有意义:微信在 qq.com 之下,必须先于 QQ 匹配。
const REFERRAL_SITES = [
  ['github', /(^|\.)github\.com$/],
  ['csdn', /(^|\.)csdn\.net$/],
  ['zhihu', /(^|\.)zhihu\.com$/],
  ['juejin', /(^|\.)juejin\.(cn|im)$/],
  ['v2ex', /(^|\.)v2ex\.com$/],
  ['linuxdo', /(^|\.)linux\.do$/],
  ['sspai', /(^|\.)sspai\.com$/],
  ['xiaohongshu', /(^|\.)(xiaohongshu\.com|xhslink\.com)$/],
  ['bilibili', /(^|\.)(bilibili\.com|b23\.tv)$/],
  ['douyin', /(^|\.)douyin\.com$/],
  ['weibo', /(^|\.)(weibo\.com|weibo\.cn)$/],
  ['weixin', /(^|\.)(weixin\.qq\.com|wechat\.com)$/],
  ['qq', /(^|\.)qq\.com$/],
  ['producthunt', /(^|\.)producthunt\.com$/],
  ['reddit', /(^|\.)reddit\.com$/],
  ['x', /(^|\.)(x\.com|twitter\.com|t\.co)$/],
];

/**
 * 归类访客来源。推广参数(utm_source/ref)优先;否则按来源域名归为 search:* / ref:* / site:域名;
 * 本站跳转返回 null(不记录);没有来源时 Android App 内为 android_app,其余为 direct。
 */
export function normalizeEntrySource({ referrer, campaign, userAgent, ownHost } = {}) {
  const tag = String(campaign || '')
    .trim()
    .toLowerCase();
  if (/^[a-z0-9][a-z0-9_.-]{0,31}$/.test(tag)) return `utm:${tag}`;
  const host = String(referrer || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host) return /LightNoteAndroid\//.test(String(userAgent || '')) ? 'android_app' : 'direct';
  if (!/^[a-z0-9.-]{1,253}$/.test(host)) return 'site:invalid';
  const bare = host.replace(/^www\./, '');
  const own = String(ownHost || '')
    .toLowerCase()
    .replace(/^www\./, '');
  if (own && (bare === own || bare.endsWith(`.${own}`))) return null;
  for (const [name, pattern] of SEARCH_ENGINES) if (pattern.test(bare)) return `search:${name}`;
  for (const [name, pattern] of REFERRAL_SITES) if (pattern.test(bare)) return `ref:${name}`;
  return `site:${bare}`.slice(0, 64);
}

/**
 * 记录游客转化漏斗事件(旁路、fire-and-forget,绝不阻塞/抛错影响主流程)。
 * 事件枚举:page_view / wall_hit(撞写操作墙) / cta_click(点立即注册) / register(注册成功) / share_view(分享页曝光) / share_cta_click(分享页点注册)。
 * @param {object} req Express 请求(读 req.user 与 fingerprint 头)
 * @param {string} event 事件名
 * @param {string} [context] 上下文(如撞墙的接口路径、CTA 来源)
 */
export const recordConversionEvent = (req, event, context = '', overrides = {}) => {
  try {
    if (req?.suppressConversionTracking || req?.adminContext) return;
    const userId = overrides.userId ?? (req?.user?.id || null);
    const visitorType = overrides.visitorType ?? (req?.user?.role || 'visitor');
    const fingerprint = String(req?.headers?.['fingerprint'] || '').slice(0, 128);
    const ip = String(clientIp(req) || '').slice(0, 64);
    if (isSelfTraffic(req)) return; // 本地/回环 或 自己人设备(指纹白名单)不计入转化漏斗
    pool
      .query(
        'INSERT INTO conversion_events (fingerprint, user_id, visitor_type, event, context, ip) VALUES (?,?,?,?,?,?)',
        [fingerprint, userId, visitorType, String(event || '').slice(0, 64), String(context || '').slice(0, 255), ip],
      )
      .catch((e) => console.error('[conversion] 写入失败:', e.message));
  } catch (e) {
    console.error('[conversion] 异常:', e.message);
  }
};

// 激活里程碑:用户「首次自建资源」(书签/笔记/文件),每人只记一次。
// 注册时的示例数据走直插、不经过这些 handler,故首次调用即真实自建;仅登录用户触发,不走游客白名单接口,由 handler 直接调用。
export const recordFirstOwnResource = async (req, type) => {
  try {
    if (req?.suppressConversionTracking || req?.adminContext) return;
    const userId = req?.user?.id;
    if (!userId) return;
    const [rows] = await pool.query(
      "SELECT 1 FROM conversion_events WHERE user_id = ? AND event = 'first_own_resource' LIMIT 1",
      [userId],
    );
    if (rows.length) return; // 已激活过,不重复记
    recordConversionEvent(req, 'first_own_resource', String(type || ''));
  } catch (e) {
    console.error('[conversion] first_own_resource 失败:', e.message);
  }
};
