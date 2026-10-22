import { huaweiReceiptTokenHash } from './huaweiPushReceiptPolicy.js';

export async function beginHuaweiPushAttempt(db, id, job, subscription, category, notificationType) {
  await db.query(
    `INSERT INTO huawei_push_delivery_attempts
     (id,job_id,subscription_id,generation,endpoint_hash,notification_type,category) VALUES (?,?,?,?,?,?,?)`,
    [
      id,
      job.id,
      subscription.id,
      subscription.generation,
      huaweiReceiptTokenHash(subscription.endpoint.slice(7)),
      notificationType,
      category,
    ],
  );
}

export async function finishHuaweiPushAttempt(db, id, status, code, requestId = null) {
  const providerId = typeof requestId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(requestId) ? requestId : null;
  await db.query(
    `UPDATE huawei_push_delivery_attempts SET send_status=?,send_code=?,
     provider_request_id=COALESCE(provider_request_id,?),accepted_at=IF(?='accepted',CURRENT_TIMESTAMP(6),accepted_at)
     WHERE id=?`,
    [status, code, providerId, status, id],
  );
}

// Persist the original provider facts independently of queue acceptance. A receipt
// may arrive before the HTTP response, more than once, or after a token rotation.
export async function recordHuaweiReceipts(db, receipts) {
  if (!receipts.length) return { recorded: 0, ignored: 0 };
  const conn = await db.getConnection();
  let recorded = 0,
    ignored = 0;
  try {
    await conn.beginTransaction();
    for (const receipt of [...receipts].sort((a, b) => a.attemptId.localeCompare(b.attemptId))) {
      const [[attempt]] = await conn.query('SELECT * FROM huawei_push_delivery_attempts WHERE id=? FOR UPDATE', [
        receipt.attemptId,
      ]);
      if (
        !attempt ||
        attempt.endpoint_hash !== receipt.tokenHash ||
        (attempt.provider_request_id && attempt.provider_request_id !== receipt.requestId)
      ) {
        ignored++;
        continue;
      }
      const [insert] = await conn.query(
        `INSERT IGNORE INTO huawei_push_delivery_receipts
         (id,attempt_id,provider_request_id,result,sub_status,provider_timestamp) VALUES (?,?,?,?,?,?)`,
        [receipt.id, receipt.attemptId, receipt.requestId, receipt.result, receipt.subStatus, receipt.timestamp],
      );
      if (!insert.affectedRows) continue;
      recorded++;
      const time = new Date(receipt.timestamp);
      await conn.query(
        `UPDATE huawei_push_delivery_attempts SET provider_request_id=COALESCE(provider_request_id,?),
         receipt_result=IF(receipt_at IS NULL OR receipt_at<=?, ?,receipt_result),
         receipt_sub_status=IF(receipt_at IS NULL OR receipt_at<=?, ?,receipt_sub_status),
         receipt_at=IF(receipt_at IS NULL OR receipt_at<=?, ?,receipt_at),
         delivered_at=IF(?=0,COALESCE(delivered_at,?),delivered_at) WHERE id=?`,
        [
          receipt.requestId,
          time,
          receipt.result,
          time,
          receipt.subStatus,
          time,
          time,
          receipt.result,
          time,
          receipt.attemptId,
        ],
      );
      const invalid = [2, 5].includes(receipt.result) || (receipt.result === 201 && [2, 5].includes(receipt.subStatus));
      if (invalid) {
        // A late receipt is never allowed to invalidate a newer binding generation.
        await conn.query(
          'UPDATE browser_push_subscriptions SET active=3 WHERE id=? AND generation=? AND endpoint_hash=?',
          [attempt.subscription_id, attempt.generation, attempt.endpoint_hash],
        );
        await conn.query(
          "UPDATE browser_push_jobs SET status='cancelled' WHERE subscription_id=? AND generation=? AND status IN ('pending','sending')",
          [attempt.subscription_id, attempt.generation],
        );
      }
    }
    await conn.commit();
    return { recorded, ignored };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
