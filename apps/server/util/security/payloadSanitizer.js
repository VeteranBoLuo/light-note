import { SECURITY_CONFIG, SENSITIVE_KEYS } from './rules.js';

const isSensitiveKey = (key = '') => SENSITIVE_KEYS.some((rule) => rule.test(String(key)));

export const truncateText = (value, limit = SECURITY_CONFIG.maxPreviewLength) => {
  const text = String(value ?? '');
  return text.length > limit ? text.slice(0, limit) + '...' : text;
};

export const sanitizeValue = (key, value, depth = 0) => {
  if (isSensitiveKey(key)) {
    return value ? '******' : value;
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (depth > 5) {
    return '[深层对象已截断]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(key, item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.entries(value).reduce((result, [childKey, childValue]) => {
      result[childKey] = sanitizeValue(childKey, childValue, depth + 1);
      return result;
    }, {});
  }
  return truncateText(value, SECURITY_CONFIG.maxPreviewLength);
};

export const sanitizeObject = (input = {}) => {
  if (!input || typeof input !== 'object') {
    return input;
  }
  return sanitizeValue('', input);
};

export const flattenObject = (input = {}, prefix = '', output = [], depth = 0) => {
  if (!input || typeof input !== 'object' || depth > 5) {
    return output;
  }
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isSensitiveKey(key)) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        value.slice(0, 20).forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            flattenObject(item, `${path}[${index}]`, output, depth + 1);
          } else {
            output.push({ field: `${path}[${index}]`, value: truncateText(item, SECURITY_CONFIG.maxPreviewLength) });
          }
        });
      } else {
        flattenObject(value, path, output, depth + 1);
      }
      continue;
    }
    output.push({ field: path, value: truncateText(value, SECURITY_CONFIG.maxPreviewLength) });
    if (output.length >= 80) {
      return output;
    }
  }
  return output;
};

export const safeJsonStringify = (value, fallback = '{}') => {
  try {
    const json = JSON.stringify(value ?? {});
    if (json.length > SECURITY_CONFIG.maxPayloadLength) {
      return json.slice(0, SECURITY_CONFIG.maxPayloadLength) + '...';
    }
    return json;
  } catch (e) {
    return fallback;
  }
};
