import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260828_toolbox_v1.sql', import.meta.url);
const workspaceMigrationUrl = new URL('../migrations/20260829_toolbox_workspaces.sql', import.meta.url);
const projectMigrationUrl = new URL('../migrations/20260830_toolbox_production_projects.sql', import.meta.url);
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
const PROJECT_TABLES = [
  'toolbox_projects',
  'toolbox_project_revisions',
  'toolbox_project_resources',
  'toolbox_project_revision_requests',
  'toolbox_schema_migrations',
];

describe('知识工具箱 Schema 与帮助迁移门禁', () => {
  it('增量迁移与运行时幂等 Schema 使用同一组事实表和关键唯一键', async () => {
    const [migration, workspaceMigration, projectMigration, runtimeSchema] = await Promise.all([
      readFile(fileURLToPath(migrationUrl), 'utf8'),
      readFile(fileURLToPath(workspaceMigrationUrl), 'utf8'),
      readFile(fileURLToPath(projectMigrationUrl), 'utf8'),
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
    for (const table of PROJECT_TABLES) {
      expect(projectMigration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
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
    expect(migration).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/iu);
    expect(workspaceMigration).toContain('uk_toolbox_workspace_resource');
    expect(workspaceMigration).toContain('idx_toolbox_workspace_session_time');
    expect(workspaceMigration).not.toMatch(/\b(content|body)\s+MEDIUMTEXT\b/iu);
    expect(projectMigration).toContain('uk_toolbox_project_create_request');
    expect(projectMigration).toContain('uk_toolbox_project_revision_request');
    expect(projectMigration).toContain('uk_toolbox_project_revision_no');
    expect(projectMigration).toContain('content_json JSON NOT NULL');
    expect(projectMigration).toContain('content_bytes INT UNSIGNED NOT NULL');
    expect(projectMigration).toContain('idx_toolbox_project_revision_storage');
    expect(projectMigration).toContain('uk_toolbox_project_revision_request_receipt');
    expect(projectMigration).toContain('trashed_at DATETIME DEFAULT NULL');
    expect(runtimeSchema).toContain('ADD COLUMN trashed_at DATETIME DEFAULT NULL AFTER last_opened_at');
    expect(runtimeSchema).toContain('ADD COLUMN label VARCHAR(200) DEFAULT NULL AFTER change_kind');
    expect(runtimeSchema).toContain('ADD COLUMN content_bytes INT UNSIGNED NOT NULL DEFAULT 0 AFTER content_json');
    expect(runtimeSchema).toContain('OCTET_LENGTH(CAST(content_json AS CHAR CHARACTER SET utf8mb4))');
    expect(runtimeSchema).toContain('SELECT GET_LOCK(?, 60) AS acquired');
    expect(runtimeSchema).toContain('project_revision_content_bytes_v1');
    expect(runtimeSchema).toContain('WHERE content_bytes = 0');
    expect(runtimeSchema).toContain('idx_toolbox_project_revision_storage (user_id, project_id, content_bytes)');
    expect(runtimeSchema).toContain('MODIFY COLUMN create_request_id VARCHAR(128) NOT NULL');
    expect(runtimeSchema).toContain('MODIFY COLUMN client_request_id VARCHAR(128) NOT NULL');
    expect(projectMigration).not.toMatch(/UPDATE\s+toolbox_project_revisions/iu);
  });

  it('只读 Schema 门禁覆盖五张事实表、关键索引和积分状态长度', async () => {
    const assertions = await readFile(fileURLToPath(assertionsUrl), 'utf8');

    for (const table of [...TOOLBOX_TABLES, ...WORKSPACE_TABLES, ...PROJECT_TABLES])
      expect(assertions).toContain(table);
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
    expect(assertions).toContain("'toolbox_project_revisions', 'content_bytes', 'int', NULL, 'NO'");
    expect(assertions).toContain("'idx_toolbox_project_revision_storage'");
    expect(assertions).toContain('incomplete_toolbox_content_bytes_backfill');
    expect(assertions).toContain('invalid_toolbox_project_revision_content_bytes');
    expect(assertions).toContain('uk_toolbox_project_revision_request_receipt');
  });

  it('帮助中心明确本地隐私、单介质计费、积分闭环和显式保存', async () => {
    const source = await readFile(fileURLToPath(knowledgeUrl), 'utf8');

    expect(source).toContain('原文件不会上传到轻笺服务器');
    expect(source).toContain('压缩前');
    expect(source).toContain('压缩后');
    expect(source).toContain('先预占报价积分');
    expect(source).toContain('同一次积分工具任务只消耗积分');
    expect(source).toContain('资料转笔记、研究简报、学习套件、概念图谱、多资料对照、知识库体检和 OCR 转文字');
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
