import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  AFDIAN_SUPPORT_TABLE_SQL,
  ensureAfdianSupportOrderPurposeBackfill,
  ensureAfdianSupportSchema,
} from './afdianSupportSchema.js';

const splitMigration = readFileSync(
  new URL('../migrations/20260825_support_donation_store_split.sql', import.meta.url),
  'utf8',
);
const schemaBaseline = readFileSync(new URL('../tag_db.sql', import.meta.url), 'utf8');
const schemaAssertions = readFileSync(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8');

describe('爱发电支持模块 Schema', () => {
  it('启动期幂等创建四张职责单一的数据表并兼容补齐旧表字段', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('information_schema')) return [[{ exists: 1 }], []];
        return [[], []];
      }),
    };
    await ensureAfdianSupportSchema({ db });
    expect(db.query).toHaveBeenCalledTimes(12);
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('UNIQUE KEY uk_support_order_provider (provider_order_no)');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('UNIQUE KEY uk_support_checkout_token (token_hash)');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('CREATE TABLE IF NOT EXISTS support_public_preferences');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('ranking_observed_at datetime DEFAULT NULL');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('provider_created_at datetime DEFAULT NULL');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('order_purpose varchar(24)');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).toContain('idx_support_order_purpose_ranking');
    expect(AFDIAN_SUPPORT_TABLE_SQL.join('\n')).not.toMatch(/client_secret|api_token/i);
  });

  it('旧表缺列或索引时仅补齐缺失结构', async () => {
    const db = { query: vi.fn().mockResolvedValue([[], []]) };
    await ensureAfdianSupportSchema({ db });
    const sql = db.query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('ADD COLUMN provider_name');
    expect(sql).toContain('ADD COLUMN ranking_observed_at');
    expect(sql).toContain('ADD COLUMN provider_created_at');
    expect(sql).toContain('ADD COLUMN order_purpose');
    expect(sql).toContain('ADD KEY idx_support_order_ranking');
    expect(sql).toContain('ADD KEY idx_support_order_purpose_ranking');
  });

  it('在全部依赖结构就绪后按套餐、纯赞助、历史规则顺序幂等回填订单用途', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 0 }, []]) };
    await ensureAfdianSupportOrderPurposeBackfill({ db });
    const sql = db.query.mock.calls.map(([statement]) => String(statement));
    expect(sql).toHaveLength(3);
    expect(sql[0]).toContain("i.intent_type IN ('permanent', 'campaign')");
    expect(sql[1]).toContain("i.intent_type = 'donation'");
    expect(sql[2]).toContain("p.policy_version = 'support-pure-v2'");
    expect(sql[2]).toContain("SET o.order_purpose = 'legacy_support'");
    expect(sql[2]).toContain('COALESCE(o.provider_created_at, o.create_time) <= p.activated_at');
  });

  it('拆分迁移可独立重复执行，并与全量基线和只读门禁保持同一用途事实', () => {
    const intentColumnGuard = splitMigration.indexOf('ensure_support_intent_type_column');
    const firstIntentRead = splitMigration.indexOf("i.`intent_type` IN ('permanent','campaign')");
    expect(intentColumnGuard).toBeGreaterThan(0);
    expect(firstIntentRead).toBeGreaterThan(intentColumnGuard);
    expect(splitMigration).toContain("VALUES ('support-pure-v2',0,0)");
    expect(splitMigration).toContain('idx_support_order_purpose_ranking');
    expect(splitMigration).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
    expect(schemaBaseline).toContain('`order_purpose` varchar(24)');
    expect(schemaAssertions).toContain('[59] invalid_support_order_purpose');
    expect(schemaAssertions).toContain('[59] package_intent_wrong_order_purpose');
    expect(schemaAssertions).toContain('[59] donation_has_positive_reward');
  });
});
