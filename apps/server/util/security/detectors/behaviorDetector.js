import { SECURITY_CONFIG } from '../rules.js';
import { addWindowEvent, countWindowEvents, uniqueWindowValues } from '../services/windowStore.js';
import { truncateText } from '../payloadSanitizer.js';

const evidence = ({ code, name, attackType, severity, scoreDelta, confidence, field, value, message }) => ({
  ruleCode: code,
  ruleName: name,
  detector: 'behavior',
  attackType,
  severity,
  matchedField: field,
  matchedValuePreview: truncateText(value),
  evidenceMessage: message,
  scoreDelta,
  confidence,
});

const PUBLIC_SEO_READ_PATH = /^\/(?:sitemap\.xml|helpCenter(?:\/[^/]+)?)\/?$/;

export const isPublicSeoReadRequest = (context = {}) =>
  ['GET', 'HEAD'].includes(String(context.method || '').toUpperCase()) &&
  PUBLIC_SEO_READ_PATH.test(String(context.path || ''));

// 同一路由里的资源 ID 不是“不同接口”。不归一化会把正常列表进入详情、头像和图片请求
// 当成几十条不同路径，移动端首屏很容易刚好在阈值 40 后被记成“41 个不同路径”。
export const normalizeBehaviorPath = (value = '') =>
  String(value || '')
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .replace(/\/[0-9a-f]{24,}(?=\/|$)/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');

export const detectRequestBehavior = (context) => {
  // sitemap 会引导爬虫连续读取全部公开帮助文章。这里仅跳过这些只读页面的
  // 高频/路径枚举统计，避免正常收录被误判为 API 枚举；签名检测、404 扫描
  // 检测和 express-rate-limit 全局限流仍在其他层继续生效。
  if (isPublicSeoReadRequest(context)) {
    return {
      evidence: [],
      metrics: {
        requestCount1m: 0,
        uniquePathCount1m: 0,
      },
    };
  }

  const ip = context.sourceIp || 'unknown';
  const normalizedPath = normalizeBehaviorPath(context.path);
  addWindowEvent(`req:${ip}`, { path: normalizedPath }, 60 * 1000);
  addWindowEvent(`path:${ip}`, { path: normalizedPath }, 60 * 1000);

  const requestCount1m = countWindowEvents(`req:${ip}`, 60 * 1000);
  const uniquePathCount1m = uniqueWindowValues(`path:${ip}`, 'path', 60 * 1000);
  // 已认证网页会并发加载导航角标、资料统计、通知、成长等多个正常端点，使用与匿名探测器相同的
  // 40 路径阈值会把常规首屏误报成接口枚举。登录态提高到至少 80；签名、404 和高频规则仍照常生效。
  const pathEnumerationThreshold = context.userId
    ? Math.max(80, SECURITY_CONFIG.pathEnumerationPerMinute * 2)
    : SECURITY_CONFIG.pathEnumerationPerMinute;
  const result = [];

  if (requestCount1m > SECURITY_CONFIG.highFrequencyPerMinute) {
    result.push(
      evidence({
        code: 'HIGH_FREQUENCY_REQUEST',
        name: '高频请求',
        attackType: 'FLOOD',
        severity: 'high',
        scoreDelta: 35,
        confidence: 78,
        field: 'sourceIp',
        value: ip,
        message: `同一 IP 1 分钟内请求 ${requestCount1m} 次`,
      }),
    );
  }

  // 一个滑窗只在首次越线时产一条证据，避免第 41、42、43…个请求重复堆出同类事件。
  if (uniquePathCount1m === pathEnumerationThreshold + 1) {
    result.push(
      evidence({
        code: 'API_ENUMERATION',
        name: '接口枚举',
        attackType: 'API_ENUMERATION',
        severity: 'medium',
        scoreDelta: 30,
        confidence: 76,
        field: 'sourceIp',
        value: ip,
        message: `同一 IP 1 分钟内访问 ${uniquePathCount1m} 个不同路径`,
      }),
    );
  }

  return {
    evidence: result,
    metrics: {
      requestCount1m,
      uniquePathCount1m,
    },
  };
};

export const detectResponseBehavior = (context, statusCode, responsePayload = '') => {
  const ip = context.sourceIp || 'unknown';
  const result = [];
  // 已匹配业务路由的 404 是资源缺失、过期票据或派生缩略图未生成等业务事实，不能拿来
  // 推高扫描器画像。未知路径只在滑窗首次越线时产一条证据，避免第 21、22、23…次
  // 连续落事件和重复累积风险；敏感路径探测仍由独立签名逐次识别。
  if (Number(statusCode) === 404 && context.routeMatched !== true) {
    const count404 = addWindowEvent(`404:${ip}`, { path: context.path }, 5 * 60 * 1000);
    if (count404 === SECURITY_CONFIG.scanner404FiveMinutes + 1) {
      result.push(
        evidence({
          code: 'SCANNER_404_PATTERN',
          name: '扫描器 404 模式',
          attackType: 'SCANNER',
          severity: 'medium',
          scoreDelta: 32,
          confidence: 82,
          field: 'sourceIp',
          value: ip,
          message: `同一 IP 5 分钟内产生 ${count404} 次 404`,
        }),
      );
    }
  }

  const isLogin = /\/user\/login(?:\?|$)?/i.test(context.originalUrl || context.path || '');
  const responseText = typeof responsePayload === 'string' ? responsePayload : JSON.stringify(responsePayload || {});
  if (isLogin && (Number(statusCode) === 401 || /邮箱密码错误|登录失败|password/i.test(responseText))) {
    const loginFailCount = addWindowEvent(`login-fail:${ip}`, { email: context.body?.email || '' }, 5 * 60 * 1000);
    const emailCount = uniqueWindowValues(`login-fail:${ip}`, 'email', 5 * 60 * 1000);
    if (loginFailCount >= SECURITY_CONFIG.loginFailFiveMinutes) {
      result.push(
        evidence({
          code: emailCount >= 4 ? 'CREDENTIAL_STUFFING' : 'BRUTE_FORCE',
          name: emailCount >= 4 ? '撞库或账号枚举' : '暴力破解',
          attackType: emailCount >= 4 ? 'CREDENTIAL_STUFFING' : 'BRUTE_FORCE',
          severity: 'high',
          scoreDelta: emailCount >= 4 ? 48 : 42,
          confidence: 84,
          field: 'sourceIp',
          value: ip,
          message: `同一 IP 5 分钟内登录失败 ${loginFailCount} 次，涉及 ${emailCount} 个账号`,
        }),
      );
    }
  }
  return result;
};
