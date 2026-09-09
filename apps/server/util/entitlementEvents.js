import pool from '../db/index.js';
import { recordServerOperation } from './operationLog.js';
import { isSelfTraffic } from './logExclude.js';
import { levelForExp } from './growth.js';
const EVENTS = new Set(['quota_insufficient', 'enter_points', 'enter_store', 'select_item', 'return_task']);
const SOURCES = new Set([
  'ai',
  'organize',
  'bookmark',
  'note',
  'cloudSpace',
  'resourceCenter',
  'aiUsage',
  'growth',
  'store',
  'other',
]);
export function normalizeEntitlementEvent(input = {}, server = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (!EVENTS.has(input.event) && !(server && input.event === 'checkout_created')) return null;
  const flowId = /^[a-f0-9-]{36}$/.test(typeof input.flowId === 'string' ? input.flowId : '')
    ? input.flowId
    : undefined;
  const skuId = /^[A-Za-z0-9_-]{3,64}$/.test(typeof input.skuId === 'string' ? input.skuId : '')
    ? input.skuId
    : undefined;
  return {
    event: input.event,
    flowId,
    skuId,
    source: SOURCES.has(input.source)
      ? input.source
      : [...SOURCES].find((source) =>
          (typeof input.source === 'string' ? input.source : '').split(/[._-]/).includes(source),
        ) || 'other',
    asset: ['ai', 'storage', 'combo'].includes(input.asset) ? input.asset : undefined,
  };
}
export async function recordEntitlementEvent(req, input, { server = false, intentId } = {}) {
  const event = normalizeEntitlementEvent(input, server);
  if (!event || !req.user?.id || req.isAdminPreview || isSelfTraffic(req)) return false;
  try {
    const [rows] = await pool.query('SELECT exp FROM user_growth WHERE user_id = ? LIMIT 1', [req.user.id]);
    // Compact ASCII payload fits the existing operation column; no prompt, URL or resource identifiers.
    return await recordServerOperation(req, {
      module: 'entitlement_funnel',
      operation: JSON.stringify({
        e: event.event,
        f: event.flowId,
        k: event.skuId,
        s: event.source,
        a: event.asset,
        l: levelForExp(Number(rows[0]?.exp || 0)),
        ...(intentId ? { i: intentId } : {}),
      }),
    });
  } catch {
    return false;
  } // Telemetry must never fail payment or a user action.
}
