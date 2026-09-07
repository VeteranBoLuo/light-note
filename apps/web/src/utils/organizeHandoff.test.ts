import { beforeEach, expect, it } from 'vitest';
import { clearOrganizeHandoff, consumeOrganizeHandoff, createOrganizeHandoff } from './organizeHandoff';
import type { SelectionOperation } from '@/store/resourceSelection';
const operation = (count = 25) =>
  ({
    identity: 'user|admin-context',
    items: Array.from({ length: count }, (_, i) => ({ type: 'note', id: String(i) })),
  }) as SelectionOperation;
beforeEach(() => clearOrganizeHandoff());
it('一次性交接完整明确范围，超过20条不截断', () => {
  const op = operation();
  const token = createOrganizeHandoff(op);
  op.items.pop();
  const result = consumeOrganizeHandoff(token, op.identity);
  expect(result).toMatchObject({ resourceTypes: ['note'], checks: ['tags'], scope: 'selected', tagMode: 'append' });
  expect(result?.items).toHaveLength(25);
  expect(consumeOrganizeHandoff(token, op.identity)).toBeNull();
});
it('身份变化、取消导航或刷新后不能恢复旧选择', () => {
  const op = operation();
  expect(consumeOrganizeHandoff(createOrganizeHandoff(op), 'different')).toBeNull();
  const token = createOrganizeHandoff(op);
  clearOrganizeHandoff(token);
  expect(consumeOrganizeHandoff(token, op.identity)).toBeNull();
});
it('禁止空选或超限，不静默截断', () => {
  expect(() => createOrganizeHandoff(operation(0))).toThrow();
  expect(() => createOrganizeHandoff(operation(1001))).toThrow();
  const op = operation(1000);
  expect(consumeOrganizeHandoff(createOrganizeHandoff(op), op.identity)?.items).toHaveLength(1000);
});
