import { createHash } from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => ({ ...result, [key]: canonicalize(value[key]) }), {});
  }
  return value;
}

/**
 * 积分写操作共用的稳定负载指纹。独立于余额服务，避免幂等收据与积分实现互相循环依赖。
 */
export function pointsOperationHash(payload) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}
