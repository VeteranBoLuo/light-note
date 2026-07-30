const SUPPORTED_RESOURCE_TYPES = new Set(['bookmark', 'note', 'file']);

export function aiResourceExclusionSql({ alias, ownerColumn, resourceType }) {
  if (!SUPPORTED_RESOURCE_TYPES.has(resourceType)) throw new Error('AI_RESOURCE_TYPE_INVALID');
  return `NOT EXISTS (
    SELECT 1 FROM ai_resource_preferences arp
    WHERE arp.user_id = ${alias}.${ownerColumn}
      AND arp.resource_type = '${resourceType}'
      AND arp.resource_id = CAST(${alias}.id AS CHAR)
      AND arp.ai_excluded = 1
  )`;
}

export function transientExcludedIds(contentScope, resourceType) {
  if (!Array.isArray(contentScope?.excludedResourceIds)) return [];
  return [
    ...new Set(
      contentScope.excludedResourceIds
        .filter((item) => String(item?.type || '') === resourceType)
        .map((item) => String(item?.id || '').trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);
}

export function appendTransientExclusion(where, params, contentScope, resourceType, columnExpression) {
  const ids = transientExcludedIds(contentScope, resourceType);
  if (!ids.length) return where;
  params.push(...ids);
  return `${where} AND CAST(${columnExpression} AS CHAR) NOT IN (${ids.map(() => '?').join(',')})`;
}
