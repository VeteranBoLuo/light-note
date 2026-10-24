import pool from '../../db/index.js';
import { PointsEconomyError } from '../pointsEconomyOperations.js';

const MODES = ['all', 'free', 'paid'];
const KINDS = ['points', 'ai_pack', 'storage', 'card'];

function invalidQuery() {
  return new PointsEconomyError('INVALID_LOTTERY_HISTORY_QUERY', '抽奖记录筛选无效，请重新打开记录');
}

function decodeCursor(value, mode) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 240 || !/^[\w-]+$/.test(value)) throw invalidQuery();
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      cursor.mode !== mode ||
      !/^[1-9]\d{0,19}$/.test(String(cursor.id)) ||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(cursor.time)
    )
      throw invalidQuery();
    return cursor;
  } catch {
    throw invalidQuery();
  }
}

function receiptRewards(value) {
  try {
    const receipt = typeof value === 'string' ? JSON.parse(value) : value;
    if (!receipt?.ok || !Array.isArray(receipt.results) || ![1, 10].includes(receipt.results.length)) throw new Error();
    return receipt.results.map((reward, index) => {
      if (!KINDS.includes(reward.kind) || !Number.isSafeInteger(reward.amount) || reward.amount < 0) throw new Error();
      return {
        index: index + 1,
        id: String(reward.id || ''),
        name: typeof reward.name === 'string' ? reward.name : '',
        kind: reward.kind,
        amount: reward.amount,
        rare: reward.rare === true,
        guaranteed: reward.guaranteed === true,
        compensated: reward.compensated === true,
      };
    });
  } catch {
    throw new Error('LOTTERY_HISTORY_RECEIPT_INVALID');
  }
}

// 已提交的发奖收据是历史事实；不从现奖池或拆分的积分流水猜测十连结果。
export async function getLotteryHistory(userId, { mode = 'all', limit = 20, cursor = null } = {}) {
  if (!MODES.includes(mode)) throw invalidQuery();
  const size = Math.min(50, Math.max(1, Math.trunc(Number(limit) || 20)));
  const position = decodeCursor(cursor, mode);
  if (!userId || userId === 'visitor') return { rows: [], hasMore: false, nextCursor: null };
  const types = mode === 'all' ? ['lottery_free', 'lottery_paid'] : [`lottery_${mode}`];
  const params = [userId, ...types];
  let seek = '';
  if (position) {
    seek = 'AND (create_time < ? OR (create_time = ? AND id < ?))';
    params.push(position.time, position.time, position.id);
  }
  const [records] = await pool.query(
    `SELECT CAST(id AS CHAR) AS id, operation_type, cost_points, result_json, create_time,
            DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS cursor_time
       FROM points_economy_operations
      WHERE user_id = ? AND status = 'succeeded'
        AND operation_type IN (${types.map(() => '?').join(', ')}) ${seek}
      ORDER BY create_time DESC, points_economy_operations.id DESC LIMIT ${size + 1}`,
    params,
  );
  const page = records.slice(0, size);
  const last = page.at(-1);
  const hasMore = records.length > size;
  return {
    rows: page.map((row) => ({
      id: String(row.id),
      mode: row.operation_type === 'lottery_free' ? 'free' : 'paid',
      cost: Number(row.cost_points || 0),
      createdAt: row.create_time,
      results: receiptRewards(row.result_json),
    })),
    hasMore,
    nextCursor: hasMore
      ? Buffer.from(JSON.stringify({ id: String(last.id), time: last.cursor_time, mode })).toString('base64url')
      : null,
  };
}
