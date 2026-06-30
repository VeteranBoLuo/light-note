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

export const detectRequestBehavior = (context) => {
  const ip = context.sourceIp || 'unknown';
  addWindowEvent(`req:${ip}`, { path: context.path }, 60 * 1000);
  addWindowEvent(`path:${ip}`, { path: context.path }, 60 * 1000);

  const requestCount1m = countWindowEvents(`req:${ip}`, 60 * 1000);
  const uniquePathCount1m = uniqueWindowValues(`path:${ip}`, 'path', 60 * 1000);
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

  if (uniquePathCount1m > SECURITY_CONFIG.pathEnumerationPerMinute) {
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
  if (Number(statusCode) === 404) {
    const count404 = addWindowEvent(`404:${ip}`, { path: context.path }, 5 * 60 * 1000);
    if (count404 > SECURITY_CONFIG.scanner404FiveMinutes) {
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
