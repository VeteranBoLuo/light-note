import pool from '../../db/index.js';
import { PointsEconomyError } from '../pointsEconomyOperations.js';

const KINDS = ['all', 'points', 'ai_pack', 'card', 'storage'];
const SOURCES = {
  lottery_free: 'lottery_free',
  lottery_paid: 'lottery_paid',
  lottery_win: 'lottery',
  lottery_free_win: 'lottery_free',
  lottery_paid_win: 'lottery_paid',
  lottery_compensation: 'lottery',
  lottery_paid_compensation: 'lottery_paid',
  checkin: 'checkin',
  streak_milestone: 'streak_milestone',
  level_up: 'level_up',
  achievement: 'achievement',
  quest: 'task',
  weekly: 'weekly',
  admin: 'admin',
  campaign: 'campaign',
  support_campaign: 'campaign',
  points_shop: 'shop',
  support_package: 'purchase',
  support: 'support',
  legacy_item: 'legacy_item',
};
const json = (column, path) => `JSON_UNQUOTE(JSON_EXTRACT(${column}, '${path}'))`;
const numericId = (column, prefix) => `CONCAT('${prefix}', LPAD(CAST(${column} AS CHAR), 20, '0'))`;
const beforeVersion = (column) => `COALESCE(${json(column, '$.acquisitionVersion')}, '0') <> '1'`;
const positiveInteger = (value) => `(${value} REGEXP '^[1-9][0-9]{0,15}$'
  AND CAST(${value} AS DECIMAL(20,0)) <= 9007199254740991)`;

function invalidQuery() {
  return new PointsEconomyError('INVALID_ACQUISITION_QUERY', '获得记录筛选无效，请重新打开记录');
}
function decodeCursor(value, kind) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 300 || !/^[\w-]+$/.test(value)) throw invalidQuery();
  try {
    const data = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      data.kind !== kind ||
      !/^[a-z][a-z0-9-]{1,80}$/.test(data.key) ||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.time)
    )
      throw invalidQuery();
    return data;
  } catch {
    throw invalidQuery();
  }
}

// 只汇总实际入账：积分流水、AI credit、带数量快照的非积分审计，以及可证实的旧收据。
// 各分支独立按账号、游标和硬 LIMIT 读取；不从当前库存、奖励配置或初始化余额推算历史。
export async function getInventoryAcquisitions(userId, { kind = 'all', limit = 20, cursor = null } = {}) {
  if (!KINDS.includes(kind)) throw invalidQuery();
  const position = decodeCursor(cursor, kind);
  const size = Math.min(50, Math.max(1, Math.trunc(Number(limit) || 20)));
  if (!userId || userId === 'visitor') return { rows: [], hasMore: false, nextCursor: null };
  const branches = [],
    params = [];
  function add({ from, owner, time, key, order, asset, amount, source, where }) {
    let seek = '';
    params.push(userId);
    if (position) {
      seek = `AND (${time} < ? OR (${time} = ? AND ${key} < ?))`;
      params.push(position.time, position.time, position.key);
    }
    const filter = kind === 'all' ? '' : `AND ${asset} = '${kind}'`;
    branches.push(`(SELECT CAST(${key} AS CHAR CHARACTER SET ascii) COLLATE ascii_bin AS sort_key,
      ${time} AS created_at, DATE_FORMAT(${time}, '%Y-%m-%d %H:%i:%s') AS cursor_time,
      ${asset} AS kind, ${amount} AS amount, ${source} AS source_type
      FROM ${from} WHERE ${owner} = ? AND ${where} ${filter} ${seek}
      ORDER BY ${time} DESC, ${order} LIMIT ${size + 1})`);
  }
  if (kind === 'all' || kind === 'points')
    add({
      from: 'points_log p',
      owner: 'p.user_id',
      time: 'p.create_time',
      key: numericId('p.id', 'p'),
      order: 'p.id DESC',
      asset: "'points'",
      amount: 'p.delta',
      source: 'p.reason',
      where: "p.delta > 0 AND p.reason NOT IN ('ach_unlock', 'correction')",
    });
  if (kind === 'all' || kind === 'ai_pack')
    add({
      from: 'ai_bonus_ledger a',
      owner: 'a.user_id',
      time: 'a.create_time',
      key: "CONCAT('a', a.id)",
      order: 'a.id DESC',
      asset: "'ai_pack'",
      amount: 'a.amount_tokens',
      source: 'a.source_type',
      where:
        "a.entry_type = 'credit' AND a.amount_tokens > 0 AND a.source_type NOT IN ('legacy_baseline', 'legacy_reconciliation', 'ai_usage_refund')",
    });
  if (kind === 'all' || ['card', 'storage'].includes(kind)) {
    const asset = `CASE ${json('p.meta', '$.assetType')} WHEN 'makeup_card' THEN 'card' ELSE 'storage' END`;
    const amount = `CAST(${json('p.meta', '$.assetAmount')} AS UNSIGNED)`;
    add({
      from: 'points_log p',
      owner: 'p.user_id',
      time: 'p.create_time',
      key: numericId('p.id', 'p'),
      order: 'p.id DESC',
      asset,
      amount,
      source: json('p.meta', '$.sourceType'),
      where: `p.delta = 0 AND ${json('p.meta', '$.acquisitionVersion')} = '1'
        AND ${json('p.meta', '$.assetType')} IN ('makeup_card', 'storage_mb')
        AND ${positiveInteger(json('p.meta', '$.assetAmount'))}`,
    });
    // 老抽奖收据只取实际非积分/非 AI 奖励；这两种已有各自权威账本，避免重复。
    const prize = (field) => `JSON_UNQUOTE(JSON_EXTRACT(e.result_json, CONCAT('$.results[', n.i, '].${field}')))`;
    add({
      from: `points_economy_operations e JOIN
        (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
         UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) n`,
      owner: 'e.user_id',
      time: 'e.create_time',
      key: `CONCAT(${numericId('e.id', 'e')}, LPAD(n.i, 2, '0'))`,
      order: 'e.id DESC, n.i DESC',
      asset: prize('kind'),
      amount: `CAST(${prize('amount')} AS UNSIGNED)`,
      source: 'e.operation_type',
      where: `e.status = 'succeeded' AND e.operation_type IN ('lottery_free', 'lottery_paid')
        AND ${json('e.result_json', '$.ok')} = 'true' AND ${beforeVersion('e.result_json')}
        AND JSON_LENGTH(JSON_EXTRACT(e.result_json, '$.results')) IN (1, 10)
        AND ${prize('kind')} IN ('card', 'storage') AND ${positiveInteger(prize('amount'))}`,
    });
    const effect = json('e.result_json', '$.effect.type');
    const shopKind = `CASE ${effect} WHEN 'makeup_card' THEN 'card' ELSE 'storage' END`;
    const shopAmount = `CAST(CASE ${effect} WHEN 'makeup_card' THEN ${json('e.result_json', '$.effect.amount')}
      ELSE ${json('e.result_json', '$.effect.amountMb')} END AS UNSIGNED)`;
    const rawShopAmount = `CASE ${effect} WHEN 'makeup_card' THEN ${json('e.result_json', '$.effect.amount')}
      ELSE ${json('e.result_json', '$.effect.amountMb')} END`;
    add({
      from: 'points_economy_operations e',
      owner: 'e.user_id',
      time: 'e.create_time',
      key: numericId('e.id', 's'),
      order: 'e.id DESC',
      asset: shopKind,
      amount: shopAmount,
      source: "'points_shop'",
      where: `e.status = 'succeeded' AND e.operation_type = 'shop_buy' AND ${beforeVersion('e.result_json')}
        AND ${json('e.result_json', '$.ok')} = 'true' AND ${effect} IN ('makeup_card', 'storage')
        AND ${positiveInteger(`(${rawShopAmount})`)}`,
    });
    // 旧 Root 终态审计确实保存了实际增量；仅提取数量，不把备注、工单、操作者等投影给用户。
    for (const [assetKind, field] of [
      ['card', 'cardsDelta'],
      ['storage', 'storageMbDelta'],
    ]) {
      if (kind !== 'all' && kind !== assetKind) continue;
      const amount = `CAST(${json('d.metadata', `$.${field}`)} AS SIGNED)`;
      add({
        from: 'admin_operation_audit d',
        owner: 'd.target_id',
        time: 'd.create_time',
        key: `CONCAT('${assetKind === 'card' ? 'd' : 't'}', d.id)`,
        order: 'd.id DESC',
        asset: `'${assetKind}'`,
        amount,
        source: "'admin'",
        where: `d.target_type IN ('user_growth', 'points') AND d.action IN ('growth.adjust', 'growth.grant_points')
          AND d.outcome = 'succeeded' AND ${beforeVersion('d.metadata')}
          AND COALESCE(${json('d.metadata', '$.idempotentReplay')}, 'false') <> 'true'
          AND ${positiveInteger(json('d.metadata', `$.${field}`))}`,
      });
    }
    if (kind === 'all' || kind === 'storage')
      add({
        from: `points_log p JOIN support_entitlement_grants g
        ON g.user_id = p.user_id AND BINARY g.storage_log_ref = BINARY p.ref`,
        owner: 'p.user_id',
        time: 'p.create_time',
        key: numericId('p.id', 'p'),
        order: 'p.id DESC',
        asset: "'storage'",
        amount: 'g.granted_storage_mb',
        source: "CASE WHEN g.entitlement_type = 'campaign' THEN 'support_campaign' ELSE 'support_package' END",
        where: `p.reason IN ('storage:support_package', 'storage:support_campaign')
        AND ${beforeVersion('p.meta')} AND g.credited_at IS NOT NULL AND g.granted_storage_mb > 0`,
      });
  }
  const [records] = await pool.query(
    `SELECT * FROM (${branches.join(' UNION ALL ')}) acquisitions
     ORDER BY created_at DESC, sort_key DESC LIMIT ${size + 1}`,
    params,
  );
  const hasMore = records.length > size;
  const page = records.slice(0, size);
  const last = page.at(-1);
  return {
    rows: page.map((row) => {
      const amount = Number(row.amount);
      if (!Number.isSafeInteger(amount) || amount <= 0 || !KINDS.includes(row.kind) || row.kind === 'all') {
        throw new Error('ACQUISITION_RECEIPT_INVALID');
      }
      return {
        id: row.sort_key,
        source: Object.hasOwn(SOURCES, row.source_type) ? SOURCES[row.source_type] : 'other',
        createdAt: row.created_at,
        results: [{ id: row.sort_key, kind: row.kind, amount, name: '' }],
      };
    }),
    hasMore,
    nextCursor: hasMore
      ? Buffer.from(JSON.stringify({ time: last.cursor_time, key: last.sort_key, kind })).toString('base64url')
      : null,
  };
}
