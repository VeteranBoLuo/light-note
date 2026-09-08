import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTodoListNodes } from '@/utils/todoSeriesGrouping';

const { listTodos } = vi.hoisted(() => ({ listTodos: vi.fn() }));
vi.mock('@/api/todoApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/todoApi')>()),
  listTodos,
  getTodoWorkspace: listTodos,
}));
import useTodoStore from '@/store/todo';

// 执行页面真实的请求编排，配合真实 Store；仅隔离网络及无关的滚动副作用。
const source = readFileSync(resolve(process.cwd(), 'src/view/inbox/Inbox.vue'), 'utf8');
const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1];
const ast = ts.createSourceFile('Inbox.ts', script, ts.ScriptTarget.Latest, true);
const refreshNode = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'refreshList')!;
const viewNode = ast.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (declaration) => declaration.name.getText(ast) === 'todoViewUsesStatusFilter',
    ),
)!;
const executable = ts.transpile(`${viewNode.getText(ast)}\n${refreshNode.getText(ast)}`, {
  target: ts.ScriptTarget.ES2022,
});

function pageRefresh(todo: ReturnType<typeof useTodoStore>, view: string) {
  return new Function(
    'todo',
    'todoView',
    'inbox',
    'nextTick',
    'scrollContainer',
    'updateScrollFade',
    'isUnscopedTodoView', 'user', 'fetchSelectableTags', 'workspaceTags', 'getTodoWorkspace', 'recentCompleted',
    `let savedTodoRange = null; ${executable}; return refreshList;`,
  )(
    todo,
    { value: view },
    {
      filterType: 'todo',
      keyword: '',
      refreshCount: async () => false,
    },
    async () => {},
    { value: null },
    () => {},
    { value: view === 'calendar' || view === 'matrix' },
    { id: 'test-owner' }, async () => [], { value: [] }, async () => ({ status: 200, data: { items: [] } }), { value: [] },
  ) as () => Promise<boolean>;
}

const items = [
  { id: 'pending', status: 'pending', priority: 0 },
  { id: 'completed', status: 'completed', priority: 0 },
];

beforeEach(() => {
  setActivePinia(createPinia());
  listTodos.mockReset();
  listTodos.mockImplementation(async ({ status }) => ({
    status: 200,
    data: { items: items.filter((item) => status === 'all' || item.status === status) },
  }));
});

describe('待办页签请求与列表分组一致', () => {
  it.each(['list', 'matrix'])('%s 连续切换未完成、已完成、全部、未完成', async (view) => {
    const todo = useTodoStore();
    const refresh = pageRefresh(todo, view);
    for (const status of ['pending', 'completed', 'all', 'pending'] as const) {
      todo.status = status;
      expect(await refresh()).toBe(true);
      expect(listTodos).toHaveBeenLastCalledWith(expect.objectContaining({ status }));
      expect(todo.items.map((item) => item.id)).toEqual(
        items.filter((item) => status === 'all' || item.status === status).map((item) => item.id),
      );
      expect(buildTodoListNodes(todo.items).length).toBe(status === 'all' ? 2 : 1);
    }
  });

  it.each(['agenda', 'calendar'])('%s 读取全部，回到列表恢复已完成筛选', async (view) => {
    const todo = useTodoStore();
    todo.status = 'completed';
    await pageRefresh(todo, view)();
    expect(todo.status).toBe('completed');
    expect(todo.effectiveStatus).toBe('all');
    expect(todo.items).toHaveLength(2);
    await pageRefresh(todo, 'list')();
    expect(todo.items.map((item) => item.id)).toEqual(['completed']);
  });

  it('已完成为空时清除旧未完成数据，使页面进入空状态', async () => {
    const todo = useTodoStore();
    todo.status = 'pending';
    await pageRefresh(todo, 'list')();
    listTodos.mockResolvedValueOnce({ status: 200, data: { items: [] } });
    todo.status = 'completed';
    await pageRefresh(todo, 'list')();
    expect(listTodos).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(todo.items).toEqual([]);
    expect(todo.loading).toBe(false);
    expect(todo.loadFailed).toBe(false);
  });
});
