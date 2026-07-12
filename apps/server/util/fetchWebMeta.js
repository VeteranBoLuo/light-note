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
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { lookup as dnsLookup } from 'node:dns';

const FETCH_TIMEOUT = 8000; // 8s：服务器 1 核，不宜久等
const LIVENESS_TIMEOUT = 12000; // 死活探测用更宽松超时:宁可慢也别误判成死链
const MAX_CONTENT_BYTES = 1.5 * 1024 * 1024; // 最多读 1.5MB HTML，避免大页面吃内存
const MAX_REDIRECTS = 3;
const BODY_TEXT_LIMIT = 2000; // 正文摘录上限，够 LLM 判断即可，避免 prompt 过长
const UA = 'Mozilla/5.0 (compatible; LightNoteBot/1.0; +https://boluo66.top)';
// 探活用浏览器 UA:尽量拿到真实状态码(反爬站也常返回 403 而非拒连,便于判定"活着只是被拦")
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** 判断 IPv4/IPv6 是否属于内网或保留网段（SSRF 防护） */
function isPrivateIp(ip) {
  const type = net.isIP(ip);
  if (type === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0) return true; // 0.0.0.0/8
    if (p[0] === 10) return true; // 10.0.0.0/8
    if (p[0] === 127) return true; // 127.0.0.0/8 loopback
    if (p[0] === 169 && p[1] === 254) return true; // 169.254.0.0/16 link-local（含云元数据）
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // 172.16.0.0/12
    if (p[0] === 192 && p[1] === 168) return true; // 192.168.0.0/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // 100.64.0.0/10 CGNAT
    return false;
  }
  if (type === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true; // loopback / 未指定
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // fc00::/7 ULA
    if (v.startsWith('fe80')) return true; // link-local
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/); // IPv4-mapped
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return false;
}

/**
 * 自定义 DNS lookup：解析后若命中内网 IP 直接报错阻断连接。
 * 挂到 http/https Agent 上，对初始请求与每次重定向都生效。
 */
function guardedLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  dnsLookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    const list = Array.isArray(address) ? address : [{ address, family }];
    for (const item of list) {
      if (isPrivateIp(item.address)) {
        return callback(new Error('BLOCKED_PRIVATE_IP'));
      }
    }
    callback(null, address, family);
  });
}

const httpAgent = new http.Agent({ lookup: guardedLookup });
const httpsAgent = new https.Agent({ lookup: guardedLookup });

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

/** 去脚本/样式/标签，得到正文纯文本（截断） */
function extractBodyText(html, limit = BODY_TEXT_LIMIT) {
  let s = html
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/i, ' ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s).replace(/\s+/g, ' ').trim();
  return s.slice(0, limit);
}

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
 * 失败时返回 { ok:false, reason }，由调用方决定降级（例如仅凭 URL 生成）。
 *
 * @param {string} rawUrl 用户填写的书签地址
 * @returns {Promise<
 *   | { ok: true, url: string, title: string, description: string, siteName: string, keywords: string, bodyText: string }
 *   | { ok: false, reason: string }
 * >}
 */
export async function fetchWebMeta(rawUrl, { bodyLimit = BODY_TEXT_LIMIT } = {}) {
  // 归一化:无协议头补 https://(与 read_url 一致)。老书签/导入的 URL 常不带协议,
  // 不补会直接 new URL() 抛错 → INVALID_URL,导致归档失败/死链误报。
  let input = String(rawUrl || '').trim();
  if (input && !/^https?:\/\//i.test(input)) input = 'https://' + input;
  let target;
  try {
    target = new URL(input);
  } catch {
    return { ok: false, reason: 'INVALID_URL' };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { ok: false, reason: 'UNSUPPORTED_PROTOCOL' };
  }
  // 字面 IP 形式的 host 先同步预判（域名解析与重定向的内网阻断交给 guardedLookup）。
  // IPv6 字面量在 URL.hostname 里带方括号（如 [::1]），且 Node 直连字面 IP 时会跳过
  // 自定义 DNS lookup，因此这里必须剥掉方括号后同步判定，不能只依赖 guardedLookup。
  const literalHost = target.hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (net.isIP(literalHost) && isPrivateIp(literalHost)) {
    return { ok: false, reason: 'BLOCKED_HOST' };
  }

  let buf;
  let contentType = '';
  try {
    const resp = await axios.get(target.href, {
      timeout: FETCH_TIMEOUT,
      maxRedirects: MAX_REDIRECTS,
      maxContentLength: MAX_CONTENT_BYTES,
      responseType: 'arraybuffer',
      httpAgent,
      httpsAgent,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    contentType = resp.headers?.['content-type'] || '';
    // 只处理 HTML/文本，二进制（PDF/图片等）直接放弃
    if (contentType && !/text\/html|application\/xhtml|text\/plain|application\/xml/i.test(contentType)) {
      return { ok: false, reason: 'NOT_HTML' };
    }
    buf = Buffer.from(resp.data);
  } catch (e) {
    if (String(e?.message || '').includes('BLOCKED_PRIVATE_IP')) {
      return { ok: false, reason: 'BLOCKED_HOST' };
    }
    return { ok: false, reason: 'FETCH_FAILED' };
  }

  const html = decodeBuffer(buf, detectCharset(contentType, buf));

  const ogTitle = extractMeta(html, 'og:title');
  const ogDesc = extractMeta(html, 'og:description');
  const metaDesc = extractMeta(html, 'description');
  const title = extractTitle(html) || ogTitle;
  const description = metaDesc || ogDesc;
  const siteName = extractMeta(html, 'og:site_name');
  const keywords = extractMeta(html, 'keywords');
  const bodyText = extractBodyText(html, bodyLimit);

  // 什么都没抓到（SPA 空壳等）→ 视为失败，让调用方降级
  if (!title && !description && !bodyText) {
    return { ok: false, reason: 'EMPTY_CONTENT' };
  }

  return { ok: true, url: target.href, title, description, siteName, keywords, bodyText };
}

/**
 * 死活探测(死链检测用)。返回 { status, code }:
 *  - 'dead':仅当明确 404 / 410(页面被删/永久移除)
 *  - 'alive':2xx/3xx,以及 403/429/412/400/5xx 等(站点存在,只是反爬/限流/临时错,不算失效)
 *  - 'unknown':超时 / 连接错 / 无效 URL(拿不到确切结论,不判死,避免误报)
 *  - 'skip':内网/被 SSRF 拦截
 * 用流式请求:拿到响应头(状态码)即丢弃响应体,不下载正文,更快、更省、更不易在并发下超时。
 * 复用与 fetchWebMeta 相同的 guardedLookup agents 做 SSRF 防护。
 */
export async function checkUrlLiveness(rawUrl) {
  let input = String(rawUrl || '').trim();
  if (!input) return { status: 'unknown', code: 'EMPTY' };
  if (!/^https?:\/\//i.test(input)) input = 'https://' + input;
  let target;
  try {
    target = new URL(input);
  } catch {
    return { status: 'unknown', code: 'INVALID_URL' };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return { status: 'unknown', code: 'PROTO' };
  const literalHost = target.hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (net.isIP(literalHost) && isPrivateIp(literalHost)) return { status: 'skip', code: 'BLOCKED' };
  try {
    const resp = await axios.get(target.href, {
      timeout: LIVENESS_TIMEOUT,
      maxRedirects: MAX_REDIRECTS,
      validateStatus: () => true, // 接受所有状态码,自行按 code 判定
      httpAgent,
      httpsAgent,
      responseType: 'stream',
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    });
    const code = resp.status;
    resp.data?.destroy?.(); // 拿到状态码即丢弃响应体,不下载
    if (code === 404 || code === 410) return { status: 'dead', code };
    return { status: 'alive', code };
  } catch (e) {
    if (String(e?.message || '').includes('BLOCKED_PRIVATE_IP')) return { status: 'skip', code: 'BLOCKED' };
    return { status: 'unknown', code: e?.code || 'ERR' }; // 超时/网络错 → 未知,绝不判死
  }
}
