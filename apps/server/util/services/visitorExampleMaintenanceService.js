// Explicit visitor-only maintenance. No runtime route calls this service.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { insertData } from '../agent/data.js';
import { applyOwnedNoteContentChange } from './noteService.js';
import { extractOwnedResourceRefs } from './noteReferenceService.js';
import { prepareOwnedNotePlacement } from './noteTreeService.js';
import { sanitizePersistedNoteContent } from '../noteHtmlSanitizer.js';
import { softDeleteOwnedCloudFiles } from './cloudFileDeletionService.js';
import { insertVerifiedCloudFile } from './managedCloudUploadService.js';
import { syncCloudImageById } from '../imagePreview/references.js';
import { resolvePersonalKnowledgeResourceMetadata } from '../personalKnowledgeSearch.js';

const TABLES = Object.freeze({
  bookmark: 'user_id',
  note: 'create_by',
  files: 'create_by',
  tag: 'user_id',
  resource_tag_relations: 'user_id',
  note_resource_refs: 'source_user_id',
  resource_inbox: 'user_id',
  toolbox_workspaces: 'user_id',
  toolbox_workspace_resources: 'user_id',
});
const canonical = (value) => JSON.stringify(value);
export const snapshotHash = (snapshot) => crypto.createHash('sha256').update(canonical(snapshot)).digest('hex');
export async function readVisitorSnapshot(db, userId, lock = false) {
  const [users] = await db.query(`SELECT id,role,del_flag FROM user WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [userId]);
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'visitor');
  assert.equal(Number(users[0].del_flag), 0);
  const data = { user: users[0], tables: {} };
  for (const [table, owner] of Object.entries(TABLES)) {
    const [rows] = await db.query(`SELECT * FROM ${table} WHERE ${owner}=?${lock ? ' FOR UPDATE' : ''}`, [userId]);
    data.tables[table] = rows.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  }
  data.related = {};
  for (const [table, sql] of Object.entries({
    todo_resource_refs: 'SELECT * FROM todo_resource_refs WHERE user_id=?',
    note_versions: 'SELECT * FROM note_versions WHERE create_by=?',
    note_images: 'SELECT * FROM note_images WHERE note_id IN (SELECT id FROM note WHERE create_by=?)',
    file_shares: 'SELECT * FROM file_shares WHERE owner_user_id=?',
    image_assets: 'SELECT * FROM image_assets WHERE owner_user_id=?',
    image_asset_refs:
      'SELECT * FROM image_asset_refs WHERE asset_id IN (SELECT id FROM image_assets WHERE owner_user_id=?)',
  })) {
    const [rows] = await db.query(sql + (lock ? ' FOR UPDATE' : ''), [userId]);
    data.related[table] = rows.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  }
  return JSON.parse(canonical(data));
}
export function buildVisitorPlan(snapshot, manifest) {
  assert.equal(snapshot.user.role, 'visitor');
  const active = snapshot.tables.bookmark.filter((x) => Number(x.del_flag) === 0);
  // Existing bookmarks and tags are explicitly outside this maintenance scope.
  const bookmarks = active;
  const retained = [],
    archive = [];
  for (const p of manifest.associations)
    assert(
      active.some((b) => b.name === p.bookmark),
      'Existing bookmark missing',
    );
  const notes = manifest.visitorNotes.map((n) => {
    const matches = n.existing
      ? snapshot.tables.note.filter((x) => Number(x.del_flag) === 0 && x.title === n.existing)
      : [];
    if (n.existing) assert.equal(matches.length, 1, `Existing sample must resolve: ${n.existing}`);
    return { ...n, id: matches[0]?.id || manifest.stableId(`note:${n.key}`) };
  });
  for (const p of manifest.associations)
    assert(
      snapshot.tables.toolbox_workspaces.some((w) => w.id === manifest.workshopId(p.key) && w.status !== 'archived'),
      'Example project missing',
    );
  return { bookmarks, retained, archive, notes };
}
export async function applyVisitorPlan(connection, { snapshot, manifest, uploads, quotaMB, failBeforeCommit = false }) {
  const userId = snapshot.user.id;
  const current = await readVisitorSnapshot(connection, userId, true);
  assert.equal(snapshotHash(current), snapshotHash(snapshot), 'VISITOR_SNAPSHOT_CONFLICT');
  const plan = buildVisitorPlan(snapshot, manifest);
  const bookmarkMap = new Map(plan.bookmarks.map((b) => [b.name, b.id]));
  const fileMap = new Map();
  for (const file of manifest.files) {
    const upload = uploads.find((x) => x.name === file.name);
    assert(upload, 'Verified upload required');
    const [existing] = await connection.query('SELECT * FROM files WHERE create_by=? AND obs_key=? AND del_flag=0', [
      userId,
      upload.objectKey,
    ]);
    const saved =
      existing[0] ||
      (await insertVerifiedCloudFile(connection, {
        userId,
        objectKey: upload.objectKey,
        fileName: file.name,
        fileType: file.type,
        quotaMB,
      }));
    await syncCloudImageById(connection, saved.id);
    fileMap.set(file.name, String(saved.id));
  }
  const oldFiles = snapshot.tables.files.filter(
    (x) =>
      Number(x.del_flag) === 0 &&
      (/\.(zip|rar)$/i.test(x.file_name) || x.file_name === 'Windows部署OpenClaw完整指南.md'),
  );
  // Replacement Markdown is linked explicitly; refuse to archive any old file still referenced.
  const fileRefs = [
    ...snapshot.tables.note_resource_refs,
    ...(snapshot.related?.todo_resource_refs || []),
    ...snapshot.tables.toolbox_workspace_resources.map((r) => ({
      target_type: r.resource_type,
      target_id: r.resource_id,
    })),
    ...snapshot.tables.note
      .filter((n) => Number(n.del_flag) === 0 && n.type !== 'drawing')
      .flatMap((n) =>
        extractOwnedResourceRefs({ content: n.content, type: n.type }).map((r) => ({
          target_type: r.type,
          target_id: r.id,
        })),
      ),
  ];
  for (const f of oldFiles)
    assert(
      !fileRefs.some((r) => r.target_type === 'file' && String(r.target_id) === String(f.id)),
      'Old file still referenced',
    );
  await softDeleteOwnedCloudFiles(connection, { userId, fileIds: oldFiles.map((x) => x.id) });
  const noteMap = new Map(plan.notes.map((n) => [n.key, n]));
  const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  function resource(type, id, name, format) {
    const url =
      type === 'note'
        ? `/noteLibrary/${id}`
        : type === 'bookmark'
          ? `/manage/editBookmark/${id}`
          : `/cloudSpace?fileId=${id}`;
    return format === 'html'
      ? `<li><a href="${url}" data-ln-resource-type="${type}" data-ln-resource-id="${id}" contenteditable="false">${esc(name)}</a></li>`
      : `- [${name}](${url})`;
  }
  // Create empty root records first so all cross-references can validate in the same transaction.
  for (const n of plan.notes)
    if (!snapshot.tables.note.some((x) => x.id === n.id)) {
      const placement = await prepareOwnedNotePlacement(connection, { userId, parentId: null });
      await connection.query('INSERT INTO note SET ?', [
        insertData({
          id: n.id,
          title: n.title,
          content: '',
          type: n.type,
          createBy: userId,
          updateBy: userId,
          sort: placement.sort,
          parentId: null,
          revision: 1,
        }),
      ]);
    }
  for (const n of plan.notes) {
    const groups = manifest.associations.filter((p) => p.notes.includes(n.key));
    const chosen = groups.length
      ? groups
      : manifest.associations.filter((p) =>
          ['research-interviews', 'learning-markdown', 'writing-weekly-report'].includes(p.key),
        );
    const links = new Map();
    for (const p of chosen) {
      for (const k of p.notes)
        if (k !== n.key) {
          const target = noteMap.get(k);
          links.set(`note:${target.id}`, resource('note', target.id, target.title, n.type));
        }
      const bid = bookmarkMap.get(p.bookmark);
      links.set(`bookmark:${bid}`, resource('bookmark', bid, p.bookmark, n.type));
      for (const f of p.files) links.set(`file:${fileMap.get(f)}`, resource('file', fileMap.get(f), f, n.type));
      const url = `/toolbox/research_workspace?workspace=${manifest.workshopId(p.key)}&entry=workshop`;
      const title = snapshot.tables.toolbox_workspaces.find((x) => x.id === manifest.workshopId(p.key)).title;
      links.set(p.key, n.type === 'html' ? `<li><a href="${esc(url)}">${esc(title)}</a></li>` : `- [${title}](${url})`);
    }
    // Preserve existing explicit resource references, even when sample prose is rewritten.
    const original = snapshot.tables.note.find((x) => x.id === n.id);
    const oldInline = original ? extractOwnedResourceRefs({ content: original.content, type: original.type }) : [];
    for (const r of oldInline) {
      const table = r.type === 'bookmark' ? 'bookmark' : r.type === 'note' ? 'note' : 'files';
      const target = snapshot.tables[table]?.find((x) => String(x.id) === String(r.id) && Number(x.del_flag) === 0);
      if (target)
        links.set(`${r.type}:${r.id}`, resource(r.type, r.id, target.name || target.title || target.file_name, n.type));
    }
    for (const r of snapshot.tables.note_resource_refs.filter((x) => x.source_note_id === n.id))
      links.set(
        `${r.target_type}:${r.target_id}`,
        resource(r.target_type, r.target_id, r.target_name_snapshot, n.type),
      );
    const addition =
      n.type === 'html'
        ? `<h2>相关资料与项目</h2><ul>${[...links.values()].join('')}</ul>`
        : `\n\n## 相关资料与项目\n\n${[...links.values()].join('\n')}\n`;
    const content =
      n.type === 'html'
        ? sanitizePersistedNoteContent(n.body + addition, 'html', 'visitor-maintenance')
        : n.body + addition;
    const before = snapshot.tables.note.find((x) => x.id === n.id) || { title: n.title, content: '', type: n.type };
    await applyOwnedNoteContentChange(connection, {
      userId,
      noteId: n.id,
      before,
      after: { type: n.type, content },
      snapshotReason: 'visitor_refresh',
    });
    await connection.query('UPDATE note SET is_top=? WHERE id=? AND create_by=?', [
      n.key === 'welcome' ? 1 : 0,
      n.id,
      userId,
    ]);
  }
  for (const p of manifest.associations) {
    const refs = [
      ...p.notes.map((k) => ({ type: 'note', id: noteMap.get(k).id })),
      { type: 'bookmark', id: bookmarkMap.get(p.bookmark) },
      ...p.files.map((f) => ({ type: 'file', id: fileMap.get(f) })),
    ];
    const metadata = await resolvePersonalKnowledgeResourceMetadata({
      userId,
      resourceRefs: refs,
      database: connection,
      lockForShare: true,
    });
    assert.equal(metadata.length, refs.length);
    for (const m of metadata) {
      await connection.query(
        `INSERT INTO toolbox_workspace_resources (workspace_id,user_id,resource_type,resource_id,resource_version,resource_title) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE resource_version=VALUES(resource_version),resource_title=VALUES(resource_title)`,
        [manifest.workshopId(p.key), userId, m.type, m.id, m.version, m.title],
      );
    }
    await connection.query('UPDATE toolbox_workspaces SET board_version=board_version+1 WHERE id=? AND user_id=?', [
      manifest.workshopId(p.key),
      userId,
    ]);
  }
  if (failBeforeCommit) throw new Error('VISITOR_TEST_ROLLBACK');
  return {
    bookmarks: plan.bookmarks.length + plan.retained.length,
    archivedBookmarks: plan.archive.length,
    notes:
      plan.notes.length + snapshot.tables.note.filter((x) => Number(x.del_flag) === 0 && x.type === 'drawing').length,
    files:
      snapshot.tables.files.filter((x) => Number(x.del_flag) === 0).length - oldFiles.length + manifest.files.length,
  };
}
