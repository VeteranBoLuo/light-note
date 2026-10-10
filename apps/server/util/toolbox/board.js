import crypto from 'node:crypto';
import pool from '../../db/index.js';
import { applyBoardOperation } from '@lightnote/shared/workspace-board';
import { getToolboxWorkspace } from './workspace.js';
import { toolboxError } from './errors.js';
import { readItemDetails, prepareItemDetails, hydrateItemDetails, readLinkedTodos } from './itemDetails.js';
const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
const iso = (x) => (x ? new Date(x).toISOString() : null);
export function boardItem(row) {
  return {
    ...readItemDetails(row),
    id: row.id,
    lane: row.lane,
    title: row.title,
    content: row.content || '',
    status: row.status,
    position: Number(row.position),
    dueOn: row.due_on
      ? typeof row.due_on === 'string'
        ? row.due_on.slice(0, 10)
        : `${row.due_on.getFullYear()}-${String(row.due_on.getMonth() + 1).padStart(2, '0')}-${String(row.due_on.getDate()).padStart(2, '0')}`
      : null,
    createdAt: iso(row.create_time),
    updatedAt: iso(row.updated_at),
    completedAt: iso(row.completed_at),
    sourceItemId: row.source_item_id || null,
    sourceTitle: row.source_title || '',
    sourceContent: row.source_content || '',
  };
}
export async function readBoardItem({ userId, workspaceId, itemId, database = pool }) {
  const [rows] = await database.query(
    'SELECT * FROM toolbox_workspace_items WHERE workspace_id = ? AND user_id = ? AND id = ?',
    [workspaceId, userId, itemId],
  );
  if (!rows[0]) throw toolboxError('BOARD_ITEM_UNAVAILABLE', '来源已不可访问', 404);
  return (await hydrateItemDetails(database, userId, [boardItem(rows[0])]))[0];
}
export async function operateBoard({ userId, workspaceId, input, database = pool, legacy = false }) {
  if (!userId || !workspaceId) throw toolboxError('BOARD_OWNER_REQUIRED', '缺少项目身份', 401);
  if (
    !input ||
    typeof input.requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{8,64}$/.test(input.requestId) ||
    (!legacy && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0))
  )
    throw toolboxError('BOARD_INVALID_REQUEST', '无效看板请求', 400);
  const command = input.command;
  if (!command || typeof command.type !== 'string') throw toolboxError('BOARD_INVALID_REQUEST', '无效看板请求', 400);
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ command, expectedVersion: input.expectedVersion }))
    .digest('hex');
  const connection = typeof database.getConnection === 'function' ? await database.getConnection() : database;
  let outcome;
  try {
    if (connection.beginTransaction) await connection.beginTransaction();
    const [projects] = await connection.query(
      'SELECT * FROM toolbox_workspaces WHERE id = ? AND user_id = ? FOR UPDATE',
      [workspaceId, userId],
    );
    const project = projects[0];
    if (!project) throw toolboxError('BOARD_NOT_FOUND', '项目不可访问', 404);
    const [receipts] = await connection.query(
      'SELECT * FROM toolbox_board_operations WHERE workspace_id = ? AND user_id = ? AND request_id = ?',
      [workspaceId, userId, input.requestId],
    );
    if (receipts[0]) {
      if (receipts[0].request_hash !== hash) throw toolboxError('BOARD_REQUEST_REUSED', '请求标识已使用', 409);
      outcome = {
        undoId: command.type === 'undo' ? null : input.requestId,
        version: Number(receipts[0].after_version),
        focusItemId: receipts[0].focus_item_id,
      };
    } else {
      if (project.status === 'archived') throw toolboxError('BOARD_READ_ONLY', '项目已归档', 409);
      const version = Number(project.board_version || 0);
      if (!legacy && version !== input.expectedVersion)
        throw toolboxError('BOARD_VERSION_CONFLICT', '看板已在其他位置修改，请刷新后重试', 409);
      const [raw] = await connection.query(
        'SELECT * FROM toolbox_workspace_items WHERE workspace_id = ? AND user_id = ? FOR UPDATE',
        [workspaceId, userId],
      );
      const before = raw.map(boardItem);
      const now = new Date().toISOString();
      let after,
        focusItemId = null;
      if (command?.type === 'undo') {
        const [prior] = await connection.query(
          'SELECT * FROM toolbox_board_operations WHERE workspace_id = ? AND user_id = ? AND request_id = ?',
          [workspaceId, userId, command.undoId],
        );
        if (!prior[0] || Number(prior[0].after_version) !== version)
          throw toolboxError('BOARD_VERSION_CONFLICT', '看板已变化，无法撤销', 409);
        const previous = parse(prior[0].before_json);
        const affected = new Set(parse(prior[0].after_json).map((item) => item.id));
        after = before.map((item) =>
          affected.has(item.id)
            ? previous.find((x) => x.id === item.id) || { ...item, status: 'archived', updatedAt: now }
            : item,
        );
      } else if (command.type === 'details' || command.type === 'createTodo') {
        const item = before.find((row) => row.id === command.itemId && row.status !== 'archived');
        if (!item) throw toolboxError('BOARD_ITEM_UNAVAILABLE', '事项不可访问', 404);
        after = structuredClone(before);
        const target = after.find((row) => row.id === item.id);
        if (command.type === 'details') {
          const prepared = await prepareItemDetails(connection, userId, workspaceId, item, command);
          // Apply ordinary field validation without allowing a bound task's date to diverge.
          if (item.todoId && command.dueOn !== undefined)
            throw toolboxError('BOARD_TODO_AUTHORITY', '请在待办中修改日期', 409);
          const edited = applyBoardOperation(before, { ...command, type: 'edit' }, { id: '', now });
          Object.assign(
            target,
            edited.items.find((row) => row.id === item.id),
            prepared,
            { updatedAt: now },
          );
          if (item.todoId && !prepared.todoId)
            Object.assign(target, { status: 'open', completedAt: null, dueOn: null });
        } else {
          if (item.lane !== 'action' || item.todoId)
            throw toolboxError('BOARD_TODO_ALREADY_BOUND', '此行动已有待办或不是行动卡', 409);
          const { createTodo } = await import('../services/todoService.js');
          const result = await createTodo(connection, userId, {
            title: item.title.slice(0, 200),
            description: item.content,
            dueAt: item.dueOn ? `${item.dueOn} 23:59:59` : null,
          });
          Object.assign(target, {
            todoId: result.id,
            details: { ...item.details, todoTitle: item.title.slice(0, 200) },
            updatedAt: now,
          });
        }
        focusItemId = item.id;
      } else {
        const target = before.find((row) => row.id === command.itemId);
        let operationItems = before;
        if (target?.todoId) {
          if (
            (command.type === 'status' && command.status !== 'archived') ||
            (command.type === 'edit' && command.dueOn !== undefined) ||
            (legacy && (command.status !== undefined || command.lane !== undefined)) ||
            (command.type === 'convert' && command.lane !== 'knowledge')
          ) {
            throw toolboxError('BOARD_TODO_AUTHORITY', '已绑定待办，请在待办中修改状态和日期', 409);
          }
          if (['convert', 'repeat'].includes(command.type)) {
            const todo = (await readLinkedTodos(connection, userId, [target.todoId], true)).get(target.todoId);
            if (todo?.status !== 'completed')
              throw toolboxError('BOARD_TODO_NOT_COMPLETED', '请先在待办中完成此行动', 409);
            operationItems = before.map((item) => (item.id === target.id ? { ...item, status: 'done' } : item));
          }
        }
        try {
          if (legacy && command.type === 'edit') {
            ({ items: after, focusItemId } = applyBoardOperation(operationItems, command, {
              id: crypto.randomUUID(),
              now,
            }));
            const item = after.find((x) => x.id === command.itemId);
            if (command.lane !== undefined) {
              if (!['inbox', 'knowledge', 'action'].includes(command.lane)) throw Error('lane');
              item.lane = command.lane;
            }
            if (command.status !== undefined) {
              if (!['open', 'in_progress', 'done', 'archived'].includes(command.status)) throw Error('status');
              item.status = command.status;
            }
            if (command.position !== undefined) {
              if (!Number.isInteger(command.position) || command.position < 0 || command.position > 100000)
                throw Error('position');
              item.position = command.position;
            }
            if (item.lane === 'knowledge' && item.status !== 'archived') item.status = 'done';
            item.completedAt = item.status === 'done' ? item.completedAt || now : null;
          } else
            ({ items: after, focusItemId } = applyBoardOperation(operationItems, command, {
              id: crypto.randomUUID(),
              now,
            }));
        } catch (error) {
          throw toolboxError(error.code || 'BOARD_INVALID_OPERATION', '看板操作无效，请检查内容与状态', 400);
        }
        if (operationItems !== before) {
          const restored = after.find((item) => item.id === target.id);
          Object.assign(restored, { status: target.status, completedAt: target.completedAt });
        }
      }
      const changed = after.filter(
        (item) => JSON.stringify(item) !== JSON.stringify(before.find((x) => x.id === item.id)),
      );
      for (const item of changed) {
        await connection.query(
          `INSERT INTO toolbox_workspace_items (id,workspace_id,user_id,lane,title,content,status,position,due_on,completed_at,create_time,updated_at,source_item_id,source_title,source_content,details_json,linked_todo_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE lane=VALUES(lane),title=VALUES(title),content=VALUES(content),status=VALUES(status),position=VALUES(position),due_on=VALUES(due_on),completed_at=VALUES(completed_at),updated_at=VALUES(updated_at),details_json=VALUES(details_json),linked_todo_id=VALUES(linked_todo_id)`,
          [
            item.id,
            workspaceId,
            userId,
            item.lane,
            item.title,
            item.content,
            item.status,
            item.position,
            item.dueOn,
            item.completedAt ? new Date(item.completedAt) : null,
            new Date(item.createdAt),
            new Date(now),
            item.sourceItemId,
            item.sourceTitle,
            item.sourceContent,
            item.details ? JSON.stringify(item.details) : null,
            item.todoId || null,
          ],
        );
      }
      await connection.query(
        'UPDATE toolbox_workspaces SET board_version = board_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [workspaceId, userId],
      );
      await connection.query(
        'INSERT INTO toolbox_board_operations (workspace_id,user_id,request_id,request_hash,before_json,after_json,after_version,focus_item_id) VALUES (?,?,?,?,?,?,?,?)',
        [
          workspaceId,
          userId,
          input.requestId,
          hash,
          JSON.stringify(before.filter((item) => changed.some((row) => row.id === item.id))),
          JSON.stringify(changed),
          version + 1,
          focusItemId,
        ],
      );
      outcome = { undoId: command.type === 'undo' ? null : input.requestId, version: version + 1, focusItemId };
    }
    if (connection.commit) await connection.commit();
  } catch (error) {
    if (connection.rollback) await connection.rollback();
    throw error;
  } finally {
    if (connection !== database) connection.release();
  }
  const workspace = await getToolboxWorkspace({ userId, workspaceId, database });
  return {
    workspace,
    undoId: workspace.boardVersion === outcome.version ? outcome.undoId : null,
    focusItemId: outcome.focusItemId,
  };
}
