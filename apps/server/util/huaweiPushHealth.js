import { huaweiPushEnabled } from './huaweiPushPolicy.js';
import { huaweiReceiptConfig } from './huaweiPushReceiptPolicy.js';

export function deriveHuaweiReceiptCheck(snapshot, configured = true) {
  const accepted = Number(snapshot?.accepted);
  const receipts = Number(snapshot?.receipts);
  const known =
    Number.isSafeInteger(accepted) &&
    accepted >= 0 &&
    Number.isSafeInteger(receipts) &&
    receipts >= 0 &&
    receipts <= accepted;
  const state = !configured ? 'fail' : !known ? 'unknown' : receipts > 0 ? 'pass' : accepted >= 5 ? 'fail' : 'unknown';
  return {
    id: 'services.huaweiReceipts',
    domain: 'services',
    severity: 'high',
    state,
    evidence: { configured, accepted: known ? accepted : null, receipts: known ? receipts : null },
    target: { module: 'services', serviceId: 'lightnote-browser-push-worker' },
  };
}

// Read-only, bounded by the existing creation-time index. Console test samples never
// enter delivery_attempts; only authenticated, matched business receipts count here.
export async function loadHuaweiReceiptCheck({ db, env = process.env } = {}) {
  if (!huaweiPushEnabled(env)) return null;
  try {
    if (!huaweiReceiptConfig(env)) return deriveHuaweiReceiptCheck(null, false);
  } catch {
    return deriveHuaweiReceiptCheck(null, false);
  }
  try {
    const connection = db || (await import('../db/index.js')).default;
    const [[snapshot]] =
      await connection.query(`SELECT COUNT(*) AS accepted, COALESCE(SUM(receipt_at IS NOT NULL),0) AS receipts
      FROM huawei_push_delivery_attempts WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      AND accepted_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE) AND send_status='accepted'`);
    return deriveHuaweiReceiptCheck(snapshot);
  } catch {
    return deriveHuaweiReceiptCheck(null);
  }
}
