// Always use a SELECT-only connection, including when invoked on production.
process.env.ALLOW_REMOTE_DATABASE_READS = 'true';
process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
const { default: pool } = await import('../db/index.js');
const { huaweiReceiptMeaning } = await import('../util/huaweiPushReceiptPolicy.js');

try {
  const notificationId = process.argv.find((arg) => arg.startsWith('--notification-id='))?.slice(18);
  if (notificationId && !/^[a-f\d-]{36}$/i.test(notificationId)) throw new Error('HUAWEI_DELIVERY_QUERY_INVALID');
  const [rows] = await pool.query(
    `SELECT a.category,a.notification_type,a.send_status,a.receipt_result,a.receipt_sub_status,
       COUNT(*) total,SUM(a.delivered_at IS NOT NULL) delivered,
       DATE_FORMAT(MAX(a.created_at),'%Y-%m-%d %H:%i:%s') latest_attempt_at
     FROM huawei_push_delivery_attempts a
     ${notificationId ? 'JOIN browser_push_jobs j ON j.id=a.job_id' : ''}
     WHERE a.created_at>DATE_SUB(NOW(),INTERVAL 24 HOUR)
     ${notificationId ? 'AND j.notification_id=?' : ''}
     GROUP BY a.category,a.notification_type,a.send_status,a.receipt_result,a.receipt_sub_status`,
    notificationId ? [notificationId] : [],
  );
  console.log(
    JSON.stringify({
      rows: rows.map((row) => ({
        ...row,
        receipt_reason:
          row.receipt_result === null
            ? 'awaiting_receipt'
            : huaweiReceiptMeaning(row.receipt_result, row.receipt_sub_status),
      })),
    }),
  );
} catch (error) {
  console.error(
    '[huawei-push-delivery] code=%s',
    /^[A-Z_0-9]+$/.test(error?.code || '') ? error.code : 'HUAWEI_DELIVERY_QUERY_FAILED',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
