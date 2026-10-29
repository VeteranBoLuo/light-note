import { INTERNAL_ROLES } from '../internalRoles.js';

/** Shared ledger definition for both manor administration and points governance. */
export async function readManorPoints(db, { start, end, hideInternal = true, policyVersion = null }) {
  const params = [start, end];
  const internal = hideInternal ? ` AND u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(',')})` : '';
  if (hideInternal) params.push(...INTERNAL_ROLES);
  if (policyVersion) params.push(policyVersion);
  const [rows] = await db.query(
    `SELECT /*+ MAX_EXECUTION_TIME(5000) */ DATE_FORMAT(pl.create_time,'%Y-%m-%d') AS day,
    SUM(CASE WHEN pl.reason='manor_sale' AND pl.delta>0 THEN pl.delta ELSE 0 END) AS issued,
    SUM(CASE WHEN pl.reason='manor_cost' AND pl.delta<0 THEN -pl.delta ELSE 0 END) AS spent
    FROM points_log pl JOIN user u ON u.id=pl.user_id WHERE pl.create_time>=? AND pl.create_time<?
    AND u.del_flag=0 AND u.role IN ('user','test','root')${internal}${policyVersion ? ' AND pl.policy_version=?' : ''}
    AND pl.reason IN ('manor_sale','manor_cost') GROUP BY day ORDER BY day`,
    params,
  );
  return {
    issued: rows.reduce((n, r) => n + Number(r.issued), 0),
    spent: rows.reduce((n, r) => n + Number(r.spent), 0),
    rows,
  };
}
