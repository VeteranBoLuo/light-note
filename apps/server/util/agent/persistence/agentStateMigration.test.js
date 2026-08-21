import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../../migrations/20260821_agent_runtime_state.sql', import.meta.url);
const assertionsUrl = new URL('../../../migrations/schema-assertions.sql', import.meta.url);

describe('Agent Runtime Phase 2 Schema', () => {
  it('一次性建立五个最小权威实体且默认不包含运行时启用或数据回填', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    for (const table of [
      'ai_agent_conversation_state',
      'ai_agent_run',
      'ai_agent_source_set',
      'ai_agent_result_set',
      'ai_agent_artifact_version',
    ]) {
      expect(source).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(source).toContain('revision BIGINT UNSIGNED NOT NULL DEFAULT 0');
    expect(source).toContain('UNIQUE KEY uk_ai_agent_result_handle (conversation_id, handle_id)');
    expect(source).toContain('UNIQUE KEY uk_ai_agent_artifact_chain_version (artifact_chain_id, version)');
    expect(source).toContain('ON DELETE CASCADE');
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|ai_|FROM)/iu);
  });

  it('只读 Schema 门禁覆盖五张表、关键列和恢复索引', async () => {
    const source = await readFile(fileURLToPath(assertionsUrl), 'utf8');

    expect(source).toContain("SELECT 'ai_agent_conversation_state'");
    expect(source).toContain("SELECT 'ai_agent_run'");
    expect(source).toContain("SELECT 'ai_agent_source_set'");
    expect(source).toContain("SELECT 'ai_agent_result_set'");
    expect(source).toContain("SELECT 'ai_agent_artifact_version'");
    expect(source).toContain('[8A] missing_agent_runtime_index');
    expect(source).toContain('idx_ai_agent_source_digest');
    expect(source).toContain('uk_ai_agent_artifact_chain_version');
  });
});
