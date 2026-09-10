// 在查询结果中投影失效状态，不在读取历史任务时改写审核记录。
const sources = {
  note: ['note', 'create_by'],
  bookmark: ['bookmark', 'user_id'],
  file: ['files', 'create_by'],
  tag: ['tag', 'user_id'],
};
const equal = (a, b) =>
  `CONVERT(${a} USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(${b} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
export function availableResourceSql(alias = 'i', deleted = false) {
  // 资源 ID 是 UUID / 数字。仅转换查询值，兼容旧 utf8 表并保留资源表主键索引。
  // owner 在主键命中后继续按统一排序规则复核，不放宽账号边界。
  return Object.entries(sources)
    .map(
      ([type, [table, owner]]) =>
        `(${alias}.resource_type='${type}' AND EXISTS(SELECT 1 FROM ${table} ar WHERE ar.id=CONVERT(${alias}.resource_id USING utf8) AND ${equal('ar.id', `${alias}.resource_id`)} AND ${equal(`ar.${owner}`, `${alias}.user_id`)} AND ar.del_flag=${deleted ? 1 : 0}))`,
    )
    .join(' OR ');
}
export const actionableStatuses = ['pending', 'insufficient', 'no_suggestion', 'info', 'failed', 'conflict'];
export function effectiveStatusSql() {
  return `CASE WHEN s.status IN (${actionableStatuses.map((s) => `'${s}'`).join(',')}) AND NOT (${availableResourceSql()}) THEN 'expired' ELSE s.status END`;
}
export function unavailableReason(trashed) {
  return trashed ? '资料已移入回收站，此建议已失效' : '资料已删除或不可访问，此建议已失效';
}
