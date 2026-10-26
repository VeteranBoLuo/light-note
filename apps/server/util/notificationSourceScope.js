// Source hints contain identifiers only. SQL is built from this closed set, never from Redis text.
const KINDS = new Set(['batch', 'chat', 'feed_post', 'feed_comment', 'publication', 'todo', 'actor']);
export const MAX_NOTIFICATION_SOURCE_IDS = 1000;

function ids(value, max) {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((id) => typeof id !== 'string' || !id || id.length > 255)
  )
    return null;
  return [...new Set(value)].sort();
}

export function normalizeNotificationSourceScope(value) {
  if (!value || !KINDS.has(value.kind)) return null;
  const sourceIds = ids(value.ids, MAX_NOTIFICATION_SOURCE_IDS);
  if (!sourceIds?.length) return null;
  if (value.userIds !== undefined) {
    const userIds = ids(value.userIds, 500);
    return userIds?.length ? { kind: value.kind, ids: sourceIds, userIds } : null;
  }
  return { kind: value.kind, ids: sourceIds };
}

/** Only inspect accounts with a current SSE listener, using the existing owner/source index. */
export function notificationSourceQuery(input, connectedUserIds) {
  const scope = normalizeNotificationSourceScope(input);
  if (!scope) return null;
  const restricted = scope.userIds ? new Set(scope.userIds) : null;
  const owners = [...new Set(connectedUserIds)].filter((id) => !restricted || restricted.has(id));
  if (!owners.length) return null;
  const params = [];
  const bind = (values) => {
    params.push(...values);
    return values.map(() => '?').join(',');
  };
  const ownerSql = `n.user_id IN (${bind(owners)})`;
  const source = () => bind(scope.ids);
  let filter;
  switch (scope.kind) {
    case 'batch':
      filter = `(n.batch_id IN (${source()}) OR n.id IN (${source()}))`;
      break;
    case 'chat':
      filter = `n.source_type='community_chat_message' AND n.source_id IN (${source()})`;
      break;
    case 'feed_post':
      filter = `n.source_type IN ('community_feed_review','community_feed_post','community_feed_post_like','community_feed_comment','community_feed_comment_like') AND
        (n.source_id IN (${source()}) OR JSON_UNQUOTE(JSON_EXTRACT(n.meta,'$.postId')) IN (${source()}))`;
      break;
    case 'feed_comment':
      filter = `n.source_type IN ('community_feed_comment','community_feed_comment_like') AND JSON_UNQUOTE(JSON_EXTRACT(n.meta,'$.commentId')) IN (${source()})`;
      break;
    case 'publication':
      filter = `n.source_type IN ('public_resource_review','public_resource_result') AND
        (SUBSTRING_INDEX(n.source_id,':',1) IN (${source()}) OR JSON_UNQUOTE(JSON_EXTRACT(n.meta,'$.publicationId')) IN (${source()}))`;
      break;
    case 'todo':
      filter = `n.type='todo_reminder' AND JSON_UNQUOTE(JSON_EXTRACT(n.meta,'$.todoId')) IN (${source()})`;
      break;
    case 'actor':
      filter = `(n.user_id IN (${source()}) OR
        (n.type='community_feed' AND (
          EXISTS (SELECT 1 FROM community_posts p WHERE p.public_id=CONVERT(JSON_UNQUOTE(JSON_EXTRACT(n.meta,'$.postId')) USING ascii) COLLATE ascii_bin AND p.author_id IN (${source()})) OR
          EXISTS (SELECT 1 FROM community_comments c WHERE c.public_id=CONVERT(JSON_UNQUOTE(JSON_EXTRACT(n.meta,'$.commentId')) USING ascii) COLLATE ascii_bin AND c.author_id IN (${source()})) OR
          EXISTS (SELECT 1 FROM community_chat_user_identities i WHERE i.user_id IN (${source()}) AND i.public_id=CONVERT(JSON_UNQUOTE(JSON_EXTRACT(n.meta,'$.actorId')) USING ascii) COLLATE ascii_bin))) OR
        (n.source_type='community_chat_message' AND EXISTS (SELECT 1 FROM community_chat_messages m WHERE m.public_id=CONVERT(n.source_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AND m.user_id IN (${source()}))) OR
        (n.source_type='public_resource_review' AND EXISTS (SELECT 1 FROM public_resource_publications p WHERE p.public_id=CONVERT(SUBSTRING_INDEX(n.source_id,':',1) USING ascii) COLLATE ascii_bin AND p.owner_id IN (${source()}))))`;
      break;
  }
  return {
    sql: `SELECT DISTINCT n.user_id AS userId FROM notification n FORCE INDEX (uk_notification_source) WHERE ${ownerSql} AND (${filter})`,
    params,
  };
}
