import { describe, expect, it } from 'vitest';
import { buildSqlConfirmation, describeMutation, isUnscopedWrite } from './sqlConsoleGuard';

describe('describeMutation', () => {
  it('只读查询不需要确认', () => {
    expect(describeMutation('SELECT * FROM note LIMIT 10')).toBe('');
    expect(describeMutation('DESC note')).toBe('');
    expect(describeMutation('SHOW TABLES')).toBe('');
    expect(buildSqlConfirmation('SELECT 1')).toBeNull();
  });

  it('写操作要确认', () => {
    expect(describeMutation('DELETE FROM note WHERE id = 1')).toBe('DELETE');
    expect(describeMutation('update note set title = ?')).toBe('UPDATE');
    expect(describeMutation('INSERT INTO note (id) VALUES (1)')).toBe('INSERT');
    expect(describeMutation('TRUNCATE note')).toBe('TRUNCATE');
  });

  it('字符串字面量和注释里的关键字不算写操作', () => {
    // 否则查一句含「delete」的日志就要被拦一次，久了就会习惯性点确认
    expect(describeMutation("SELECT * FROM api_logs WHERE msg = 'delete failed'")).toBe('');
    expect(describeMutation('SELECT 1 -- delete me later')).toBe('');
    expect(describeMutation('SELECT 1 /* drop table note */')).toBe('');
    expect(describeMutation('SELECT 1 # update later')).toBe('');
  });

  it('关键字出现在标识符里不误判', () => {
    expect(describeMutation('SELECT deleted_at FROM note')).toBe('');
    expect(describeMutation('SELECT * FROM update_log')).toBe('');
  });
});

describe('isUnscopedWrite', () => {
  it('无 WHERE 的 DELETE / UPDATE 判为全表', () => {
    expect(isUnscopedWrite('DELETE FROM note')).toBe(true);
    expect(isUnscopedWrite('UPDATE note SET is_top = 0')).toBe(true);
  });

  it('有 WHERE 或 LIMIT 就不算全表', () => {
    expect(isUnscopedWrite('DELETE FROM note WHERE id = 1')).toBe(false);
    expect(isUnscopedWrite('UPDATE note SET is_top = 0 WHERE create_by = ?')).toBe(false);
    expect(isUnscopedWrite('DELETE FROM note LIMIT 10')).toBe(false);
  });

  it('WHERE 在子查询里也不算全表（宁可少喊一次狼来了）', () => {
    expect(isUnscopedWrite('DELETE FROM note WHERE id IN (SELECT id FROM t WHERE x = 1)')).toBe(false);
  });

  it('非 DELETE/UPDATE 的写操作不套用全表判定', () => {
    expect(isUnscopedWrite('INSERT INTO note (id) VALUES (1)')).toBe(false);
    expect(isUnscopedWrite('TRUNCATE note')).toBe(false);
  });

  it('字符串里的 where 不能被当成真的 WHERE 条件', () => {
    // 这条其实是全表删除，若把字面量里的 where 当条件就会漏掉最该警告的情况
    expect(isUnscopedWrite("DELETE FROM note /* where id=1 */")).toBe(true);
    expect(isUnscopedWrite("DELETE FROM log_note -- where id=1")).toBe(true);
  });
});

describe('buildSqlConfirmation', () => {
  it('全表写操作给出更醒目的标题与后果说明', () => {
    const confirmation = buildSqlConfirmation('DELETE FROM note');
    expect(confirmation?.title).toContain('没有 WHERE');
    expect(confirmation?.title).toContain('DELETE');
    expect(confirmation?.content).toContain('每一行');
  });

  it('带条件的写操作用常规确认', () => {
    const confirmation = buildSqlConfirmation('DELETE FROM note WHERE id = 1');
    expect(confirmation?.title).toBe('确认执行 DELETE');
    expect(confirmation?.content).not.toContain('每一行');
  });

  it('确认框里带上语句原文，便于核对', () => {
    expect(buildSqlConfirmation('DELETE FROM note WHERE id = 42')?.content).toContain('WHERE id = 42');
  });

  it('超长语句截断，不撑爆弹框', () => {
    const long = `DELETE FROM note WHERE id IN (${Array.from({ length: 400 }, (_, i) => i).join(',')})`;
    const content = buildSqlConfirmation(long)?.content || '';
    expect(content.length).toBeLessThan(400);
  });
});
