import { insertData } from '../agent/data.js';
import { ensureTag } from './tagService.js';
import { batchWriteResourceTags } from './resourceTagWriteService.js';
import { enqueueResources, removeInboxRelations } from '../resourceInbox.js';
import { prepareOwnedNotePlacement, deleteOwnedNoteSubtrees } from './noteTreeService.js';
import { applyOwnedNoteContentChange } from './noteService.js';
import { sanitizePersistedNoteContent } from '../noteHtmlSanitizer.js';
import { extractOwnedResourceRefs, validateOwnedResourceRefs } from './noteReferenceService.js';
import { createTodo, updateTodo } from './todoService.js';
import { saveTodoList, writeTodoOrganization } from './todoOrganizationService.js';
import { createOwnedCloudFolder, deleteEmptyOwnedCloudFolder } from './cloudFolderTreeService.js';
import { registerAsset, syncNoteImageReferences } from '../imagePreview/references.js';
import {
  assertVisitorOwner,
  exampleHash,
  exampleError,
  visitorDate,
  rollingValues,
  readRollingObject,
  VISITOR_EXAMPLE_VERSION,
} from './visitorExampleScheduleService.js';
import * as definitions from '../../scripts/visitorExamples/manifestV2.mjs';
import { workshopId } from '../../scripts/visitorExamples/manifest.mjs';

export const SNAPSHOT_TABLES = Object.freeze({
  note: ['create_by', ['id']],
  files: ['create_by', ['id']],
  folders: ['create_by', ['id']],
  tag: ['user_id', ['id']],
  resource_tag_relations: ['user_id', ['tag_id', 'resource_type', 'resource_id']],
  resource_inbox: ['user_id', ['id']],
  todo_reminders: ['user_id', ['id']],
  todo_lists: ['user_id', ['id']],
  todo_items: ['user_id', ['id']],
  todo_tag_relations: ['user_id', ['target_type', 'target_id', 'tag_id']],
  todo_resource_refs: ['user_id', ['todo_id', 'target_type', 'target_id']],
  toolbox_workspaces: ['user_id', ['id']],
  toolbox_workspace_items: ['user_id', ['id']],
});
export async function readVisitorV2Snapshot(db, owner, lock = false) {
  await assertVisitorOwner(db, owner, lock);
  const tables = {};
  for (const [table, [column]] of Object.entries(SNAPSHOT_TABLES)) {
    const [rows] = await db.query(`SELECT * FROM ${table} WHERE ${column}=?${lock ? ' FOR UPDATE' : ''}`, [owner]);
    if (rows.length > 5000) throw exampleError('VISITOR_SNAPSHOT_TOO_LARGE');
    tables[table] = rows.sort((a, b) => exampleHash(a).localeCompare(exampleHash(b)));
  }
  return { owner, tables };
}
const active = (rows) => rows.filter((r) => r.del_flag == null || Number(r.del_flag) === 0);
const unique = (rows, name, field = 'title') => {
  const matches = active(rows).filter((r) => r[field] === name);
  if (matches.length > 1) throw exampleError('VISITOR_AMBIGUOUS_SAMPLE');
  return matches[0];
};
export function planVisitorV2(snapshot) {
  const notes = Object.keys(definitions.noteThemes).map((title) => ({
    title,
    id: unique(snapshot.tables.note, title)?.id || null,
  }));
  for (const title of definitions.pinnedNotes)
    if (!notes.find((n) => n.title === title)?.id) throw exampleError('VISITOR_PINNED_SAMPLE_MISSING');
  for (const note of notes)
    if (!note.id && !['周末散步：把生活留在一页里', '一张灵感板的配色观察'].includes(note.title))
      throw exampleError('VISITOR_NOTE_SAMPLE_MISSING');
  return {
    version: VISITOR_EXAMPLE_VERSION,
    notes,
    files: active(snapshot.tables.files).map((row) => ({
      id: String(row.id),
      name: row.file_name,
      placement: definitions.filePlacement[row.file_name] || null,
    })),
    todos: definitions.todos.map((item) => {
      const old = unique(snapshot.tables.todo_items, item.title);
      const safe = old && !old.series_id && old.status === 'pending' && Number(old.plan_version || 1) === 1;
      return { ...item, id: safe ? old.id : null, retainedId: old && !safe ? String(old.id) : null };
    }),
  };
}
const refLink = (type, id, title) =>
  `<a href="${type === 'note' ? `/noteLibrary/${id}` : `/cloudSpace?fileId=${id}`}" data-ln-resource-type="${type}" data-ln-resource-id="${id}">${String(title).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</a>`;

export async function applyVisitorV2(connection, { snapshot, images, now = new Date() }) {
  const owner = snapshot.owner;
  const current = await readVisitorV2Snapshot(connection, owner, true);
  if (exampleHash(current) !== exampleHash(snapshot)) throw exampleError('VISITOR_SNAPSHOT_CONFLICT');
  const [[existing]] = await connection.query(
    'SELECT version FROM visitor_example_maintenance WHERE user_id=? FOR UPDATE',
    [owner],
  );
  if (existing) throw exampleError('VISITOR_VERSION_ALREADY_INSTALLED');
  const review = await describeVisitorV2(connection, current);
  if (review.references.some((ref) => !ref.available)) throw exampleError('VISITOR_REFERENCE_UNAVAILABLE');
  const plan = planVisitorV2(snapshot),
    date = visitorDate(now);
  const urls = {};
  for (const image of images) {
    if (!/^[a-z0-9-]+\.png$/.test(image.locator) || !/^[a-f0-9]{64}$/.test(image.sha256))
      throw exampleError('VISITOR_IMAGE_INVALID');
    await registerAsset(connection, {
      owner,
      sourceType: 'note_image',
      sourceId: image.locator,
      locator: image.locator,
      storage: 'local',
      version: image.sha256,
      size: image.size,
      reconciled: true,
    });
    urls[image.key] = `https://boluo66.top/uploads/${image.locator}`;
  }
  if (!['welcome', 'weekend', 'inspiration'].every((key) => urls[key])) throw exampleError('VISITOR_IMAGE_MISSING');
  const bodies = definitions.buildNoteBodies(urls);
  for (const item of plan.notes)
    if (!item.id) {
      const placement = await prepareOwnedNotePlacement(connection, { userId: owner, parentId: null });
      const row = insertData({
        title: item.title,
        content: '',
        type: 'html',
        createBy: owner,
        sort: placement.sort,
        parentId: null,
        revision: 1,
      });
      await connection.query('INSERT INTO note SET ?', [row]);
      item.id = String(row.id);
    }
  const noteMap = new Map(plan.notes.map((n) => [n.title, String(n.id)]));
  const allTagNames = new Set([
    ...Object.values(definitions.noteThemes).flat(),
    ...definitions.todos.map((t) => t.tag),
    ...plan.files.flatMap((f) => (f.placement ? [f.placement[1]] : [])),
  ]);
  const tags = {};
  for (const name of allTagNames) tags[name] = String((await ensureTag({ userId: owner, name, connection })).id);
  for (const item of plan.notes) {
    const original = snapshot.tables.note.find((n) => String(n.id) === String(item.id));
    if (bodies[item.title]) {
      let body = bodies[item.title];
      const oldRelated = original?.content?.match(/<h2>相关资料与项目<\/h2>[\s\S]*/)?.[0] || '';
      body =
        body.replace(/\{\{ref:note:(welcome|drawing)\}\}/g, (_, key) =>
          refLink(
            'note',
            noteMap.get(key === 'drawing' ? '手绘笔记示例' : '欢迎使用轻笺笔记'),
            key === 'drawing' ? '手绘笔记' : '欢迎导览',
          ),
        ) + oldRelated;
      const refs = original ? extractOwnedResourceRefs({ content: original.content, type: original.type }) : [];
      if (refs.length)
        body +=
          '<h2>原有资料入口</h2><ul>' +
          refs
            .map(
              (r) =>
                `<li>${r.type === 'bookmark' ? `<a href="/manage/editBookmark/${r.id}" data-ln-resource-type="bookmark" data-ln-resource-id="${r.id}">参考书签</a>` : refLink(r.type, r.id, r.type === 'note' ? '参考笔记' : '参考文件')}</li>`,
            )
            .join('') +
          '</ul>';
      if (item.title === '欢迎使用轻笺笔记') {
        const file = plan.files.find((f) => f.name === '访谈摘要.pdf');
        const project = snapshot.tables.toolbox_workspaces.find(
          (p) => p.id === workshopId('research-interviews') && p.status === 'active',
        );
        if (!file || !project) throw exampleError('VISITOR_GUIDE_TARGET_MISSING');
        body += `<h2>打开示例资料</h2><p>${refLink('file', file.id, '访谈摘要 PDF')} · <a href="/toolbox/research_workspace?workspace=${project.id}">继续研究项目</a></p>`;
      }
      body += '<p>' + refLink('note', noteMap.get('手绘笔记示例'), '打开手绘笔记') + '</p>';
      await applyOwnedNoteContentChange(connection, {
        userId: owner,
        noteId: item.id,
        before: original || { title: item.title, type: 'html', content: '' },
        after: { type: 'html', content: sanitizePersistedNoteContent(body, 'html', 'visitor-v2') },
        snapshotReason: 'visitor_refresh',
      });
    }
    // Preserve the drawing scene; pinning and tags are metadata only.
    await connection.query('UPDATE note SET is_top=?, update_time=update_time WHERE id=? AND create_by=?', [
      definitions.pinnedNotes.includes(item.title) ? 1 : 0,
      item.id,
      owner,
    ]);
    const chosen = definitions.noteThemes[item.title];
    const oldTags = snapshot.tables.resource_tag_relations
      .filter((r) => r.resource_type === 'note' && String(r.resource_id) === String(item.id))
      .map((r) => String(r.tag_id))
      .filter((id) => active(snapshot.tables.tag).some((t) => String(t.id) === id));
    if (oldTags.length)
      await batchWriteResourceTags(connection, {
        userId: owner,
        items: [{ type: 'note', id: item.id }],
        tagIds: oldTags,
        action: 'remove',
      });
    if (chosen.length)
      await batchWriteResourceTags(connection, {
        userId: owner,
        items: [{ type: 'note', id: item.id }],
        tagIds: chosen.map((name) => tags[name]),
        action: 'add',
      });
    const refs = [{ resourceType: 'note', resourceId: String(item.id) }];
    if (definitions.pendingNotes.includes(item.title))
      await enqueueResources(connection, { userId: owner, items: refs, source: 'manual' });
    else await removeInboxRelations(connection, { userId: owner, items: refs });
    await syncNoteImageReferences(connection, item.id);
  }
  const folderIds = {};
  for (const [key, name, parent] of definitions.folders) {
    const parentId = parent ? folderIds[parent] : null;
    const matches = active(snapshot.tables.folders).filter(
      (f) => f.name === name && String(f.parent_id || '') === String(parentId || ''),
    );
    if (matches.length > 1) throw exampleError('VISITOR_FOLDER_AMBIGUOUS');
    folderIds[key] = matches[0]
      ? String(matches[0].id)
      : (await createOwnedCloudFolder({ userId: owner, name, parentId, database: connection })).id;
  }
  for (const file of plan.files)
    if (file.placement) {
      await connection.query('UPDATE files SET folder_id=? WHERE id=? AND create_by=? AND del_flag=0', [
        folderIds[file.placement[0]],
        file.id,
        owner,
      ]);
      await batchWriteResourceTags(connection, {
        userId: owner,
        items: [{ type: 'file', id: file.id }],
        tagIds: [tags[file.placement[1]]],
        action: 'add',
      });
    }
  // Only remove emptied former folders. Unknown content and non-empty descendants stay in place.
  for (const folder of active(snapshot.tables.folders).reverse())
    if (!Object.values(folderIds).includes(String(folder.id))) {
      const [[counts]] = await connection.query(
        'SELECT (SELECT COUNT(*) FROM files WHERE create_by=? AND folder_id=? AND del_flag=0)+(SELECT COUNT(*) FROM folders WHERE create_by=? AND parent_id=? AND del_flag=0) AS total',
        [owner, folder.id, owner, folder.id],
      );
      if (Number(counts.total) === 0)
        await deleteEmptyOwnedCloudFolder({ userId: owner, id: folder.id, database: connection });
    }
  const listIds = [];
  for (const name of definitions.lists) {
    const existingList = unique(snapshot.tables.todo_lists, name, 'name');
    listIds.push(existingList ? String(existingList.id) : (await saveTodoList(connection, owner, { name })).id);
  }
  const rolling = [];
  for (const item of plan.todos) {
    const old = snapshot.tables.todo_items.find((r) => String(r.id) === String(item.id));
    if (old && (old.series_id || old.status !== 'pending' || Number(old.plan_version || 1) !== 1))
      throw exampleError('VISITOR_TODO_REUSE_UNSAFE');
    const entry = {
      key: item.key,
      type: 'todo',
      id: item.id,
      offsets: { due_at: item.offset, start_at: null, completed_at: item.status === 'completed' ? item.offset : null },
    };
    const values = rollingValues(entry, date);
    const resourceRefs = item.note ? [{ type: 'note', id: noteMap.get(item.note) }] : [];
    const todo = {
      title: item.title,
      description: '游客教学示例。日期每日滚动，仅用于浏览，不发送提醒。',
      priority: item.priority,
      dueAt: values.due_at,
      reminder: null,
      recurrence: null,
      listId: item.list === null ? null : listIds[item.list],
      tagIds: [tags[item.tag]],
      resourceRefs,
      checklist: ['reading', 'summary'].includes(item.key)
        ? [
            { id: `${item.key}-1`, text: '打开相关资料', done: true },
            { id: `${item.key}-2`, text: '写下一个可执行的结论', done: false },
          ]
        : [],
    };
    if (item.id) await updateTodo(connection, owner, item.id, todo);
    else
      item.id = (await createTodo(connection, owner, todo, { invalidateSearch: false, suppressUserRewards: true })).id;
    entry.id = String(item.id);
    // Demo status is installation data, not an actual completion/reward event.
    await connection.query('UPDATE todo_items SET ?,status=? WHERE id=? AND user_id=?', [
      values,
      item.status,
      item.id,
      owner,
    ]);
    await writeTodoOrganization(connection, owner, [item.id], todo);
    entry.expected = exampleHash(await readRollingObject(connection, owner, entry));
    rolling.push(entry);
  }
  const projectKeys = ['research-interviews', 'learning-markdown', 'writing-weekly-report'];
  const projects = [];
  for (const [index, key] of projectKeys.entries()) {
    const id = workshopId(key),
      project = snapshot.tables.toolbox_workspaces.find((r) => r.id === id && r.status === 'active');
    if (!project) throw exampleError('VISITOR_PROJECT_MISSING');
    const entry = { key, type: 'project', id, offsets: { target_date: [3, 0, 7][index] } };
    const actions = snapshot.tables.toolbox_workspace_items
      .filter((r) => r.workspace_id === id && r.lane === 'action' && ['open', 'in_progress'].includes(r.status))
      .sort((a, b) => Number(a.position) - Number(b.position) || String(a.id).localeCompare(String(b.id)));
    if (!actions.length) throw exampleError('VISITOR_PROJECT_ACTION_MISSING');
    const action = {
      key: `${key}-action`,
      type: 'action',
      id: String(actions[0].id),
      offsets: { due_on: [0, 0, 3][index] },
    };
    await connection.query('UPDATE toolbox_workspace_items SET ?,updated_at=NOW() WHERE id=? AND user_id=?', [
      rollingValues(action, date),
      action.id,
      owner,
    ]);
    action.expected = exampleHash(await readRollingObject(connection, owner, action));
    rolling.push(action);
    await connection.query('UPDATE toolbox_workspaces SET ?,board_version=board_version+1 WHERE id=? AND user_id=?', [
      rollingValues(entry, date),
      id,
      owner,
    ]);
    entry.expected = exampleHash(await readRollingObject(connection, owner, entry));
    rolling.push(entry);
    projects.push(id);
  }
  const manifest = {
    version: VISITOR_EXAMPLE_VERSION,
    rolling,
    notes: plan.notes.map((n) => ({ id: String(n.id), title: n.title })),
    files: plan.files.filter((f) => f.placement).map((f) => ({ id: f.id, title: f.name })),
    projects,
    images: images.map(({ key, locator, sha256 }) => ({ key, locator, sha256 })),
  };
  await connection.query(
    'INSERT INTO visitor_example_maintenance (user_id,version,enabled,manifest_json,last_success_date) VALUES (?,?,1,?,?)',
    [owner, VISITOR_EXAMPLE_VERSION, JSON.stringify(manifest), date],
  );
  return { manifest, plan };
}

const rowKey = (table, row) => SNAPSHOT_TABLES[table][1].map((key) => String(row[key])).join('|');
export function visitorChanges(before, after) {
  const changes = [];
  for (const table of Object.keys(SNAPSHOT_TABLES)) {
    const old = new Map(before.tables[table].map((row) => [rowKey(table, row), row]));
    const next = new Map(after.tables[table].map((row) => [rowKey(table, row), row]));
    for (const key of new Set([...old.keys(), ...next.keys()]))
      if (exampleHash(old.get(key) || null) !== exampleHash(next.get(key) || null))
        changes.push({ table, key, before: old.get(key) || null, after: next.get(key) || null });
  }
  return changes;
}
export function verifyVisitorRestore(current, changes, manifest) {
  const dynamic = new Map(
    manifest.rolling.map((e) => [
      `${{ todo: 'todo_items', project: 'toolbox_workspaces', action: 'toolbox_workspace_items' }[e.type]}:${e.id}`,
      e.expected,
    ]),
  );
  for (const change of changes) {
    if (
      !SNAPSHOT_TABLES[change.table] ||
      [change.before, change.after]
        .filter(Boolean)
        .some((row) => String(row[SNAPSHOT_TABLES[change.table][0]]) !== String(current.owner))
    )
      throw exampleError('VISITOR_RESTORE_INVALID');
    const row = current.tables[change.table].find((r) => rowKey(change.table, r) === change.key) || null;
    const expected = dynamic.get(`${change.table}:${change.after?.id}`) || exampleHash(change.after);
    if (exampleHash(row) !== expected) throw exampleError('VISITOR_RESTORE_CONFLICT');
  }
  // Reject additions to managed objects/containers, including new references and children.
  const created = new Map(changes.filter((c) => !c.before && c.after).map((c) => [`${c.table}:${c.after.id}`, c]));
  for (const row of current.tables.resource_tag_relations)
    if (
      created.has(`tag:${row.tag_id}`) &&
      !changes.some((c) => c.table === 'resource_tag_relations' && c.key === rowKey(c.table, row))
    )
      throw exampleError('VISITOR_RESTORE_CONFLICT');
  for (const row of current.tables.files)
    if (
      created.has(`folders:${row.folder_id}`) &&
      !changes.some((c) => c.table === 'files' && c.key === rowKey(c.table, row))
    )
      throw exampleError('VISITOR_RESTORE_CONFLICT');
  for (const row of current.tables.folders)
    if (
      created.has(`folders:${row.parent_id}`) &&
      !changes.some((c) => c.table === 'folders' && c.key === rowKey(c.table, row))
    )
      throw exampleError('VISITOR_RESTORE_CONFLICT');
  for (const row of current.tables.todo_items)
    if (
      created.has(`todo_lists:${row.list_id}`) &&
      !changes.some((c) => c.table === 'todo_items' && c.key === rowKey(c.table, row))
    )
      throw exampleError('VISITOR_RESTORE_CONFLICT');
  for (const row of current.tables.todo_tag_relations)
    if (
      created.has(`tag:${row.tag_id}`) &&
      !changes.some((c) => c.table === 'todo_tag_relations' && c.key === rowKey(c.table, row))
    )
      throw exampleError('VISITOR_RESTORE_CONFLICT');
  for (const row of current.tables.note) {
    if (
      !changes.some((c) => c.table === 'note' && c.key === String(row.id)) &&
      extractOwnedResourceRefs({ content: row.content, type: row.type }).some(
        (ref) => ref.type === 'note' && created.has(`note:${ref.id}`),
      )
    )
      throw exampleError('VISITOR_RESTORE_CONFLICT');
  }
  for (const row of current.tables.todo_resource_refs)
    if (
      row.target_type === 'note' &&
      created.has(`note:${row.target_id}`) &&
      !changes.some((c) => c.table === 'todo_resource_refs' && c.key === rowKey(c.table, row))
    )
      throw exampleError('VISITOR_RESTORE_CONFLICT');
  for (const row of current.tables.note)
    if (created.has(`note:${row.parent_id}`)) throw exampleError('VISITOR_RESTORE_CONFLICT');
}
const sqlRow = (row) =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key !== 'active_name')
      .map(([key, value]) => [
        key,
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && /(?:_at|_time|_date)$/.test(key)
          ? new Date(value)
          : value && typeof value === 'object' && !(value instanceof Date)
            ? JSON.stringify(value)
            : value,
      ]),
  );
export async function restoreVisitorV2(connection, { owner, changes, manifest }) {
  const current = await readVisitorV2Snapshot(connection, owner, true);
  verifyVisitorRestore(current, changes, manifest);
  const newNotes = changes.filter((c) => c.table === 'note' && !c.before && c.after).map((c) => String(c.after.id));
  if (newNotes.length) {
    const [links] = await connection.query(
      "SELECT id FROM toolbox_workspace_resources WHERE user_id=? AND resource_type='note' AND resource_id IN (?) FOR UPDATE",
      [owner, newNotes],
    );
    if (links.length) throw exampleError('VISITOR_RESTORE_CONFLICT');
  }
  // Restore existing objects before their relations. Keep monotonic note revisions and historical snapshots.
  for (const change of changes.filter((c) => c.before)) {
    const [ownerField, keys] = SNAPSHOT_TABLES[change.table];
    const where = keys.map((key) => `${key}=?`).join(' AND ');
    const values = keys.map((key) => change.before[key]);
    if (change.table === 'note') {
      const existing = current.tables.note.find((r) => String(r.id) === String(change.before.id));
      if (existing.content !== change.before.content || existing.type !== change.before.type)
        await applyOwnedNoteContentChange(connection, {
          userId: owner,
          noteId: existing.id,
          before: existing,
          after: { content: change.before.content, type: change.before.type },
          snapshotReason: 'visitor_restore',
        });
      await connection.query('UPDATE note SET is_top=?,parent_id=?,sort=? WHERE id=? AND create_by=?', [
        change.before.is_top,
        change.before.parent_id,
        change.before.sort,
        change.before.id,
        owner,
      ]);
    } else if (change.after)
      await connection.query(`UPDATE ${change.table} SET ? WHERE ${ownerField}=? AND ${where}`, [
        sqlRow({
          ...change.before,
          ...(change.table === 'toolbox_workspaces'
            ? {
                board_version:
                  Number(current.tables.toolbox_workspaces.find((r) => r.id === change.before.id).board_version) + 1,
              }
            : {}),
        }),
        owner,
        ...values,
      ]);
    else await connection.query(`INSERT INTO ${change.table} SET ?`, [sqlRow(change.before)]);
  }
  // Relations first. New resources go to their recoverable deleted state, never hard-delete assets.
  const newRows = changes
    .filter((c) => !c.before && c.after)
    .sort((a, b) => Number(SNAPSHOT_TABLES[a.table][1][0] === 'id') - Number(SNAPSHOT_TABLES[b.table][1][0] === 'id'));
  for (const change of newRows) {
    const [ownerField, keys] = SNAPSHOT_TABLES[change.table];
    const where = keys.map((key) => `${key}=?`).join(' AND '),
      values = keys.map((key) => change.after[key]);
    if (change.table === 'note') {
      await deleteOwnedNoteSubtrees(connection, {
        userId: owner,
        items: [{ id: String(change.after.id), expectedDescendantCount: 0 }],
      });
    } else if (['tag', 'folders', 'files', 'todo_items'].includes(change.table)) {
      await connection.query(
        `UPDATE ${change.table} SET del_flag=1${['todo_items', 'files'].includes(change.table) ? ',deleted_at=NOW()' : ''} WHERE ${ownerField}=? AND ${where}`,
        [owner, ...values],
      );
    } else await connection.query(`DELETE FROM ${change.table} WHERE ${ownerField}=? AND ${where}`, [owner, ...values]);
  }
  await connection.query('UPDATE visitor_example_maintenance SET enabled=0,manifest_json=? WHERE user_id=?', [
    JSON.stringify({ ...manifest, restored: true }),
    owner,
  ]);
}

/** Reviewable inventory; no writes or AI calls. Snapshot/receipt files contain the details. */
export async function describeVisitorV2(db, snapshot) {
  const plan = planVisitorV2(snapshot);
  const actions = [
    ...plan.notes.map((n) => ({
      type: 'note',
      id: n.id,
      title: n.title,
      action: n.id ? 'modify' : 'create',
      pinned: definitions.pinnedNotes.includes(n.title),
      tags: definitions.noteThemes[n.title],
      pending: definitions.pendingNotes.includes(n.title),
    })),
    ...plan.files.map((f) => ({
      type: 'file',
      id: f.id,
      title: f.name,
      action: f.placement ? 'move-and-tag' : 'retain',
      destination: f.placement?.[0] || null,
    })),
    ...plan.todos.map((t) => ({
      type: 'todo',
      id: t.id,
      key: t.key,
      title: t.title,
      action: t.id ? 'modify' : 'create',
      retainedId: t.retainedId,
    })),
    ...active(snapshot.tables.todo_items)
      .filter((t) => !plan.todos.some((p) => String(p.id) === String(t.id)))
      .map((t) => ({ type: 'todo', id: String(t.id), title: t.title, action: 'retain' })),
  ];
  const references = [];
  for (const n of plan.notes.filter((n) => n.id)) {
    const original = snapshot.tables.note.find((r) => String(r.id) === String(n.id));
    const refs = extractOwnedResourceRefs({ content: original.content, type: original.type });
    const valid = await validateOwnedResourceRefs(db, { userId: snapshot.owner, refs });
    for (const ref of refs)
      references.push({
        noteId: n.id,
        ...ref,
        available: valid.some((v) => v.type === ref.type && String(v.id) === String(ref.id)),
      });
  }
  return {
    ...plan,
    actions,
    references,
    folders: definitions.folders.map(([key, name, parent]) => ({ key, name, parent })),
    folderCleanup: 'Only empty former folders without children are removed; others are retained.',
  };
}
