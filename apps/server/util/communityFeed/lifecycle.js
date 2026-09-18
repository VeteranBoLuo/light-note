export async function purgeCommunityFeedData(connection, tables, userId) {
  if (tables.has('community_post_images'))
    await connection.query("UPDATE community_post_images SET status='delete_pending' WHERE owner_id=?", [userId]);
  if (tables.has('community_resource_snapshots')) {
    if (tables.has('community_revision_resources'))
      await connection.query(
        'DELETE r FROM community_revision_resources r JOIN community_resource_snapshots s ON s.public_id=r.resource_id WHERE s.owner_id=?',
        [userId],
      );
    await connection.query('DELETE FROM community_resource_snapshots WHERE owner_id=?', [userId]);
  }
  if (tables.has('community_accepted_answers'))
    await connection.query('DELETE FROM community_accepted_answers WHERE user_id=?', [userId]);
  if (tables.has('community_task_awards'))
    await connection.query('DELETE FROM community_task_awards WHERE user_id=?', [userId]);
  // Called only after the existing permanent-deletion lifecycle gate, never for temporary suspension.
  if (tables.has('community_posts')) {
    await connection.query(
      "UPDATE community_posts SET status='withdrawn',pending_revision_id=NULL,solution_comment_id=NULL,row_revision=row_revision+1 WHERE author_id=?",
      [userId],
    );
    if (tables.has('community_post_revisions'))
      await connection.query(
        "UPDATE community_post_revisions r JOIN community_posts p ON p.id=r.post_id SET r.title='',r.body='',r.mentions=JSON_ARRAY(),r.status='withdrawn' WHERE p.author_id=?",
        [userId],
      );
  }
  if (tables.has('community_content_reports'))
    await connection.query("UPDATE community_content_reports SET detail='' WHERE reporter_id=?", [userId]);
  if (tables.has('community_appeals'))
    await connection.query("UPDATE community_appeals SET body='' WHERE author_id=?", [userId]);
  if (tables.has('community_comments') && tables.has('community_posts'))
    await connection.query(
      'UPDATE community_posts p JOIN community_comments c ON c.id=p.solution_comment_id SET p.solution_comment_id=NULL WHERE c.author_id=?',
      [userId],
    );
  if (tables.has('community_comments'))
    await connection.query(
      "UPDATE community_comments SET body='',mentions=JSON_ARRAY(),status='withdrawn',row_revision=row_revision+1 WHERE author_id=?",
      [userId],
    );
  for (const [table, field] of [
    ['community_profile_options', 'user_id'],
    ['community_post_user_states', 'user_id'],
    ['community_comment_likes', 'user_id'],
    ['community_operation_receipts', 'actor_id'],
    ['community_event_recipients', 'user_id'],
  ])
    if (tables.has(table)) await connection.query(`DELETE FROM ${table} WHERE ${field}=?`, [userId]);
  if (tables.has('community_follows'))
    await connection.query('DELETE FROM community_follows WHERE follower_user_id=? OR followee_user_id=?', [
      userId,
      userId,
    ]);
  if (tables.has('community_user_mutes'))
    await connection.query('DELETE FROM community_user_mutes WHERE user_id=? OR target_user_id=?', [userId, userId]);
}
