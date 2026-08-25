import crypto from 'node:crypto';
import { AI_BONUS_WALLET_POLICY_VERSION } from './aiBonusWalletSchema.js';

const TOKEN_LIMIT = Number.MAX_SAFE_INTEGER;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9:_-]*$/i;

function walletError(code, message, status = 500) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizedTokens(value, field = 'amountTokens') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > TOKEN_LIMIT) {
    throw walletError('AI_BONUS_AMOUNT_INVALID', `${field} 不合法`, 400);
  }
  return amount;
}

function normalizedIdentifier(value, field, maxLength) {
  const result = String(value || '').trim();
  if (!result || result.length > maxLength || !IDENTIFIER_PATTERN.test(result)) {
    throw walletError('AI_BONUS_SOURCE_INVALID', `${field} 不合法`, 400);
  }
  return result;
}

function normalizedReference(value) {
  if (value == null || value === '') return null;
  const result = String(value).trim();
  if (!result || result.length > 191) throw walletError('AI_BONUS_SOURCE_INVALID', 'sourceRef 不合法', 400);
  return result;
}

function normalizedMutation(input) {
  const userId = String(input?.userId || '').trim();
  if (!userId || userId === 'visitor' || userId.length > 255) {
    throw walletError('AI_BONUS_USER_INVALID', '永久额度账号不合法', 400);
  }
  return {
    userId,
    amountTokens: normalizedTokens(input?.amountTokens),
    sourceType: normalizedIdentifier(input?.sourceType, 'sourceType', 48),
    sourceRef: normalizedReference(input?.sourceRef),
    idempotencyKey: normalizedIdentifier(input?.idempotencyKey, 'idempotencyKey', 255),
    policyVersion: normalizedIdentifier(input?.policyVersion || AI_BONUS_WALLET_POLICY_VERSION, 'policyVersion', 64),
  };
}

export function aiBonusIdempotencyHash(userId, idempotencyKey) {
  return crypto.createHash('sha256').update(`v1\0${userId}\0${idempotencyKey}`).digest('hex');
}

export async function lockAiBonusWallet(connection, userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId || normalizedUserId === 'visitor' || normalizedUserId.length > 255) {
    throw walletError('AI_BONUS_USER_INVALID', '永久额度账号不合法', 400);
  }
  await connection.query('INSERT IGNORE INTO user_growth (user_id) VALUES (?)', [normalizedUserId]);
  const [rows] = await connection.query('SELECT ai_bonus_tokens FROM user_growth WHERE user_id = ? FOR UPDATE', [
    normalizedUserId,
  ]);
  const balance = Number(rows[0]?.ai_bonus_tokens || 0);
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw walletError('AI_BONUS_BALANCE_INVALID', '永久额度余额异常');
  }
  return balance;
}

async function findIdempotentEntry(connection, userId, idempotencyHash) {
  const [rows] = await connection.query(
    `SELECT id, user_id, entry_type, amount_tokens, balance_after, source_type, source_ref, policy_version
       FROM ai_bonus_ledger
      WHERE idempotency_hash = ?
      LIMIT 1
      FOR UPDATE`,
    [idempotencyHash],
  );
  const entry = rows[0] || null;
  if (entry && String(entry.user_id || userId) !== userId) {
    throw walletError('AI_BONUS_IDEMPOTENCY_CONFLICT', '永久额度请求标识冲突', 409);
  }
  return entry;
}

function assertReplayMatches(entry, mutation, entryType, { allowPartial = false } = {}) {
  const replayAmount = Number(entry.amount_tokens);
  const amountMatches = allowPartial
    ? Number.isSafeInteger(replayAmount) && replayAmount >= 0 && replayAmount <= mutation.amountTokens
    : replayAmount === mutation.amountTokens;
  if (
    String(entry.entry_type) !== entryType ||
    !amountMatches ||
    String(entry.source_type) !== mutation.sourceType ||
    String(entry.source_ref || '') !== String(mutation.sourceRef || '') ||
    String(entry.policy_version) !== mutation.policyVersion
  ) {
    throw walletError('AI_BONUS_IDEMPOTENCY_CONFLICT', '永久额度请求标识已用于其他操作', 409);
  }
}

async function insertLedgerEntry(connection, mutation, entryType, balanceAfter, idempotencyHash) {
  const ledgerId = crypto.randomUUID();
  await connection.query(
    `INSERT INTO ai_bonus_ledger
      (id, user_id, entry_type, amount_tokens, balance_after, source_type, source_ref,
       idempotency_key, idempotency_hash, policy_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ledgerId,
      mutation.userId,
      entryType,
      mutation.amountTokens,
      balanceAfter,
      mutation.sourceType,
      mutation.sourceRef,
      mutation.idempotencyKey,
      idempotencyHash,
      mutation.policyVersion,
    ],
  );
  return ledgerId;
}

async function insertCreditLot(connection, mutation, ledgerId, amountTokens = mutation.amountTokens) {
  await connection.query(
    `INSERT INTO ai_bonus_lots
      (id, user_id, credit_ledger_id, source_type, source_ref, policy_version,
       original_tokens, remaining_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      mutation.userId,
      ledgerId,
      mutation.sourceType,
      mutation.sourceRef,
      mutation.policyVersion,
      amountTokens,
      amountTokens,
    ],
  );
}

/** 在调用方事务中幂等增加永久额度，并创建可追踪的来源批次。 */
export async function creditAiBonusTokens(connection, input) {
  const mutation = normalizedMutation(input);
  const balance = await lockAiBonusWallet(connection, mutation.userId);
  const idempotencyHash = aiBonusIdempotencyHash(mutation.userId, mutation.idempotencyKey);
  const replay = await findIdempotentEntry(connection, mutation.userId, idempotencyHash);
  if (replay) {
    assertReplayMatches(replay, mutation, 'credit');
    return {
      replay: true,
      ledgerId: replay.id,
      amountTokens: mutation.amountTokens,
      balanceAfter: Number(replay.balance_after),
    };
  }
  const balanceAfter = balance + mutation.amountTokens;
  if (!Number.isSafeInteger(balanceAfter) || balanceAfter > TOKEN_LIMIT) {
    throw walletError('AI_BONUS_BALANCE_OVERFLOW', '永久额度余额超出安全范围');
  }
  const ledgerId = await insertLedgerEntry(connection, mutation, 'credit', balanceAfter, idempotencyHash);
  const [updated] = await connection.query(
    'UPDATE user_growth SET ai_bonus_tokens = ai_bonus_tokens + ? WHERE user_id = ?',
    [mutation.amountTokens, mutation.userId],
  );
  if (Number(updated?.affectedRows || 0) !== 1) {
    throw walletError('AI_BONUS_WALLET_UPDATE_FAILED', '永久额度入账失败');
  }
  await insertCreditLot(connection, mutation, ledgerId);
  return { replay: false, ledgerId, amountTokens: mutation.amountTokens, balanceAfter };
}

async function loadSpendableLots(connection, userId) {
  const [rows] = await connection.query(
    `SELECT id, remaining_tokens
       FROM ai_bonus_lots
      WHERE user_id = ?
        AND remaining_tokens > 0
      ORDER BY create_time ASC, id ASC
      FOR UPDATE`,
    [userId],
  );
  return rows.map((row) => ({ id: row.id, remainingTokens: Number(row.remaining_tokens || 0) }));
}

/**
 * 在调用方事务中按最早来源批次扣减永久额度。
 * allowPartial 仅供 Provider 实际用量超过预占时使用，最多扣到本次结算前已有余额，绝不追扣未来充值。
 */
export async function debitAiBonusTokens(connection, input) {
  const mutation = normalizedMutation(input);
  const balance = await lockAiBonusWallet(connection, mutation.userId);
  const idempotencyHash = aiBonusIdempotencyHash(mutation.userId, mutation.idempotencyKey);
  const replay = await findIdempotentEntry(connection, mutation.userId, idempotencyHash);
  if (replay) {
    assertReplayMatches(replay, mutation, 'debit', { allowPartial: Boolean(input?.allowPartial) });
    return {
      replay: true,
      ledgerId: replay.id,
      amountTokens: Number(replay.amount_tokens),
      balanceAfter: Number(replay.balance_after),
    };
  }

  const debitAmount = input?.allowPartial ? Math.min(balance, mutation.amountTokens) : mutation.amountTokens;
  if (debitAmount <= 0) {
    // 仍写零额结算收据，避免同一超额结算在用户后续充值后重试时追扣未来余额。
    const ledgerId = await insertLedgerEntry(
      connection,
      { ...mutation, amountTokens: 0 },
      'debit',
      balance,
      idempotencyHash,
    );
    return { replay: false, ledgerId, amountTokens: 0, balanceAfter: balance };
  }
  if (debitAmount > balance) {
    throw walletError('AI_BONUS_INSUFFICIENT', '永久额度余额不足', 409);
  }

  const lots = await loadSpendableLots(connection, mutation.userId);
  let lotTotal = lots.reduce((sum, lot) => sum + lot.remainingTokens, 0);
  if (!Number.isSafeInteger(lotTotal) || lotTotal < 0) {
    throw walletError('AI_BONUS_LOT_MISMATCH', '永久额度批次数据异常');
  }
  if (lotTotal > balance) throw walletError('AI_BONUS_LOT_MISMATCH', '永久额度批次与余额不一致');
  if (lotTotal < balance) {
    const gap = balance - lotTotal;
    const gapMutation = {
      userId: mutation.userId,
      amountTokens: gap,
      sourceType: 'legacy_reconciliation',
      sourceRef: 'user_growth',
      idempotencyKey: `legacy-reconciliation:${crypto.randomUUID()}`,
      policyVersion: AI_BONUS_WALLET_POLICY_VERSION,
    };
    const gapHash = aiBonusIdempotencyHash(mutation.userId, gapMutation.idempotencyKey);
    const gapLedgerId = await insertLedgerEntry(connection, gapMutation, 'credit', balance, gapHash);
    const gapLotId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO ai_bonus_lots
        (id, user_id, credit_ledger_id, source_type, source_ref, policy_version,
         original_tokens, remaining_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gapLotId,
        mutation.userId,
        gapLedgerId,
        gapMutation.sourceType,
        gapMutation.sourceRef,
        gapMutation.policyVersion,
        gap,
        gap,
      ],
    );
    lots.push({ id: gapLotId, remainingTokens: gap });
    lotTotal += gap;
  }
  if (lotTotal < debitAmount) throw walletError('AI_BONUS_LOT_MISMATCH', '永久额度批次不足');

  const actualMutation = { ...mutation, amountTokens: debitAmount };
  const balanceAfter = balance - debitAmount;
  const ledgerId = await insertLedgerEntry(connection, actualMutation, 'debit', balanceAfter, idempotencyHash);
  const [updated] = await connection.query(
    'UPDATE user_growth SET ai_bonus_tokens = ai_bonus_tokens - ? WHERE user_id = ? AND ai_bonus_tokens >= ?',
    [debitAmount, mutation.userId, debitAmount],
  );
  if (Number(updated?.affectedRows || 0) !== 1) {
    throw walletError('AI_BONUS_WALLET_UPDATE_FAILED', '永久额度扣减失败');
  }

  let remaining = debitAmount;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const allocated = Math.min(remaining, lot.remainingTokens);
    if (allocated <= 0) continue;
    const [lotUpdate] = await connection.query(
      `UPDATE ai_bonus_lots
          SET remaining_tokens = remaining_tokens - ?
        WHERE id = ? AND remaining_tokens >= ?`,
      [allocated, lot.id, allocated],
    );
    if (Number(lotUpdate?.affectedRows || 0) !== 1) {
      throw walletError('AI_BONUS_LOT_UPDATE_FAILED', '永久额度批次扣减失败');
    }
    await connection.query(
      `INSERT INTO ai_bonus_lot_allocations
        (id, user_id, debit_ledger_id, lot_id, amount_tokens)
       VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), mutation.userId, ledgerId, lot.id, allocated],
    );
    remaining -= allocated;
  }
  if (remaining !== 0) throw walletError('AI_BONUS_LOT_MISMATCH', '永久额度批次分摊失败');
  return { replay: false, ledgerId, amountTokens: debitAmount, balanceAfter };
}
