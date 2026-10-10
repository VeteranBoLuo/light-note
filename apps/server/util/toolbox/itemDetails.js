import { resolvePersonalKnowledgeResourceMetadata } from '../personalKnowledgeSearch.js';
import { toolboxError } from './errors.js';

const empty = () => ({ evidence: [], conclusionStatus: null, conclusionNote: null, todoTitle: '' });
const key = (ref) => `${ref.type}:${ref.resourceId || ref.id}`;
export function readItemDetails(row) {
  const saved = typeof row.details_json === 'string' ? JSON.parse(row.details_json) : row.details_json;
  return { details: { ...empty(), ...saved }, todoId: row.linked_todo_id || null };
}
function invalid() {
  throw toolboxError('BOARD_INVALID_DETAILS', '请检查关联资料与结论状态', 400);
}
function identifier(value) {
  if (typeof value !== 'string' || !value || value.length > 64) invalid();
  return value;
}

/** Client titles/versions are never authoritative. Existing snapshots survive source deletion. */
export async function prepareItemDetails(database, userId, workspaceId, item, command) {
  const input = command.details;
  if (!input || !Array.isArray(input.evidence) || input.evidence.length > 20) invalid();
  if (![null, 'tentative', 'confirmed', 'review'].includes(input.conclusionStatus)) invalid();
  const seen = new Set();
  for (const ref of input.evidence) {
    if (!ref || !['note', 'bookmark', 'file'].includes(ref.type)) invalid();
    identifier(ref.resourceId);
    if (seen.has(key(ref)) || typeof ref.explanation !== 'string' || ref.explanation.length > 1000) invalid();
    seen.add(key(ref));
  }
  const previous = item.details || empty();
  const noteId = input.conclusionNoteId === null ? null : identifier(input.conclusionNoteId);
  const todoId = command.todoId === null ? null : identifier(command.todoId);
  if (todoId && item.lane !== 'action') invalid();
  const refs = input.evidence.map((ref) => ({ type: ref.type, id: ref.resourceId }));
  if (noteId) refs.push({ type: 'note', id: noteId });
  const current = new Map(
    (
      await resolvePersonalKnowledgeResourceMetadata({
        userId,
        resourceRefs: refs,
        database,
        lockForShare: true,
      })
    ).map((ref) => [key(ref), ref]),
  );
  const [projectRefs] = input.evidence.length
    ? await database.query(
        'SELECT resource_type, resource_id FROM toolbox_workspace_resources WHERE workspace_id = ? AND user_id = ? LOCK IN SHARE MODE',
        [workspaceId, userId],
      )
    : [[]];
  const projectKeys = new Set(projectRefs.map((ref) => `${ref.resource_type}:${ref.resource_id}`));
  const unavailable = () => {
    throw toolboxError('BOARD_REFERENCE_UNAVAILABLE', '所选资料或待办不可访问，请重新选择', 409);
  };
  const evidence = input.evidence.map((ref) => {
    const old = previous.evidence.find((entry) => key(entry) === key(ref));
    const live = current.get(key(ref));
    if ((!old || ref.refresh === true) && (!live || !projectKeys.has(key(ref)))) unavailable();
    const snapshot =
      old && ref.refresh !== true
        ? old
        : { type: ref.type, resourceId: ref.resourceId, title: live.title, version: live.version };
    return {
      type: snapshot.type,
      resourceId: snapshot.resourceId,
      title: snapshot.title,
      version: snapshot.version,
      explanation: ref.explanation.trim(),
    };
  });
  let conclusionNote = null;
  if (noteId) {
    const old = previous.conclusionNote;
    const live = current.get(`note:${noteId}`);
    if (old?.id !== noteId && !live) unavailable();
    conclusionNote = old?.id === noteId ? old : { id: noteId, title: live.title, version: live.version };
  }
  let todoTitle = '';
  if (todoId) {
    const todos = await readLinkedTodos(database, userId, [todoId], true);
    if (!todos.has(todoId) && item.todoId !== todoId) unavailable();
    todoTitle = todos.get(todoId)?.title || previous.todoTitle;
  }
  return { details: { evidence, conclusionStatus: input.conclusionStatus, conclusionNote, todoTitle }, todoId };
}

export async function readLinkedTodos(database, userId, ids, lock = false) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const [rows] = await database.query(
    `SELECT id, title, status, DATE_FORMAT(COALESCE(due_at, occurrence_date), '%Y-%m-%d') AS due_on, completed_at
       FROM todo_items WHERE user_id = ? AND del_flag = 0 AND id IN (?)${lock ? ' LOCK IN SHARE MODE' : ''}`,
    [userId, unique],
  );
  return new Map(
    rows.map((row) => [
      String(row.id),
      {
        id: String(row.id),
        title: row.title,
        available: true,
        status: row.status,
        dueOn: row.due_on || null,
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      },
    ]),
  );
}

export async function hydrateItemDetails(database, userId, items) {
  const refs = items.flatMap((item) => [
    ...(item.details?.evidence || []).map((ref) => ({ type: ref.type, id: ref.resourceId })),
    ...(item.details?.conclusionNote ? [{ type: 'note', id: item.details.conclusionNote.id }] : []),
  ]);
  const unique = [...new Map(refs.map((ref) => [key(ref), ref])).values()];
  // Resource resolver caps each batch; project cards may reference more than 100 distinct notes.
  const metadata = [];
  for (let start = 0; start < unique.length; start += 100)
    metadata.push(
      ...(await resolvePersonalKnowledgeResourceMetadata({
        userId,
        resourceRefs: unique.slice(start, start + 100),
        database,
      })),
    );
  const available = new Map(metadata.map((ref) => [key(ref), ref]));
  const todos = await readLinkedTodos(
    database,
    userId,
    items.map((item) => item.todoId),
  );
  const resolve = (ref, type, id) => {
    const current = available.get(`${type}:${id}`);
    return {
      ...ref,
      available: Boolean(current),
      currentTitle: current?.title || ref.title,
      changed: Boolean(current && current.version !== ref.version),
    };
  };
  return items.map((item) => {
    const details = item.details || empty();
    const linkedTodo = item.todoId
      ? todos.get(item.todoId) || {
          id: item.todoId,
          title: details.todoTitle,
          available: false,
          status: null,
          dueOn: null,
          completedAt: null,
        }
      : null;
    return {
      ...item,
      details: {
        ...details,
        evidence: details.evidence.map((ref) => resolve(ref, ref.type, ref.resourceId)),
        conclusionNote: details.conclusionNote
          ? resolve(details.conclusionNote, 'note', details.conclusionNote.id)
          : null,
      },
      linkedTodo,
      ...(linkedTodo && item.status !== 'archived'
        ? {
            status: linkedTodo.status === 'completed' ? 'done' : 'open',
            dueOn: linkedTodo.dueOn,
            completedAt: linkedTodo.completedAt,
          }
        : {}),
    };
  });
}

// All overview/brief counts use the same live task authority, including deleted and recurring instances.
export const boardTodoJoin = (item = 'item', todo = 'linked_todo') =>
  `LEFT JOIN todo_items ${todo} ON ${todo}.id = ${item}.linked_todo_id AND ${todo}.user_id = ${item}.user_id AND ${todo}.del_flag = 0`;
export const boardOpenSql = (item = 'item', todo = 'linked_todo') =>
  `(${item}.lane <> 'knowledge' AND ${item}.status <> 'archived' AND ((${item}.linked_todo_id IS NULL AND ${item}.status IN ('open','in_progress')) OR (${item}.lane = 'action' AND ${todo}.status = 'pending')))`;
export const boardDoneSql = (item = 'item', todo = 'linked_todo') =>
  `(${item}.lane = 'action' AND ${item}.status <> 'archived' AND ((${item}.linked_todo_id IS NULL AND ${item}.status = 'done') OR ${todo}.status = 'completed'))`;
export const boardDueSql = (item = 'item', todo = 'linked_todo') =>
  `(CASE WHEN ${item}.linked_todo_id IS NULL THEN ${item}.due_on ELSE DATE(COALESCE(${todo}.due_at, ${todo}.occurrence_date)) END)`;
