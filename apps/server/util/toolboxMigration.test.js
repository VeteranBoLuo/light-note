import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260828_toolbox_v1.sql', import.meta.url);
const workspaceMigrationUrl = new URL('../migrations/20260829_toolbox_workspaces.sql', import.meta.url);
const knowledgeUrl = new URL('../migrations/20260828_toolbox_knowledge.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);
const runtimeSchemaUrl = new URL('./toolboxSchema.js', import.meta.url);
const deployScriptUrl = new URL('../../../scripts/deploy-server.sh', import.meta.url);

const TOOLBOX_TABLES = [
  'toolbox_quotes',
  'toolbox_jobs',
  'toolbox_job_inputs',
  'toolbox_artifacts',
  'toolbox_save_receipts',
];
const WORKSPACE_TABLES = [
  'toolbox_workspaces',
  'toolbox_workspace_resources',
  'toolbox_workspace_items',
  'toolbox_workspace_sessions',
];
describe('知识工具箱 Schema 与帮助迁移门禁', () => {
  it('增量迁移与运行时幂等 Schema 使用同一组事实表和关键唯一键', async () => {
    const [migration, workspaceMigration, runtimeSchema] = await Promise.all([
      readFile(fileURLToPath(migrationUrl), 'utf8'),
      readFile(fileURLToPath(workspaceMigrationUrl), 'utf8'),
      readFile(fileURLToPath(runtimeSchemaUrl), 'utf8'),
    ]);

    for (const table of TOOLBOX_TABLES) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(runtimeSchema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    for (const table of WORKSPACE_TABLES) {
      expect(workspaceMigration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(runtimeSchema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(migration).toContain('uk_toolbox_quote_request');
    expect(migration).toContain('uk_toolbox_job_request');
    expect(migration).toContain('uk_toolbox_job_quote');
    expect(migration).toContain('uk_toolbox_artifact_job');
    expect(migration).toContain('uk_toolbox_save_receipt');
    expect(migration).toContain('uk_toolbox_save_request');
    expect(migration).toContain('lease_token CHAR(36) DEFAULT NULL');
    expect(migration).toContain('save_generation INT UNSIGNED NOT NULL DEFAULT 1');
    expect(migration).toContain("status VARCHAR(24) NOT NULL DEFAULT 'pending'");
    expect(runtimeSchema).toContain('character_maximum_length');
    expect(runtimeSchema).toContain('Number(rows[0].max_length || 0) < 24');
    expect(runtimeSchema).toContain('toolboxColumnMissing');
    expect(runtimeSchema).toContain('ADD COLUMN lease_token CHAR(36) DEFAULT NULL');
    expect(runtimeSchema).toContain('ADD COLUMN save_generation INT UNSIGNED NOT NULL DEFAULT 1 AFTER target_id');
    expect(migration.match(/COLLATE=utf8mb4_unicode_ci/gu)).toHaveLength(TOOLBOX_TABLES.length);
    expect(workspaceMigration.match(/COLLATE=utf8mb4_unicode_ci/gu)).toHaveLength(WORKSPACE_TABLES.length);
    expect(runtimeSchema.match(/COLLATE=utf8mb4_unicode_ci/gu)).toHaveLength(
      TOOLBOX_TABLES.length + WORKSPACE_TABLES.length,
    );
    expect(migration).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/iu);
    expect(workspaceMigration).toContain('uk_toolbox_workspace_resource');
    expect(workspaceMigration).toContain('idx_toolbox_workspace_session_time');
    expect(workspaceMigration).not.toMatch(/\b(content|body)\s+MEDIUMTEXT\b/iu);
  });

  it('只读 Schema 门禁覆盖五张事实表、关键索引和积分状态长度', async () => {
    const assertions = await readFile(fileURLToPath(assertionsUrl), 'utf8');

    for (const table of [...TOOLBOX_TABLES, ...WORKSPACE_TABLES]) expect(assertions).toContain(table);
    expect(assertions).toContain('missing_toolbox_table');
    expect(assertions).toContain('missing_toolbox_index');
    expect(assertions).toContain('invalid_toolbox_column_shape');
    expect(assertions).toContain('invalid_toolbox_column_default');
    expect(assertions).toContain('invalid_toolbox_index_definition');
    expect(assertions).toContain('invalid_points_operation_status_width');
    expect(assertions).toContain('uk_toolbox_save_request');
    expect(assertions).toContain('GROUP_CONCAT(column_name ORDER BY seq_in_index');
    expect(assertions).toContain('actual.non_unique<>expected.non_unique');
    expect(assertions).toContain("'lease_token', 'char', 36, 'YES'");
    expect(assertions).toContain("'toolbox_save_receipts', 'save_generation', 'int', NULL, 'NO'");
    expect(assertions).toContain("'toolbox_save_receipts', 'save_generation', '1'");
    expect(assertions).not.toContain('toolbox_projects');
    expect(assertions).not.toContain('toolbox_project_revisions');
  });

  it('帮助中心明确本地隐私、单介质计费、积分闭环和显式保存', async () => {
    const source = await readFile(fileURLToPath(knowledgeUrl), 'utf8');

    expect(source).toContain('原文件不会上传到轻笺服务器');
    expect(source).toContain('压缩前');
    expect(source).toContain('压缩后');
    expect(source).toContain('任务开始时先预占报价积分');
    expect(source).toContain('单次只会结算一种，不会双扣');
    expect(source).toContain('OCR 转文字属于固定计算型任务，只使用积分');
    expect(source).toContain('资料转笔记、研究简报、学习套件、概念图谱、多资料对照和知识库体检属于纯 AI 成果工具');
    expect(source).toContain('选择 AI 额度时按实际模型 token 进入知识工坊用量明细');
    expect(source).toContain('成果页不提供工具内追问');
    expect(source).not.toContain('点击“继续追问”');
    expect(source).toContain('只有点击“存入笔记”后才会创建笔记');
    expect(source).toContain('WHERE NOT EXISTS');
  });

  it('服务端发布先幂等补齐工具箱 Schema，再执行只读断言与 OCR 门禁', async () => {
    const deploy = await readFile(fileURLToPath(deployScriptUrl), 'utf8');
    const ensureIndex = deploy.indexOf('scripts/ensureToolboxSchema.js');
    const assertionIndex = deploy.indexOf('scripts/checkSchemaAssertions.js');
    expect(ensureIndex).toBeGreaterThan(-1);
    expect(assertionIndex).toBeGreaterThan(ensureIndex);
    expect(deploy).toContain('scripts/checkOcrRuntime.js');
  });
});
