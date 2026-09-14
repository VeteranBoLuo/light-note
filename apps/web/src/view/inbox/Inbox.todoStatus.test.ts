import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { computed, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todoCalendarOwnerKey } from '@/utils/todoCalendarAccess';
import { buildTodoListNodes } from '@/utils/todoSeriesGrouping';

const { listTodos, groupPage } = vi.hoisted(() => ({ listTodos: vi.fn(), groupPage: vi.fn() }));
vi.mock('@/api/todoApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/todoApi')>()),
  listTodos,
  getTodoWorkspace: listTodos,
  getTodoWorkspaceGroup: groupPage,
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

function pageRefresh(
  todo: ReturnType<typeof useTodoStore>,
  view: string,
  loading = { value: false },
  fetchTags = async (): Promise<any[]> => [],
  refreshCount = async () => false,
) {
  return new Function(
    'todoCalendarOwnerKey',
    'todo',
    'todoView',
    'inbox',
    'nextTick',
    'scrollContainer',
    'updateScrollFade',
    'isUnscopedTodoView',
    'user',
    'fetchSelectableTags',
    'workspaceTags',
    'getTodoWorkspace',
    'recentCompleted',
    'todoPageLoading',
    `let savedTodoRange = null; let pageRefreshGeneration = 0; ${executable}; return refreshList;`,
  )(
    todoCalendarOwnerKey,
    todo,
    { value: view },
    {
      filterType: 'todo',
      keyword: '',
      refreshCount,
    },
    async () => {},
    { value: null },
    () => {},
    { value: view === 'calendar' || view === 'matrix' },
    { id: 'test-owner' },
    fetchTags,
    { value: [] },
    async () => ({ status: 200, data: { items: [] } }),
    { value: [] },
    loading,
  ) as (resetScroll?: boolean, silent?: boolean) => Promise<boolean>;
}

const items = [
  { id: 'pending', status: 'pending', priority: 0 },
  { id: 'completed', status: 'completed', priority: 0 },
];

beforeEach(() => {
  setActivePinia(createPinia());
  listTodos.mockReset();
  groupPage.mockReset();
  groupPage.mockImplementation(async ({ status }) => ({
    status: 200,
    data: {
      nodes: items
        .filter((item) => status === 'all' || item.status === status)
        .map((item) => ({ kind: 'item', key: item.id, item })),
      nextCursor: null,
    },
  }));
  listTodos.mockImplementation(async ({ status, presentation }) => ({
    status: 200,
    data: {
      items: items.filter((item) => status === 'all' || item.status === status),
      ...(presentation
        ? { groups: [{ key: 'all', nodeCount: status === 'all' ? 2 : 1, instanceCount: status === 'all' ? 2 : 1 }] }
        : {}),
    },
  }));
});

describe('待办页签请求与列表分组一致', () => {
  it.each(['list', 'matrix'])('%s 连续切换未完成、已完成、全部、未完成', async (view) => {
    const todo = useTodoStore();
    const refresh = pageRefresh(todo, view);
    for (const status of ['pending', 'completed', 'all', 'pending'] as const) {
      todo.status = status;
      expect(await refresh()).toBe(true);
      if (view === 'list') await todo.loadGroup('all');
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
    await todo.loadGroup('all');
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


// 执行真实视图 watcher，防止页签刷新与状态恢复各发起一次请求。
const viewWatch = ast.statements.find(
  (node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(ast) === 'watch'
    && node.expression.arguments[0]?.getText(ast) === 'todoView',
) as ts.ExpressionStatement;
const viewCallback = (viewWatch.expression as ts.CallExpression).arguments[1];
const watcherCode = ts.transpile(`const onViewChange = ${viewCallback.getText(ast)};`, {
  target: ts.ScriptTarget.ES2022,
});

it.each([
  ['list', 'agenda', 'all', 'pending'],
  ['agenda', 'list', 'pending', 'all'],
  ['matrix', 'agenda', 'all', 'pending'],
  ['calendar', 'list', 'pending', null],
])('%s 从 %s 切换时只保留所属刷新入口', async (view, previous, effectiveStatus, requestedStatus) => {
  const todo = useTodoStore();
  todo.workspaceEnabled = true;
  todo.status = 'pending';
  todo.effectiveStatus = effectiveStatus as typeof todo.effectiveStatus;
  todo.seriesPresentation = previous === 'list';
  const refresh = vi.fn(pageRefresh(todo, view!));
  const invoke = new Function('todo', 'refreshList', 'nextTick', `
    const scopeDrawerOpen = {}, openSwipeTodoId = {}, scrollContainer = {};
    const todoSelectionMode = {}, selectedTodoIds = {}, todoBatchActionsOpen = {};
    const user = { preferences: { todoView: '${view}' } };
    let savedTodoRange = null;
    const updateScrollFade = () => {};
    ${ts.transpile(viewNode.getText(ast), { target: ts.ScriptTarget.ES2022 })}
    ${watcherCode}
    return onViewChange;
  `)(todo, refresh, async () => {});
  invoke(view, previous);
  await Promise.all(refresh.mock.results.map((result) => result.value));
  if (requestedStatus) {
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(listTodos).toHaveBeenCalledTimes(1);
    expect(listTodos).toHaveBeenCalledWith(expect.objectContaining({ status: requestedStatus }));
    if (view === 'list') {
      expect(groupPage).not.toHaveBeenCalled();
      await todo.loadGroup('all');
      expect(groupPage).toHaveBeenCalledTimes(1);
      expect(todo.items.map((item) => item.id)).toEqual(['pending']);
    }
  } else {
    expect(refresh).not.toHaveBeenCalled();
    expect(listTodos).not.toHaveBeenCalled();
    expect(todo.seriesPresentation).toBe(false);
  }
  expect(todo.status).toBe('pending');
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.each(['success', 'empty', 'failure'])('慢标签与待办请求持续加载，结束后进入 %s 状态', async (result) => {
  const todo = useTodoStore();
  const loading = { value: false };
  const tags = deferred<any[]>();
  const response = deferred<any>();
  listTodos.mockReturnValueOnce(response.promise);
  const refresh = pageRefresh(todo, 'matrix', loading, () => tags.promise);
  const pending = refresh();
  expect(loading.value).toBe(true);
  expect(listTodos).not.toHaveBeenCalled();
  tags.resolve([]);
  await vi.waitFor(() => expect(listTodos).toHaveBeenCalledTimes(1));
  expect(loading.value).toBe(true);
  response.resolve({ status: result === 'failure' ? 500 : 200, data: { items: result === 'success' ? items : [] } });
  await pending;
  expect(loading.value).toBe(false);
  expect(todo.loading).toBe(false);
  expect(todo.loadFailed).toBe(result === 'failure');
  expect(todo.items).toHaveLength(result === 'success' ? 2 : 0);
});

it('已有内容的静默刷新保留列表，不显示首屏加载', async () => {
  const todo = useTodoStore();
  todo.items = items as any;
  const tags = deferred<any[]>();
  const loading = { value: false };
  const pending = pageRefresh(todo, 'matrix', loading, () => tags.promise)(false, true);
  expect(loading.value).toBe(false);
  expect(todo.items).toHaveLength(2);
  tags.resolve([]);
  await pending;
});

it('旧标签响应不能关闭最新加载态或发起过时的列表请求', async () => {
  const todo = useTodoStore();
  const loading = { value: false };
  const oldTags = deferred<any[]>();
  const newTags = deferred<any[]>();
  const fetchTags = vi.fn().mockReturnValueOnce(oldTags.promise).mockReturnValueOnce(newTags.promise);
  const refresh = pageRefresh(todo, 'matrix', loading, fetchTags);
  const oldRequest = refresh();
  const newRequest = refresh();
  oldTags.resolve([]);
  expect(await oldRequest).toBe(false);
  expect(loading.value).toBe(true);
  expect(listTodos).not.toHaveBeenCalled();
  newTags.resolve([]);
  expect(await newRequest).toBe(true);
  expect(loading.value).toBe(false);
  expect(listTodos).toHaveBeenCalledTimes(1);
});


it('分组出现后结束总加载，统计仍在等待时只保留分组加载', async () => {
  const todo = useTodoStore();
  const loading = ref(false);
  const count = deferred<boolean>();
  const pageLoadingNode = ast.statements.find((node) =>
    ts.isVariableStatement(node) && node.declarationList.declarations.some(
      (declaration) => declaration.name.getText(ast) === 'pageLoading',
    ),
  )!;
  const getLoading = new Function('computed', 'todo', 'todoPageLoading', `
    const isTodoFocused = { value: true }, isMobileTodoPrimary = { value: false };
    const isMobileResourceInbox = { value: false }, inbox = { filterType: 'todo' };
    const recentCompleted = { value: [] };
    ${ts.transpile(pageLoadingNode.getText(ast), { target: ts.ScriptTarget.ES2022 })}
    return pageLoading;
  `)(computed, todo, loading);
  const pending = pageRefresh(todo, 'list', loading, async () => [], () => count.promise)();
  expect(getLoading.value).toBe(true);
  await vi.waitFor(() => expect(todo.groups).toHaveLength(1));
  expect(loading.value).toBe(true); // 后续统计尚未完成。
  expect(getLoading.value).toBe(false);
  expect(todo.groups[0].loaded).toBe(false);
  count.resolve(false);
  await pending;
  expect(getLoading.value).toBe(false);
});
