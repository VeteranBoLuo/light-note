import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AFDIAN_SUPPORT_PACKAGE_TABLE_SQL, ensureAfdianSupportPackageSchema } from './afdianSupportPackageSchema.js';

const migration = readFileSync(new URL('../migrations/20260825_support_packages_v2.sql', import.meta.url), 'utf8');
const schemaBaseline = readFileSync(new URL('../tag_db.sql', import.meta.url), 'utf8');
const schemaAssertions = readFileSync(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8');

describe('爱发电 v2 套餐 Schema', () => {
  it('启动期补齐结算快照并创建活动、首充和通用权益表', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes('information_schema')) return [[{ exists: 1 }], []];
        return [[], []];
      }),
    };
    await ensureAfdianSupportPackageSchema({ db });
    const schema = AFDIAN_SUPPORT_PACKAGE_TABLE_SQL.join('\n');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS support_campaigns');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS support_campaign_skus');
    expect(schema).toContain('UNIQUE KEY uk_support_campaign_sku_version (campaign_id, sku_id)');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS support_campaign_user_limits');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS support_first_purchase_claims');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS support_entitlement_grants');
    expect(schema).toContain('UNIQUE KEY uk_support_first_user_sku (user_id, sku_id)');
    expect(schema).toContain('UNIQUE KEY uk_support_first_identity_sku (provider_identity_hash, sku_id)');
    expect(schema).toContain('UNIQUE KEY uk_support_entitlement_order (support_order_id)');
    expect(schema).not.toMatch(/api_token|client_secret/i);
  });

  it('旧结算表只新增缺失列与索引，可重复启动', async () => {
    const db = { query: vi.fn().mockResolvedValue([[], []]) };
    await ensureAfdianSupportPackageSchema({ db });
    const sql = db.query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('ADD COLUMN intent_type');
    expect(sql).toContain('ADD COLUMN quoted_amount');
    expect(sql).toContain('ADD COLUMN consumed_order_id');
    expect(sql).toContain('ADD KEY idx_support_checkout_package');
    expect(sql).toContain('ADD KEY idx_support_checkout_consumed');
    expect(sql).toContain('ADD UNIQUE KEY uk_support_campaign_sku_version (campaign_id, sku_id)');
  });

  it('把早期跨活动全局唯一索引收敛为活动版本内唯一', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (String(sql).includes("INDEX_NAME IN ('uk_support_campaign_sku_public'")) {
          return [
            [
              {
                indexName: 'uk_support_campaign_sku_public',
                nonUnique: 0,
                sequence: 1,
                columnName: 'sku_id',
              },
            ],
            [],
          ];
        }
        if (String(sql).includes('information_schema')) return [[{ exists: 1 }], []];
        return [[], []];
      }),
    };
    await ensureAfdianSupportPackageSchema({ db });
    const sql = db.query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('DROP INDEX uk_support_campaign_sku_public');
    expect(sql).toContain('ADD UNIQUE KEY uk_support_campaign_sku_version (campaign_id, sku_id)');
  });

  it('MySQL 5.7 迁移、全量基线和只读门禁保持同一组套餐事实', () => {
    for (const table of [
      'support_campaigns',
      'support_campaign_skus',
      'support_campaign_user_limits',
      'support_first_purchase_claims',
      'support_entitlement_grants',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS \`${table}\``);
      expect(schemaBaseline).toContain(`CREATE TABLE IF NOT EXISTS \`${table}\``);
      expect(schemaAssertions).toContain(`'${table}'`);
    }
    for (const column of [
      'intent_type',
      'intent_status',
      'sku_id',
      'catalog_version',
      'quoted_amount',
      'base_ai_tokens',
      'base_storage_mb',
      'quoted_ai_tokens',
      'quoted_storage_mb',
      'first_purchase_candidate',
      'campaign_id',
      'campaign_sku_id',
      'campaign_version',
      'campaign_user_limit',
      'campaign_starts_at',
      'campaign_ends_at',
      'consumed_order_id',
    ]) {
      expect(migration).toContain(`'support_checkout_intents', '${column}'`);
      expect(schemaBaseline).toContain(`\`${column}\``);
      expect(schemaAssertions).toMatch(
        new RegExp(`'${column}'(?:\\s+col)?\\s*,\\s*'support_checkout_intents\\.${column}'`),
      );
    }
    expect(migration).toContain('DELIMITER $$');
    expect(migration).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i);
    expect(schemaAssertions).toContain('[59] invalid_support_entitlement_snapshot');
    expect(schemaAssertions).toContain('[59] invalid_support_campaign_sku_index');
    expect(schemaAssertions).toContain('[59] obsolete_support_campaign_sku_index');
    expect(schemaAssertions).toContain('[59] invalid_credited_support_entitlement_storage');
    expect(schemaAssertions).toContain("intent.intent_status NOT IN ('issued','consumed','expired','cancelled')");
    expect(schemaAssertions).toMatch(
      /grant_row\.grant_status IN \('credited','reversal_review'\)[\s\S]*grant_row\.paid_amount <=> intent\.quoted_amount/,
    );
  });
});
