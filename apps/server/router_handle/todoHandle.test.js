import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const getConnection = vi.fn(async () => connection);
const poolQuery = vi.fn();
const ensureNotVisitor = vi.fn(() => true);
const createTodoItem = vi.fn(async () => ({ id: 'todo-1' }));
const updateTodoItem = vi.fn(async () => ({ id: 'todo-1' }));
const deleteTodoItem = vi.fn(async () => 1);
const listTodos = vi.fn(async () => []);
const queryTodoPendingCount = vi.fn(async () => 0);
const setTodoStatus = vi.fn(async () => 1);
const restoreTodoItem = vi.fn(async () => 1);
const batchSetTodoStatus = vi.fn(async () => ({ affected: 1, ids: ['todo-1'] }));
const batchDeleteTodos = vi.fn(async () => ({ affected: 1, ids: ['todo-1'] }));
const batchRestoreTodos = vi.fn(async () => ({ affected: 1, ids: ['todo-1'] }));
const reorderTodos = vi.fn(async () => ({ affected: 1 }));
const snoozeTodoItem = vi.fn(async () => ({ id: 'todo-1' }));

vi.mock('../db/index.js', () => ({ default: { getConnection, query: poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor }));
vi.mock('../util/services/todoService.js', () => ({
  createTodo: createTodoItem,
  updateTodo: updateTodoItem,
  deleteTodo: deleteTodoItem,
  listTodos,
  queryTodoPendingCount,
  setTodoStatus,
  restoreTodo: restoreTodoItem,
  batchSetTodoStatus,
  batchDeleteTodos,
  batchRestoreTodos,
  reorderTodos,
  snoozeTodo: snoozeTodoItem,
}));

const { batchRestoreTodo, batchStatusTodo, completeTodo, createTodo, listTodo, reorderTodo, restoreTodo, snoozeTodo } =
  await import('./todoHandle.js');

const mockRes = () => ({ send: vi.fn() });

describe('todoHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureNotVisitor.mockReturnValue(true);
    getConnection.mockResolvedValue(connection);
    createTodoItem.mockResolvedValue({ id: 'todo-1' });
    listTodos.mockResolvedValue([]);
    queryTodoPendingCount.mockResolvedValue(0);
    setTodoStatus.mockResolvedValue(1);
  });

  it('创建待办使用当前用户和事务', async () => {
    const req = { user: { id: 'u1', role: 'user' }, body: { title: '测试' } };
    const res = mockRes();
    await createTodo(req, res);
    expect(createTodoItem).toHaveBeenCalledWith(connection, 'u1', req.body);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('游客写入在获取连接前被拦截', async () => {
    ensureNotVisitor.mockReturnValueOnce(false);
    await createTodo({ user: { id: 'visitor', role: 'visitor' }, body: { title: 'x' } }, mockRes());
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('完成待办始终带 userId，避免跨用户修改', async () => {
    await completeTodo({ user: { id: 'u2', role: 'user' }, body: { id: 'todo-1' } }, mockRes());
    expect(setTodoStatus).toHaveBeenCalledWith(connection, 'u2', 'todo-1', 'completed');
  });

  it('游客列表返回空数据且不查询待办表', async () => {
    const res = mockRes();
    await listTodo({ user: { id: 'visitor', role: 'visitor' }, body: {} }, res);
    expect(listTodos).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({ data: { items: [], total: 0, pendingTotal: 0 }, status: 200, msg: '' });
  });

  it('待处理列表默认查询全部完成状态', async () => {
    await listTodo({ user: { id: 'u1', role: 'user' }, body: {} }, mockRes());
    expect(listTodos).toHaveBeenCalledWith(expect.anything(), 'u1', { status: 'all', sort: 'smart', keyword: '' });
  });

  it('撤销完成的批量状态请求只信任布尔标记并在事务内执行', async () => {
    const req = {
      user: { id: 'u3', role: 'user' },
      body: { ids: ['todo-1'], status: 'pending', undoCompletion: true },
    };
    await batchStatusTodo(req, mockRes());
    expect(batchSetTodoStatus).toHaveBeenCalledWith(connection, 'u3', ['todo-1'], 'pending', {
      undoCompletion: true,
    });
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('恢复、排序和稍后提醒均使用当前用户身份', async () => {
    const user = { id: 'u4', role: 'user' };
    await restoreTodo({ user, body: { id: 'todo-1' } }, mockRes());
    await batchRestoreTodo({ user, body: { ids: ['todo-1'] } }, mockRes());
    await reorderTodo({ user, body: { items: [{ id: 'todo-1', priority: 2 }] } }, mockRes());
    await snoozeTodo({ user, body: { id: 'todo-1', targetAt: '2026-08-01T09:00' } }, mockRes());
    expect(restoreTodoItem).toHaveBeenCalledWith(connection, 'u4', 'todo-1');
    expect(batchRestoreTodos).toHaveBeenCalledWith(connection, 'u4', ['todo-1']);
    expect(reorderTodos).toHaveBeenCalledWith(connection, 'u4', [{ id: 'todo-1', priority: 2 }]);
    expect(snoozeTodoItem).toHaveBeenCalledWith(connection, 'u4', 'todo-1', '2026-08-01T09:00');
  });
});
