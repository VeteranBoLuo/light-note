// Explicit one-off maintenance: default is read-only. No changes to .env, existing content, or schema.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { visitorWorkshopExamples as examples } from './visitorWorkshopExamples.mjs';
const apply = process.argv.includes('--apply');
process.env.ALLOW_REMOTE_DATABASE_READS = apply ? 'false' : 'true';
process.env.ALLOW_REMOTE_DATABASE_WRITES = apply ? 'true' : 'false';
const { default: pool } = await import('../db/index.js');
const { resolvePersonalKnowledgeResourceMetadata } = await import('../util/personalKnowledgeSearch.js');
const { getToolboxWorkspace } = await import('../util/toolbox/workspace.js');
const stableId = (key) => {
  const h = crypto.createHash('sha256').update(`light-note:visitor-workshop:20260909:v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const now = new Date();
const at = (days) => new Date(now.getTime() + days * 86400000);
const day = (offset) => (offset == null ? null : at(offset).toISOString().slice(0, 10));
async function verifyProject(database, userId, workspaceId) {
  const project = await getToolboxWorkspace({ userId, workspaceId, database });
  assert.equal(project.items.length, 9);
  assert.equal(project.resources.length, 2);
  assert.equal(project.sessions.length, 3);
  assert.equal(project.completedItemCount, 1);
  assert.equal(project.openItemCount, 5);
  assert(project.resources.every((resource) => resource.available === true));
  assert(project.sessions.every((session) => session.summary.startsWith('【演示记录】')));
  for (const card of project.items) {
    if (!card.sourceItemId) continue;
    const source = project.items.find((candidate) => candidate.id === card.sourceItemId);
    assert(source, 'Source must belong to the same example project');
    assert.equal(card.sourceTitle, source.title);
    assert.equal(card.sourceContent, source.content);
  }
  return { items: project.items.length, resources: project.resources.length, sessions: project.sessions.length };
}
let connection;
try {
  connection = await pool.getConnection();
  if (apply) await connection.beginTransaction();
  const [visitors] = await connection.query(
    `SELECT id,role,del_flag FROM user WHERE role='visitor' ORDER BY del_flag ASC,create_time ASC LIMIT 1${apply ? ' FOR UPDATE' : ''}`,
  );
  assert.equal(visitors.length, 1);
  assert.equal(Number(visitors[0].del_flag), 0);
  const userId = visitors[0].id;
  const [notes] = await connection.query("SELECT id,title FROM note WHERE create_by=? AND del_flag='0'", [userId]);
  const output = [];
  for (const project of examples) {
    assert.equal(project.items.length, 9);
    assert.equal(project.sessions.length, 3);
    assert(project.title.length <= 120 && project.goal.length <= 1000);
    const id = stableId(project.key);
    const [existing] = await connection.query('SELECT user_id,title FROM toolbox_workspaces WHERE id=?', [id]);
    if (existing.length) {
      assert.equal(existing[0].user_id, userId);
      assert.equal(existing[0].title, project.title);
      const counts = await verifyProject(connection, userId, id);
      output.push({ title: project.title, status: 'already exists; verified', ...counts });
      continue;
    }
    const refs = project.resources.map((title) => {
      const matches = notes.filter((n) => n.title === title);
      assert.equal(matches.length, 1, `Material must resolve uniquely: ${title}`);
      return { type: 'note', id: matches[0].id };
    });
    const materials = await resolvePersonalKnowledgeResourceMetadata({
      userId,
      resourceRefs: refs,
      database: connection,
      lockForShare: apply,
    });
    assert.equal(materials.length, refs.length);
    const itemIds = project.items.map((_, i) => stableId(`${project.key}:item:${i}`));
    for (const item of project.items) {
      assert(item.title.length <= 255 && item.content.length <= 5000);
      if (item.source !== null) assert(project.items[item.source] && item.source >= 0);
    }
    if (apply) {
      await connection.query(
        `INSERT INTO toolbox_workspaces (id,user_id,kind,title,description,goal,status,target_date,next_step,create_time,updated_at,board_version) VALUES (?,?,?,?,?,?,'active',?,?,?,?,1)`,
        [
          id,
          userId,
          project.kind,
          project.title,
          project.description,
          project.goal,
          day(14),
          project.next,
          at(-7),
          now,
        ],
      );
      const positions = { inbox: 0, knowledge: 0, action: 0 };
      for (const [i, item] of project.items.entries()) {
        const source = item.source === null ? null : project.items[item.source];
        await connection.query(
          `INSERT INTO toolbox_workspace_items (id,workspace_id,user_id,lane,title,content,status,position,due_on,completed_at,create_time,updated_at,source_item_id,source_title,source_content) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            itemIds[i],
            id,
            userId,
            item.lane,
            item.title,
            item.content,
            item.status,
            positions[item.lane]++,
            day(item.due),
            item.status === 'done' ? at(-1) : null,
            at(-6),
            now,
            source ? itemIds[item.source] : null,
            source?.title || '',
            source?.content || '',
          ],
        );
      }
      for (const material of materials)
        await connection.query(
          'INSERT INTO toolbox_workspace_resources (workspace_id,user_id,resource_type,resource_id,resource_version,resource_title) VALUES (?,?,?,?,?,?)',
          [id, userId, material.type, material.id, material.version, material.title],
        );
      for (const [i, session] of project.sessions.entries())
        await connection.query(
          'INSERT INTO toolbox_workspace_sessions (id,workspace_id,user_id,summary,next_step,duration_minutes,create_time) VALUES (?,?,?,?,?,?,?)',
          [
            stableId(`${project.key}:session:${i}`),
            id,
            userId,
            `【演示记录】${session[0]}`,
            session[1],
            session[2],
            at(i - 3),
          ],
        );
      await verifyProject(connection, userId, id);
    }
    output.push({
      title: project.title,
      id,
      items: 9,
      resources: materials.length,
      sessions: 3,
      status: apply ? 'created' : 'ready',
    });
  }
  if (apply) await connection.commit();
  console.log(JSON.stringify({ mode: apply ? 'committed' : 'read-only preview', projects: output }, null, 2));
} catch (error) {
  if (apply && connection) await connection.rollback();
  console.error('Visitor examples failed:', error.code || error.message);
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
