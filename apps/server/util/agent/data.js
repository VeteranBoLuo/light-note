import crypto from 'crypto';

function transformKeys(input, keyTransform) {
  if (input instanceof Date) return input;
  if (Array.isArray(input)) return input.map((item) => transformKeys(item, keyTransform));
  if (!input || typeof input !== 'object') return input;
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [keyTransform(key), transformKeys(value, keyTransform)]),
  );
}

const toSnakeKey = (key) => key.replace(/([A-Z])/g, (_, char) => `_${char.toLowerCase()}`);
const toCamelKey = (key) => key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());

export const snakeCaseKeys = (input) => transformKeys(input, toSnakeKey);
export const camelCaseKeys = (input) => transformKeys(input, toCamelKey);

export function generateUUID() {
  return crypto.randomUUID();
}

export function insertData(params) {
  return snakeCaseKeys({ id: params?.id || generateUUID(), ...params });
}

export function resultData(data = null, status = 200, msg = '') {
  return { data: camelCaseKeys(data), status, msg };
}
