import { getToolboxTool } from '@lightnote/shared/toolbox-protocol';
import pool from '../../db/index.js';
import {
  beginPointsEconomyOperation,
  completePointsEconomyOperation,
  PointsEconomyError,
} from '../pointsEconomyOperations.js';
import { getEconomyRuntime } from '../pointsEconomyCatalog.js';
import { getDisabledToolIds, IMAGE_REPAIR_POINTS, normalizeToolboxRequestId, toolboxInputDigest } from './catalog.js';
import { toolboxError } from './errors.js';

const TOOL_ID = 'image_watermark_remover';

function assertRepairAvailable() {
  if (!getToolboxTool(TOOL_ID)?.availability.enabled || getDisabledToolIds().includes(TOOL_ID)) {
    throw toolboxError('TOOLBOX_TOOL_UNAVAILABLE', '该工具正在维护，请稍后再试', 503);
  }
}

function pointsBalance(account) {
  if (!account) throw toolboxError('TOOLBOX_POINTS_ACCOUNT_MISSING', '积分账户暂不可用，请稍后重试', 503);
  return Math.max(0, Number(account.points || 0));
}

export async function readImageRepairPoints(userId, database = pool) {
  assertRepairAvailable();
  const [[account]] = await database.query('SELECT points FROM user_growth WHERE user_id = ?', [userId]);
  return { cost: IMAGE_REPAIR_POINTS, balance: pointsBalance(account) };
}

export async function settleImageRepairPoints({ userId, input, database = pool }) {
  if (
    !input ||
    typeof input.clientRequestId !== 'string' ||
    typeof input.accountId !== 'string' ||
    !Number.isSafeInteger(input.expectedCost) ||
    input.expectedCost < 1 ||
    Object.keys(input).some((key) => !['clientRequestId', 'expectedCost', 'accountId'].includes(key))
  ) {
    throw toolboxError('TOOLBOX_IMAGE_REPAIR_BILLING_INVALID', '修复结算请求无效');
  }
  if (input.accountId !== String(userId)) {
    throw toolboxError('TOOLBOX_IMAGE_REPAIR_ACCOUNT_CHANGED', '当前登录账号已变化，请重新打开工具', 409);
  }
  const requestId = normalizeToolboxRequestId(input.clientRequestId);
  const scopedRequestId = `repair:${toolboxInputDigest(requestId).slice(0, 48)}`;
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [[account]] = await connection.query('SELECT points FROM user_growth WHERE user_id = ? FOR UPDATE', [userId]);
    const balance = pointsBalance(account);
    const operation = await beginPointsEconomyOperation(connection, {
      userId,
      operationType: 'toolbox_image_repair',
      clientRequestId: scopedRequestId,
      payload: { toolId: TOOL_ID },
      expectedCost: input.expectedCost,
      actualCost: IMAGE_REPAIR_POINTS,
      // 工坊独立定价。商店调整经济版本时，本次修复的原收据仍然可以重放。
      runtime: { ...getEconomyRuntime(), requireWriteVersion: false },
    });
    if (operation.replay) {
      await connection.commit();
      return operation.replay;
    }
    assertRepairAvailable();
    if (balance < IMAGE_REPAIR_POINTS) {
      throw toolboxError('TOOLBOX_POINTS_INSUFFICIENT', '积分不足，暂时无法修复', 409);
    }
    await connection.query('UPDATE user_growth SET points = points - ? WHERE user_id = ?', [
      IMAGE_REPAIR_POINTS,
      userId,
    ]);
    const receipt = { itemId: TOOL_ID, cost: IMAGE_REPAIR_POINTS };
    await connection.query(
      "INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, 'toolbox_image_repair', ?)",
      [userId, -IMAGE_REPAIR_POINTS, String(operation.operationId)],
    );
    await completePointsEconomyOperation(connection, operation, receipt);
    await connection.commit();
    return receipt;
  } catch (error) {
    await connection.rollback();
    if (error instanceof PointsEconomyError) {
      const code = error.code === 'ECONOMY_CATALOG_CHANGED' ? 'TOOLBOX_PRICING_CHANGED' : error.code;
      throw toolboxError(code, error.message, error.status);
    }
    throw error;
  } finally {
    connection.release();
  }
}
