import pool from '../db/index.js';

function quantiles(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const at = (rate) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * rate))] : 0);
  return { count: sorted.length, p50: at(0.5), p75: at(0.75), p90: at(0.9), p99: at(0.99), max: at(1) };
}

async function rows(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

async function scalar(sql, params = []) {
  const result = await rows(sql, params);
  return Number(Object.values(result[0] || {})[0] || 0);
}

const report = { generatedAt: new Date().toISOString(), scope: 'read-only aggregate audit' };
try {
  const [version] = await rows('SELECT VERSION() AS version');
  report.databaseVersion = version?.version || null;
  report.pointsLog = {
    rows: await scalar('SELECT COUNT(*) AS c FROM points_log'),
    sizeMb: Number(
      (
        await rows(
          `SELECT COALESCE((data_length + index_length) / 1024 / 1024, 0) AS mb
             FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = 'points_log'`,
        )
      )[0]?.mb || 0,
    ).toFixed(2),
  };

  const activeBalances = await rows(
    `SELECT COALESCE(g.points, 0) AS value
       FROM user u
       LEFT JOIN user_growth g ON g.user_id = u.id
      WHERE u.del_flag = 0 AND COALESCE(u.role, '') <> 'visitor'
        AND u.last_active_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)`,
  );
  report.active28dBalances = quantiles(activeBalances.map((row) => row.value));

  report.flows = {};
  for (const days of [7, 28, 90]) {
    const [flow] = await rows(
      `SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS issued,
              COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent,
              COALESCE(SUM(delta), 0) AS net,
              COUNT(*) AS entries
         FROM points_log
        WHERE create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days],
    );
    report.flows[`${days}d`] = Object.fromEntries(Object.entries(flow || {}).map(([key, value]) => [key, Number(value)]));
  }

  report.reasons90d = (await rows(
    `SELECT reason, COUNT(*) AS entries,
            COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS issued,
            COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent
       FROM points_log
      WHERE create_time >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY reason
      ORDER BY (
        COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0)
      ) DESC`,
  )).map((row) => ({ ...row, entries: Number(row.entries), issued: Number(row.issued), spent: Number(row.spent) }));

  report.purchases = (await rows(
    `SELECT ref AS itemId, COUNT(*) AS purchases, COUNT(DISTINCT user_id) AS users, COALESCE(SUM(-delta), 0) AS points
       FROM points_log WHERE reason = 'buy' GROUP BY ref ORDER BY purchases DESC`,
  )).map((row) => ({ ...row, purchases: Number(row.purchases), users: Number(row.users), points: Number(row.points) }));
  report.frameOwnership = (await rows(
    `SELECT cosmetic_id AS itemId, COUNT(*) AS owners
       FROM user_cosmetics WHERE cosmetic_id LIKE 'frame\\_%' GROUP BY cosmetic_id ORDER BY owners DESC`,
  )).map((row) => ({ ...row, owners: Number(row.owners) }));

  const activeWallets = await rows(
    `SELECT COALESCE(g.ai_bonus_tokens, 0) AS ai, COALESCE(g.storage_bonus_mb, 0) AS storage
       FROM user u JOIN user_growth g ON g.user_id = u.id
      WHERE u.del_flag = 0 AND COALESCE(u.role, '') <> 'visitor'
        AND u.last_active_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)`,
  );
  report.aiBonusTokens = quantiles(activeWallets.map((row) => row.ai));
  report.storageBonusMb = quantiles(activeWallets.map((row) => row.storage));
  report.aiUsage28d = {
    tokens: await scalar(
      `SELECT COALESCE(SUM(tokens_used), 0) AS tokens FROM ai_token_usage
        WHERE subject_type = 'user' AND period_type = 'day'
          AND period_key >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 27 DAY), '%Y%m%d')`,
    ),
    walletConsumptionMeasurable: false,
  };

  const storageUsage = await rows(
    `SELECT COALESCE(SUM(CASE WHEN f.del_flag IN (0, 1) THEN f.file_size ELSE 0 END), 0) AS bytes
       FROM user u LEFT JOIN files f ON f.create_by = u.id
      WHERE u.del_flag = 0 AND COALESCE(u.role, '') <> 'visitor'
        AND u.last_active_time >= DATE_SUB(NOW(), INTERVAL 28 DAY)
      GROUP BY u.id`,
  );
  report.storageUsedBytes = quantiles(storageUsage.map((row) => row.bytes));

  const [lottery] = await rows(
    `SELECT
       COALESCE(SUM(CASE WHEN reason = 'lottery_free' THEN 1 ELSE 0 END), 0) AS freeReceipts,
       COALESCE(SUM(CASE WHEN reason = 'lottery_cost' AND ref = 'x10' THEN 10
                         WHEN reason = 'lottery_cost' THEN 1 ELSE 0 END), 0) AS paidDraws,
       COALESCE(SUM(CASE WHEN reason IN ('lottery_win', 'lottery_compensation') THEN delta ELSE 0 END), 0) AS pointsReturned,
       COALESCE(SUM(CASE WHEN reason = 'lottery_cost' THEN -delta ELSE 0 END), 0) AS pointsSpent
     FROM points_log`,
  );
  report.legacyLottery = Object.fromEntries(
    Object.entries(lottery || {}).map(([key, value]) => [key, Number(value)]),
  );
  report.legacyLottery.prizeModeAttributionMeasurable = false;
  report.legacyLotteryRewards = (await rows(
    `SELECT reason, ref, COUNT(*) AS occurrences, COALESCE(SUM(delta), 0) AS delta
       FROM points_log WHERE reason LIKE 'lottery_%' GROUP BY reason, ref ORDER BY occurrences DESC`,
  )).map((row) => ({ ...row, occurrences: Number(row.occurrences), delta: Number(row.delta) }));

  const operationTableExists = await scalar(
    `SELECT COUNT(*) AS c FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'points_economy_operations'`,
  );
  if (operationTableExists) {
    report.versionedOperations = (await rows(
      `SELECT economy_version AS economyVersion, operation_type AS operationType, item_id AS itemId,
              COUNT(*) AS operations, COALESCE(SUM(cost_points),0) AS costPoints,
              COALESCE(SUM(points_rewarded),0) AS pointsRewarded,
              COALESCE(SUM(ai_tokens_granted),0) AS aiTokensGranted,
              COALESCE(SUM(storage_mb_granted),0) AS storageMbGranted,
              COALESCE(SUM(makeup_cards_granted),0) AS makeupCardsGranted,
              COALESCE(SUM(draw_count),0) AS drawCount, COALESCE(SUM(pity_hits),0) AS pityHits,
              COALESCE(SUM(replay_count),0) AS replays
         FROM points_economy_operations WHERE status = 'succeeded'
        GROUP BY economy_version, operation_type, item_id
        ORDER BY economy_version, operation_type, item_id`,
    )).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value])));
  } else {
    report.versionedOperations = [];
  }
} finally {
  await pool.end();
}

console.log(JSON.stringify(report, null, 2));
