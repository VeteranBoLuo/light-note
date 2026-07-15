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
}));

const { completeTodo, createTodo, listTodo } = await import('./todoHandle.js');

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
});
