/** Content identity for extraction snapshots. Ordinary search timestamps alone cannot
 * distinguish same-second edits or a bookmark URL change with an older archive.
 * Hash in SQL so version checks never return source bodies or object keys. */
export async function resolveExtractionSourceVersions({ userId, resourceRefs, database }) {
  const result = [];
  for (const ref of resourceRefs) {
    let sql;
    if (ref.type === 'note')
      sql =
        "SELECT id,title resource_title,SHA2(CONCAT_WS(CHAR(0),COALESCE(title,''),COALESCE(type,''),COALESCE(content,'')),256) version FROM note WHERE id=? AND create_by=? AND del_flag=0";
    else if (ref.type === 'bookmark')
      sql =
        "SELECT b.id,b.name resource_title,SHA2(CONCAT_WS(CHAR(0),COALESCE(b.name,''),COALESCE(b.url,''),COALESCE(s.content,'')),256) version FROM bookmark b LEFT JOIN bookmark_snapshot s ON s.bookmark_id=b.id AND s.user_id=b.user_id AND BINARY s.url=BINARY b.url WHERE b.id=? AND b.user_id=? AND b.del_flag=0";
    else if (ref.type === 'file')
      sql =
        "SELECT id,file_name resource_title,SHA2(CONCAT_WS(CHAR(0),COALESCE(file_name,''),COALESCE(file_type,''),COALESCE(file_size,''),COALESCE(obs_key,''),COALESCE(create_time,'')),256) version FROM files WHERE id=? AND create_by=? AND del_flag=0";
    else continue;
    const [[row]] = await database.query(sql, [ref.id, userId]);
    if (row)
      result.push({
        type: ref.type,
        id: String(row.id),
        version: row.version,
        title: String(row.resource_title || '').slice(0, 255),
      });
  }
  return result;
}
