import { describe, it, expect, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../personalKnowledgeSearch.js', () => ({
  resolvePersonalKnowledgeResourceMetadata: vi.fn().mockResolvedValue([]),
}));
const { operateBoard, readBoardItem } = await import('./board.js');
const { applyBoardOperation } = await import('@lightnote/shared/workspace-board');
const initial = {
  id: 'a',
  lane: 'inbox',
  title: 'Question',
  content: 'Evidence',
  status: 'open',
  position: 0,
  dueOn: '2026-09-08',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  completedAt: null,
  sourceItemId: null,
  sourceTitle: '',
  sourceContent: '',
};
const ctx = { id: 'new', now: '2026-09-09T00:00:00.000Z' };
function memory() {
  let rows = [],
    receipts = [],
    project = { id: 'w', user_id: 'u', kind: 'research', status: 'active', board_version: 0 },
    snapshot;
  let fail = false;
  const db = {
    beginTransaction: vi.fn(async () => {
      snapshot = structuredClone({ rows, receipts, project });
    }),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {
      ({ rows, receipts, project } = snapshot);
    }),
    release: vi.fn(),
    getConnection: async () => db,
    query: vi.fn(async (sql, p = []) => {
      if (sql.includes('FROM toolbox_workspaces'))
        return [[p[0] === 'w' && p[1] === 'u' ? structuredClone(project) : undefined].filter(Boolean)];
      if (sql.startsWith('SELECT * FROM toolbox_board_operations'))
        return [structuredClone(receipts.filter((x) => x.request_id === p[2] && x.user_id === p[1]))];
      if (sql.startsWith('SELECT * FROM toolbox_workspace_items'))
        return [
          structuredClone(
            rows.filter(
              (x) =>
                x.workspace_id === p[0] &&
                x.user_id === p[1] &&
                (!sql.includes('AND id = ?') || x.id === p[2]) &&
                (!sql.includes("status <> 'archived'") || x.status !== 'archived'),
            ),
          ),
        ];
      if (sql.startsWith('INSERT INTO toolbox_workspace_items')) {
        if (fail) throw Error('db failure');
        const keys = [
          'id',
          'workspace_id',
          'user_id',
          'lane',
          'title',
          'content',
          'status',
          'position',
          'due_on',
          'completed_at',
          'create_time',
          'updated_at',
          'source_item_id',
          'source_title',
          'source_content',
        ];
        const row = Object.fromEntries(keys.map((k, i) => [k, p[i]]));
        const old = rows.findIndex((x) => x.id === row.id);
        if (old >= 0) rows[old] = row;
        else rows.push(row);
        return [{}];
      }
      if (sql.startsWith('UPDATE toolbox_workspaces')) {
        project.board_version++;
        return [{}];
      }
      if (sql.startsWith('INSERT INTO toolbox_board_operations')) {
        receipts.push({
          workspace_id: p[0],
          user_id: p[1],
          request_id: p[2],
          request_hash: p[3],
          before_json: p[4],
          after_json: p[5],
          after_version: p[6],
          focus_item_id: p[7],
        });
        return [{}];
      }
      return [[]];
    }),
  };
  return {
    db,
    fail: () => {
      fail = true;
    },
    version: () => project.board_version,
  };
}
const invoke = (db, version, requestId, command) =>
  operateBoard({
    database: db,
    userId: 'u',
    workspaceId: 'w',
    input: { requestId, expectedVersion: version, command },
  });
describe('看板业务流转', () => {
  it.each([
    ['inbox', 'knowledge', 'move'],
    ['knowledge', 'inbox', 'move'],
    ['inbox', 'action', 'derive'],
    ['knowledge', 'action', 'derive'],
    ['action', 'knowledge', 'result'],
    ['action', 'inbox', 'move'],
  ])('%s → %s (%s)', (from, to, mode) => {
    const item = { ...initial, lane: from };
    const result = applyBoardOperation([item], { type: 'convert', itemId: 'a', lane: to, title: 'Result' }, ctx);
    if (mode === 'move') {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'a',
        lane: to,
        status: to === 'knowledge' ? 'done' : 'open',
        content: 'Evidence',
        dueOn: '2026-09-08',
      });
    } else {
      expect(result.items).toHaveLength(2);
      expect(result.items[1]).toMatchObject({
        sourceItemId: 'a',
        sourceTitle: 'Question',
        sourceContent: 'Evidence',
        lane: to,
        dueOn: null,
      });
      expect(result.items[0].status).toBe(mode === 'result' ? 'done' : 'open');
    }
    expect(item).toEqual({ ...initial, lane: from });
  });
  it('排序必须完整，且不改变内容或状态', () => {
    const items = [initial, { ...initial, id: 'b', position: 1 }];
    expect(() => applyBoardOperation(items, { type: 'reorder', lane: 'inbox', ids: ['a', 'a'] }, ctx)).toThrow();
    const sorted = applyBoardOperation(items, { type: 'reorder', lane: 'inbox', ids: ['b', 'a'] }, ctx);
    expect(sorted.items.find((x) => x.id === 'b')).toMatchObject({ position: 0, title: 'Question', status: 'open' });
  });
  it('重复复习保留旧记录及来源', () => {
    const item = { ...initial, lane: 'action', status: 'done' };
    const result = applyBoardOperation([item], { type: 'repeat', itemId: 'a' }, ctx);
    expect(result.items[0]).toEqual(item);
    expect(result.items[1]).toMatchObject({ status: 'open', sourceItemId: 'a' });
  });
  it('拒绝不可用来源、非法状态和日期', () => {
    expect(() => applyBoardOperation([], { type: 'convert', itemId: 'foreign', lane: 'action' }, ctx)).toThrow();
    expect(() =>
      applyBoardOperation(
        [{ ...initial, lane: 'knowledge' }],
        { type: 'status', itemId: 'a', status: 'in_progress' },
        ctx,
      ),
    ).toThrow();
    expect(() => applyBoardOperation([initial], { type: 'edit', itemId: 'a', dueOn: '2026-02-30' }, ctx)).toThrow();
  });
});
describe('看板事务、版本和归属', () => {
  it('幂等重试只创建一次；不同内容复用标识被拒绝', async () => {
    const { db } = memory();
    const cmd = { type: 'create', lane: 'inbox', title: 'Question' };
    const a = await invoke(db, 0, 'request-1', cmd);
    const b = await invoke(db, 0, 'request-1', cmd);
    expect(b.workspace.items).toHaveLength(1);
    expect(b.workspace.boardVersion).toBe(1);
    expect(a.focusItemId).toBe(b.focusItemId);
    await expect(invoke(db, 0, 'request-1', { ...cmd, title: 'Different' })).rejects.toMatchObject({
      code: 'BOARD_REQUEST_REUSED',
    });
  });
  it('衍生来源快照不随原卡修改；撤销不可覆盖新版本', async () => {
    const { db } = memory();
    const a = await invoke(db, 0, 'request-1', { type: 'create', lane: 'knowledge', title: 'Source' });
    const source = a.focusItemId;
    const b = await invoke(db, 1, 'request-2', { type: 'convert', itemId: source, lane: 'action' });
    await invoke(db, 2, 'request-3', { type: 'edit', itemId: source, title: 'Changed' });
    const child = await readBoardItem({ database: db, userId: 'u', workspaceId: 'w', itemId: b.focusItemId });
    expect(child.sourceTitle).toBe('Source');
    await expect(invoke(db, 3, 'request-4', { type: 'undo', undoId: 'request-2' })).rejects.toMatchObject({
      code: 'BOARD_VERSION_CONFLICT',
    });
    await expect(
      readBoardItem({ database: db, userId: 'other', workspaceId: 'w', itemId: source }),
    ).rejects.toMatchObject({ code: 'BOARD_ITEM_UNAVAILABLE' });
  });
  it('成果与原行动完成原子提交，撤销恢复原行动', async () => {
    const { db } = memory();
    const a = await invoke(db, 0, 'request-1', { type: 'create', lane: 'action', title: 'Task' });
    const b = await invoke(db, 1, 'request-2', {
      type: 'convert',
      itemId: a.focusItemId,
      lane: 'knowledge',
      title: 'Result',
    });
    expect(b.workspace.items.find((x) => x.id === a.focusItemId).status).toBe('done');
    const c = await invoke(db, 2, 'request-3', { type: 'undo', undoId: 'request-2' });
    expect(c.workspace.items).toHaveLength(1);
    expect(c.workspace.items[0].status).toBe('open');
    expect((await readBoardItem({ database: db, userId: 'u', workspaceId: 'w', itemId: b.focusItemId })).status).toBe(
      'archived',
    );
  });
  it('事务失败回滚，旧版本冲突不写入', async () => {
    const m = memory();
    const a = await invoke(m.db, 0, 'request-1', { type: 'create', lane: 'action', title: 'Task' });
    await expect(
      invoke(m.db, 0, 'request-2', { type: 'edit', itemId: a.focusItemId, title: 'Stale' }),
    ).rejects.toMatchObject({ code: 'BOARD_VERSION_CONFLICT' });
    m.fail();
    await expect(
      invoke(m.db, 1, 'request-3', { type: 'convert', itemId: a.focusItemId, lane: 'knowledge', title: 'Result' }),
    ).rejects.toThrow('db failure');
    expect(m.version()).toBe(1);
    expect((await readBoardItem({ database: m.db, userId: 'u', workspaceId: 'w', itemId: a.focusItemId })).status).toBe(
      'open',
    );
  });
});
