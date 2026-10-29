import { readFile } from 'node:fs/promises';

const columns = {
  action: 'VARCHAR(48) DEFAULT NULL',
  effectful: 'TINYINT UNSIGNED DEFAULT NULL',
  resource_delta_json: 'JSON DEFAULT NULL',
};
const indexes = [
  ['knowledge_manor_operations', 'idx_manor_ops_time', 'created_at,user_id,request_id'],
  ['knowledge_manor_operations', 'idx_manor_ops_user_time', 'user_id,created_at,request_id'],
  ['knowledge_manors', 'idx_manor_updated', 'updated_at,user_id'],
];

export async function knowledgeManorAdminSchemaReady(db) {
  const [rows] =
    await db.query(`SELECT table_name AS tableName,column_name AS columnName FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name IN ('knowledge_manor_operations','knowledge_manor_runtime')`);
  const fields = new Set(rows.map((r) => `${r.tableName}.${r.columnName}`));
  if (
    ![
      ...Object.keys(columns).map((k) => `knowledge_manor_operations.${k}`),
      ...['id', 'mode', 'message', 'revision', 'updated_by', 'updated_at', 'coverage_started_at'].map(
        (k) => `knowledge_manor_runtime.${k}`,
      ),
    ].every((k) => fields.has(k))
  )
    return false;
  const [[table]] = await db.query(
    "SELECT engine AS engineName FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='knowledge_manor_runtime'",
  );
  if (table?.engineName?.toLowerCase() !== 'innodb') return false;
  const [keys] =
    await db.query(`SELECT table_name AS tableName,index_name AS name,GROUP_CONCAT(column_name ORDER BY seq_in_index) AS fields,SUM(sub_part IS NOT NULL) AS prefixed
    FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('knowledge_manor_runtime','knowledge_manors','knowledge_manor_operations') GROUP BY table_name,index_name`);
  if (
    ![...indexes, ['knowledge_manor_runtime', 'PRIMARY', 'id']].every(([table, name, fields]) =>
      keys.some((k) => k.tableName === table && k.name === name && k.fields === fields && Number(k.prefixed) === 0),
    )
  )
    return false;
  const [[row]] = await db.query('SELECT mode FROM knowledge_manor_runtime WHERE id=1');
  return ['open', 'maintenance'].includes(row?.mode);
}

export async function migrateKnowledgeManorAdminSchema(db) {
  const sql = await readFile(new URL('../../migrations/20261029_knowledge_manor_admin.sql', import.meta.url), 'utf8');
  await db.query(sql.replace(/^--.*$/gm, '').trim());
  const [existing] = await db.query(
    "SELECT column_name AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='knowledge_manor_operations'",
  );
  const names = new Set(existing.map((r) => r.name));
  for (const [name, type] of Object.entries(columns))
    if (!names.has(name)) await db.query(`ALTER TABLE knowledge_manor_operations ADD COLUMN ${name} ${type}`);
  for (const [table, name, fields] of indexes) {
    const [found] = await db.query(
      'SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=?',
      [table, name],
    );
    if (!found.length) await db.query(`ALTER TABLE ${table} ADD INDEX ${name} (${fields})`);
  }
  await db.query("INSERT IGNORE INTO knowledge_manor_runtime (id,mode) VALUES (1,'open')");
}
