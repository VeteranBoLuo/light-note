import { describe, expect, it } from 'vitest';
import { resolveSucceededActionReceipt } from './confirmationReceipt';

const confirmation = { id: 'confirm-1', toolName: 'set_todo_status', capabilityId: 'todo.status.set' };

describe('confirmationReceipt', () => {
  it('只有与当前确认严格绑定的服务端成功回执才可展示成功', () => {
    expect(
      resolveSucceededActionReceipt(
        {
          actionId: 'confirm-1',
          toolName: 'set_todo_status',
          capabilityId: 'todo.status.set',
          status: 'succeeded',
          summary: '待办已完成',
          completedAt: '2026-07-23T08:00:00.000Z',
        },
        confirmation,
      ),
    ).toMatchObject({ actionId: 'confirm-1', status: 'succeeded' });
  });

  it.each([
    null,
    {},
    { actionId: 'other', toolName: 'set_todo_status', status: 'succeeded', completedAt: 'now' },
    { actionId: 'confirm-1', toolName: 'create_note', status: 'succeeded', completedAt: 'now' },
    {
      actionId: 'confirm-1',
      toolName: 'set_todo_status',
      capabilityId: 'note.create',
      status: 'succeeded',
      completedAt: 'now',
    },
    { actionId: 'confirm-1', toolName: 'set_todo_status', status: 'failed', completedAt: 'now' },
  ])('缺失、串卡或非成功回执均失败关闭', (receipt) => {
    expect(resolveSucceededActionReceipt(receipt, confirmation)).toBeNull();
  });
});
