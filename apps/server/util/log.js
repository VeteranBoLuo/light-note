import pool from '../db/index.js';
import { resultData, formatDateTime, insertData } from './common.js';
import { isSelfTraffic } from './logExclude.js';
import { shouldSkipApiLog } from './logPolicy.js';
import { redactSensitiveText, stableAgentErrorCode } from './agent/logSafety.js';

// api_logs 落库前的敏感字段脱敏。对象键可能来自历史客户端或第三方 SDK，统一忽略分隔符比较，
// 防止 access_token / access-token / accessToken 这类变体绕过；字符串中的邮箱、URL 凭据也一并清洗。
const SENSITIVE_PAYLOAD_KEYS = new Set([
  'password',
  'oldpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'code',
  'verifycode',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'setcookie',
  'email',
  'sessionid',
  'deviceid',
  'logdeviceid',
  'fingerprint',
]);

const MAX_LOG_PAYLOAD_DEPTH = 4;
const MAX_LOG_TEXT_LENGTH = 10_000;

function normalizeSensitiveKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isSensitivePayloadKey(key) {
  return SENSITIVE_PAYLOAD_KEYS.has(normalizeSensitiveKey(key));
}

export function sanitizeSensitivePayload(value, depth = 0, seen = new WeakSet()) {
  if (typeof value === 'string') return redactSensitiveText(value, MAX_LOG_TEXT_LENGTH);
  if (value == null || typeof value !== 'object') return value;
  // 深层对象和循环引用宁可丢弃，也不能把未处理的原值带入日志。
  if (depth >= MAX_LOG_PAYLOAD_DEPTH) return '[REDACTED_DEPTH_LIMIT]';
  if (seen.has(value)) return '[REDACTED_CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeSensitivePayload(item, depth + 1, seen));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = isSensitivePayloadKey(key)
      ? val == null || val === ''
        ? val
        : '[REDACTED]'
      : sanitizeSensitivePayload(val, depth + 1, seen);
  }
  return out;
}

export function sanitizeLogUrl(value) {
  const raw = String(value || '').slice(0, MAX_LOG_TEXT_LENGTH);
  if (!raw) return '';
  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
    const url = new URL(raw, 'https://log.invalid');
    if (url.username || url.password) {
      url.username = '[REDACTED]';
      url.password = '';
    }
    for (const [key] of url.searchParams) {
      if (isSensitivePayloadKey(key)) url.searchParams.set(key, '[REDACTED]');
    }
    const sanitized = isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
    return redactSensitiveText(sanitized, MAX_LOG_TEXT_LENGTH);
  } catch {
    return redactSensitiveText(raw, MAX_LOG_TEXT_LENGTH);
  }
}

export async function logFunction(req, res, next) {
  try {
    // 管理员上下文由 admin_context_audit 统一记录 actor/subject/policy，避免混入普通用户 API 日志。
    if (req.adminContext) {
      next();
      return;
    }
    if (req.originalUrl.includes('/login')) {
      // 登录成败交给登录接口处理，日志中间件只记录请求。
    }
    const isVisitorWorkspaceWrite = Boolean(req.isVisitorWorkspaceContentWrite);
    const userId = isVisitorWorkspaceWrite ? req.adminActor?.id : req.user?.id;
    // 普通管理员预览与游客工作区只读请求不记日志；游客展示内容的实际写入必须保留审计。
    if (req.isAdminPreview && !isVisitorWorkspaceWrite) {
      next();
      return;
    }
    // 跳过无操作审计价值的系统读取接口；游客工作区真实写入始终保留审计。
    if (shouldSkipApiLog(req.originalUrl) && !isVisitorWorkspaceWrite) {
      next();
      return;
    }
    // 本地/回环 IP,或「自己人」设备(指纹白名单)——不记 API 日志
    if (!isVisitorWorkspaceWrite && isSelfTraffic(req)) {
      next();
      return;
    }
    const rawRequestPayload = sanitizeSensitivePayload(req.method === 'GET' ? req.query : req.body);
    const requestPayload = JSON.stringify(
      isVisitorWorkspaceWrite
        ? {
            payload: rawRequestPayload,
            visitorWorkspaceTargetUserId: req.user?.id || '',
          }
        : rawRequestPayload,
    );
    // 等待响应结束
    res.on('finish', async () => {
      if (userId) {
        try {
          const system = JSON.stringify({
            browser: req.headers['browser'] ?? '未知',
            os: req.headers['os'] ?? '未知',
            fingerprint: req.headers['fingerprint'],
            // finish 触发时 Express 已完成路由匹配；用于区分业务接口 4xx 与未知路径 404。
            // 不存进攻方法或原始头信息，只保存布尔分类结果。
            routeMatched: Boolean(req.route),
            ...(isVisitorWorkspaceWrite
              ? {
                  adminPreview: true,
                  targetUserId: req.user?.id || '',
                }
              : {}),
          });
          // 构造日志对象
          const log = {
            userId: userId,
            method: req.method,
            url: sanitizeLogUrl(req.originalUrl),
            req: requestPayload === '{}' ? '' : requestPayload,
            status_code: res.statusCode,
            ip: req.ip || '',
            system: system,
            del_flag: 0,
          };
          // 将日志保存到数据库
          const query = 'INSERT INTO api_logs SET ?';
          pool.query(query, [insertData(log)]).catch((err) => {
            console.error(formatDateTime(new Date()) + '日志更新 SQL 失败 code=' + stableAgentErrorCode(err));
          });
        } catch (err1) {
          console.error(formatDateTime(new Date()) + '日志更新失败 code=' + stableAgentErrorCode(err1));
        }
      }
    });
    next();
  } catch (e) {
    console.error(formatDateTime(new Date()) + '日志中间件失败 code=' + stableAgentErrorCode(e));
    res.send(resultData(null, 500, '服务器暂时无法处理，请稍后重试'));
  }
}
