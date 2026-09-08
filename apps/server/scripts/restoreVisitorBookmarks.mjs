// Restore only this maintenance version's bookmark/tag changes; files and note improvements remain.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const apply = process.argv.includes('--apply');
process.env.ALLOW_REMOTE_DATABASE_READS = apply ? 'false' : 'true';
process.env.ALLOW_REMOTE_DATABASE_WRITES = apply ? 'true' : 'false';
const { default: pool } = await import('../db/index.js');
const { readVisitorSnapshot, snapshotHash } = await import('../util/services/visitorExampleMaintenanceService.js');
const { applyOwnedNoteContentChange } = await import('../util/services/noteService.js');
const { softDeleteResources } = await import('../util/services/resourceDeleteService.js');
const { invalidatePersonalKnowledgeCache, resolvePersonalKnowledgeResourceMetadata } =
  await import('../util/personalKnowledgeSearch.js');
const state = path.join(os.homedir(), '.local/state/light-note/visitor-resources-v1');
const before = JSON.parse(await fs.readFile(path.join(state, 'before.json'), 'utf8'));
const plan = JSON.parse(await fs.readFile(path.join(state, 'plan.json'), 'utf8'));
const map = [
  ['GOV.UK 用户研究', '秘塔AI搜索'],
  ['Atlassian Team Playbook', '轻笺知识管理'],
  ['Markdown Guide', '菜鸟教程'],
  ['Learning Scientists', '少数派 - 高效工作，品质生活'],
  ['Google 技术写作', '网道'],
  ['Diátaxis', 'MDN Web Docs'],
].map(([from, to]) => {
  const source = plan.bookmarks.find((b) => b.name === from),
    target = before.tables.bookmark.find((b) => b.name === to && Number(b.del_flag) === 0);
  assert(source && target);
  return { source, target };
});
function values(row) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      v?.type === 'Buffer' ? Buffer.from(v.data) : v && (/_time$/.test(k) || /_at$/.test(k)) ? new Date(v) : v,
    ]),
  );
}
let connection;
try {
  const current = await readVisitorSnapshot(pool, before.user.id);
  const completedPath = path.join(state, 'bookmarks-restored.json');
  let restored = false;
  try {
    await fs.access(completedPath);
    restored = true;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (restored) {
    console.log('Bookmark/tag restoration already completed; no writes.');
  } else {
    console.log(
      JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        restoreBookmarks: before.tables.bookmark.filter((x) => Number(x.del_flag) === 0).length,
        restoreTags: before.tables.tag.filter((x) => Number(x.del_flag) === 0).length,
        relink: map.length,
      }),
    );
    if (apply) {
      await fs.writeFile(path.join(state, 'before-bookmark-restore.json'), JSON.stringify(current), { mode: 0o600 });
      connection = await pool.getConnection();
      await connection.beginTransaction();
      assert.equal(
        snapshotHash(await readVisitorSnapshot(connection, before.user.id, true)),
        snapshotHash(current),
        'CONCURRENT_VISITOR_CHANGE',
      );
      for (const row of before.tables.bookmark) {
        const { id, user_id, ...data } = values(row);
        await connection.query('UPDATE bookmark SET ? WHERE id=? AND user_id=?', [data, id, user_id]);
      }
      const oldIds = new Set(before.tables.bookmark.map((x) => String(x.id)));
      await softDeleteResources(connection, {
        userId: before.user.id,
        items: current.tables.bookmark
          .filter((x) => !oldIds.has(String(x.id)))
          .map((x) => ({ type: 'bookmark', id: x.id })),
      });
      const oldTags = new Set(before.tables.tag.map((x) => String(x.id)));
      for (const row of before.tables.tag) {
        const { id, user_id, active_name, ...data } = values(row);
        await connection.query('UPDATE tag SET ? WHERE id=? AND user_id=?', [data, id, user_id]);
      }
      for (const row of current.tables.tag.filter((x) => !oldTags.has(String(x.id))))
        await connection.query('UPDATE tag SET del_flag=1 WHERE id=? AND user_id=?', [row.id, before.user.id]);
      await connection.query('DELETE FROM resource_tag_relations WHERE user_id=?', [before.user.id]);
      for (const row of before.tables.resource_tag_relations)
        await connection.query('INSERT INTO resource_tag_relations SET ?', [values(row)]);
      await connection.query("DELETE FROM resource_inbox WHERE user_id=? AND resource_type='bookmark'", [
        before.user.id,
      ]);
      for (const row of before.tables.resource_inbox.filter((x) => x.resource_type === 'bookmark'))
        await connection.query('INSERT INTO resource_inbox SET ?', [values(row)]);
      for (const note of current.tables.note.filter((x) => Number(x.del_flag) === 0 && x.type !== 'drawing')) {
        let content = note.content;
        for (const { source, target } of map)
          content = content.replaceAll(source.id, target.id).replaceAll(source.name, target.name);
        if (content !== note.content)
          await applyOwnedNoteContentChange(connection, {
            userId: before.user.id,
            noteId: note.id,
            before: note,
            after: { content, type: note.type },
            snapshotReason: 'visitor_bookmark_restore',
          });
      }
      for (const { source, target } of map) {
        const [metadata] = await resolvePersonalKnowledgeResourceMetadata({
          userId: before.user.id,
          resourceRefs: [{ type: 'bookmark', id: target.id }],
          database: connection,
          lockForShare: true,
        });
        assert(metadata);
        const refs = current.tables.toolbox_workspace_resources.filter(
          (r) => r.resource_type === 'bookmark' && r.resource_id === source.id,
        );
        for (const ref of refs) {
          await connection.query(
            "DELETE FROM toolbox_workspace_resources WHERE workspace_id=? AND user_id=? AND resource_type='bookmark' AND resource_id=?",
            [ref.workspace_id, before.user.id, source.id],
          );
          await connection.query(
            "INSERT INTO toolbox_workspace_resources (workspace_id,user_id,resource_type,resource_id,resource_version,resource_title) VALUES (?,?,'bookmark',?,?,?) ON DUPLICATE KEY UPDATE resource_title=VALUES(resource_title),resource_version=VALUES(resource_version)",
            [ref.workspace_id, before.user.id, target.id, metadata.version, target.name],
          );
        }
      }
      const after = await readVisitorSnapshot(connection, before.user.id);
      assert.equal(after.tables.bookmark.filter((x) => Number(x.del_flag) === 0).length, 172);
      assert.equal(
        after.tables.tag.filter((x) => Number(x.del_flag) === 0).length,
        before.tables.tag.filter((x) => Number(x.del_flag) === 0).length,
      );
      await connection.commit();
      connection.release();
      connection = null;
      await fs.writeFile(completedPath, JSON.stringify({ afterHash: snapshotHash(after), bookmarks: 172, tags: 21 }), {
        mode: 0o600,
      });
      await invalidatePersonalKnowledgeCache(before.user.id, { persist: true });
      console.log('Restored 172 bookmarks and 21 tags; kept 16 notes and 10 files.');
    }
  }
} catch (e) {
  if (connection) await connection.rollback();
  console.error(e.code || e.message?.split('\n')[0]);
  process.exitCode = 1;
} finally {
  if (connection) connection.release();
  await pool.end();
}
