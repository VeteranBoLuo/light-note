import { readFile } from 'node:fs/promises';

export async function knowledgeManorSchemaReady(db) {
  const [rows] = await db.query(`SELECT table_name AS tableName, column_name AS columnName FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name IN ('knowledge_manors','knowledge_manor_operations')`);
  const fields = new Set(rows.map(r => `${r.tableName}.${r.columnName}`));
  const columnsReady = ['knowledge_manors.user_id', 'knowledge_manors.revision', 'knowledge_manors.state_json',
    'knowledge_manor_operations.user_id', 'knowledge_manor_operations.request_id',
    'knowledge_manor_operations.command_hash', 'knowledge_manor_operations.result_json',
    'knowledge_manor_operations.model_version', 'knowledge_manor_operations.revision',
    'knowledge_manor_operations.points_delta'].every(k => fields.has(k));
  if (!columnsReady) return false;
  const [tables] = await db.query(`SELECT table_name AS tableName, engine AS engineName FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN ('knowledge_manors','knowledge_manor_operations')`);
  if (tables.length !== 2 || tables.some(t => t.engineName?.toLowerCase() !== 'innodb')) return false;
  const [keys] = await db.query(`SELECT table_name AS tableName,
    GROUP_CONCAT(column_name ORDER BY seq_in_index) AS keyColumns,
    SUM(sub_part IS NOT NULL) AS prefixed FROM information_schema.statistics
    WHERE table_schema=DATABASE() AND table_name IN ('knowledge_manors','knowledge_manor_operations')
      AND index_name='PRIMARY' GROUP BY table_name`);
  return keys.some(k => k.tableName === 'knowledge_manors' && k.keyColumns === 'user_id' && Number(k.prefixed) === 0)
    && keys.some(k => k.tableName === 'knowledge_manor_operations' && k.keyColumns === 'user_id,request_id' && Number(k.prefixed) === 0);
}

export async function migrateKnowledgeManorSchema(db) {
  const sql = await readFile(new URL('../../migrations/20261024_knowledge_manor.sql', import.meta.url), 'utf8');
  for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
    await db.query(statement);
  }
}
