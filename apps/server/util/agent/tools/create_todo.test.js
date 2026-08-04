import { beforeEach, describe, expect, it, vi } from 'vitest';

const createTodoService = vi.fn();
vi.mock('../../services/todoService.js', () => ({ createTodo: createTodoService }));
vi.mock('../../../db/index.js', () => ({ default: { getConnection: vi.fn() } }));

const { default: createTodoTool, normalizeCreateTodoArgs } = await import('./create_todo.js');

const ctx = { userId: 'user-1' };

function isoLocal(offsetMs) {
  const date = new Date(Date.now() + offsetMs);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:00`;
}

describe('Agent create_todo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('归一化模型常见的参数别名', () => {
    expect(
      normalizeCreateTodoArgs({
        todoTitle: ' 交材料 ',
        detail: ' 记得带身份证 ',
        due_at: '2026-08-04 21:00:00',
        priority_level: 2,
      }),
    ).toEqual({
      title: '交材料',
      description: '记得带身份证',
      dueAt: '2026-08-04 21:00:00',
      priority: 2,
    });
    // 非法优先级回落普通，而不是让 service 抛错
    expect(normalizeCreateTodoArgs({ title: 'x', priority: 9 }).priority).toBe(1);
    expect(normalizeCreateTodoArgs({ task_title: 'y' }).priority).toBe(1);
  });

  it('缺少标题时确认前就失败，不生成必然失败的确认卡', async () => {
    await expect(createTodoTool.prepareArgs({ dueAt: '2026-08-04 21:00:00' }, ctx)).rejects.toMatchObject({
      code: 'TODO_TITLE_REQUIRED',
    });
  });

  it('把时间归一成本地时间字面值，不做 UTC 偏移', async () => {
    const prepared = await createTodoTool.prepareArgs({ title: '交材料', dueAt: '2026-08-04T21:00:00' }, ctx);
    // 用 toISOString 会把北京时间的 21 点写成前一天 13 点，这里必须保持字面本地时间。
    expect(prepared.dueAt).toBe('2026-08-04 21:00:00');
  });

  it('拒绝年份明显写错的时间，这是模型最典型的失败模式', async () => {
    await expect(createTodoTool.prepareArgs({ title: 'x', dueAt: '2099-01-01 09:00:00' }, ctx)).rejects.toMatchObject({
      code: 'TODO_DUE_AT_INVALID',
    });
    await expect(createTodoTool.prepareArgs({ title: 'x', dueAt: '2015-01-01 09:00:00' }, ctx)).rejects.toMatchObject({
      code: 'TODO_DUE_AT_INVALID',
    });
    await expect(createTodoTool.prepareArgs({ title: 'x', dueAt: '下周三晚上' }, ctx)).rejects.toMatchObject({
      code: 'TODO_DUE_AT_INVALID',
    });
  });

  it('小幅过去的时间不拒绝，但在确认卡上标注已过期供用户否决', async () => {
    const prepared = await createTodoTool.prepareArgs({ title: '交材料', dueAt: isoLocal(-2 * 3600 * 1000) }, ctx);
    expect(prepared.overdue).toBe(true);
    const preview = createTodoTool.preview(prepared);
    expect(preview.impact).toContain('已过去');
    expect(preview.details.find((item) => item.key === 'dueAt')?.value).toContain('已过期');
  });

  it('没有截止时间时正常创建，确认卡显式说明未设置', async () => {
    const prepared = await createTodoTool.prepareArgs({ title: '随手记一条' }, ctx);
    expect(prepared.dueAt).toBe('');
    const preview = createTodoTool.preview(prepared);
    expect(preview.target).toBe('随手记一条');
    expect(preview.impact).toContain('没有截止时间');
    expect(preview.details.find((item) => item.key === 'dueAt')?.value).toBe('未设置');
  });

  it('管理员代管模式不得为目标账号创建待办', async () => {
    await expect(
      createTodoTool.prepareArgs({ title: 'x' }, { ...ctx, request: { adminContext: { mode: 'maintain' } } }),
    ).rejects.toMatchObject({ code: 'TODO_ADMIN_CONTEXT_FORBIDDEN' });
  });

  it('回执带上标题与截止时间，便于核对写入结果', () => {
    expect(createTodoTool.transform({ title: '交材料', dueAt: '2026-08-04 21:00:00' })).toContain('2026-08-04 21:00:00');
    expect(createTodoTool.transform({ title: '交材料' })).toBe('✅ 待办「交材料」已创建。');
  });
});
