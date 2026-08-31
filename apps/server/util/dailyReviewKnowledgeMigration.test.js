import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260901_daily_review_knowledge.sql', import.meta.url);
const seedUrl = new URL('../scripts/seedMobileTodaySearchKnowledge.js', import.meta.url);

describe('每日回顾公开帮助迁移', () => {
  it('以标题幂等同步已有环境，并保留缺失环境的插入路径', async () => {
    const migration = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(migration).toContain("SET @daily_review_help_title = '移动端「今日」页面是什么'");
    expect(migration).toContain('NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @daily_review_help_id)');
    expect(migration).toContain('NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @daily_review_help_title)');
    expect(migration).toContain('WHERE id = @daily_review_help_id OR title = @daily_review_help_title');
    expect(migration).toContain("status = 'public'");
    expect(migration).toContain("type = 'markdown'");
  });

  it('迁移和持续同步脚本都明确完整的回顾状态语义', async () => {
    const [migration, seed] = await Promise.all([
      readFile(fileURLToPath(migrationUrl), 'utf8'),
      readFile(fileURLToPath(seedUrl), 'utf8'),
    ]);
    const expectedRules = [
      '每天固定最多 3 条',
      '打开内容就算回顾了这一条',
      '7 天后再看',
      '不再推荐这条',
      '今天先收起',
      '同一天刷新、重新登录或换设备，条目与进度保持一致',
      '全部处理完会显示今日完成',
      '“今天先收起”不会永久隐藏内容',
    ];

    for (const rule of expectedRules) {
      expect(migration).toContain(rule);
      expect(seed).toContain(rule);
    }
  });
});
