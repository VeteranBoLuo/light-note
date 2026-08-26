import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260826_points_economy_c5_storage_limits.sql', import.meta.url);
const knowledgeUrl = new URL('../migrations/20260826_points_economy_c5_knowledge.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);

describe('积分经济 C5 永久空间限兑迁移', () => {
  it('使用独立唯一事实表，并只回填历史直接兑换', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');
    const executable = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    expect(executable).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/iu);
    expect(source).toContain('PRIMARY KEY (user_id, item_id)');
    expect(source).toContain('uk_points_shop_claim_operation');
    expect(source).toContain("operation_type = 'shop_buy'");
    expect(source).toContain('MIN(id) AS first_operation_id');
    expect(source).not.toContain('@c5_storage_limit_should_backfill');
    expect(source).toContain("ledger.reason = 'buy'");
    expect(source).toContain("ledger.ref IN ('storage_128', 'storage_512', 'storage_2g')");
    expect(source).not.toMatch(/lottery_(?:paid_)?asset/iu);
    expect(source).toContain("migration_key = 'points-economy-c5-storage-limits-v1'");
    expect(source).toContain('INSERT IGNORE INTO points_economy_migration_state');
  });

  it('只读 Schema 门禁检查领取事实结构、唯一键与迁移标记', async () => {
    const source = await readFile(fileURLToPath(assertionsUrl), 'utf8');
    expect(source).toContain('points_shop_item_claims');
    expect(source).toContain('uk_points_shop_claim_operation');
    expect(source).toContain('idx_points_shop_claim_item_time');
    expect(source).toContain('points-economy-c5-storage-limits-v1');
  });

  it('帮助中心明确每档一次、历史兑换兼容和抽奖不占资格', async () => {
    const source = await readFile(fileURLToPath(knowledgeUrl), 'utf8');
    expect(source).toContain('三档扩容包每个账号各限兑换一次');
    expect(source).toContain('规则启用前直接用积分兑换过某一档');
    expect(source).toContain('积分抽奖或运营活动获得的空间不占');
    expect(source).not.toMatch(/\bSKU\b/u);
  });
});
