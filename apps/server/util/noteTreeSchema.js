import pool from '../db/index.js';

const NOTE_TREE_COLUMNS = [
  {
    name: 'parent_id',
    ddl: "`parent_id` varchar(255) NULL COMMENT '页面树父笔记 ID，NULL 表示我的知识库根层' AFTER `type`",
  },
  {
    name: 'tree_delete_batch_id',
    ddl: "`tree_delete_batch_id` varchar(255) NULL COMMENT '同一次页面子树软删除的恢复批次' AFTER `parent_id`",
  },
];

const NOTE_TREE_INDEXES = [
  {
    name: 'idx_note_owner_parent_order',
    columns: [
      { name: 'create_by', subPart: 64 },
      { name: 'parent_id', subPart: 64 },
      { name: 'del_flag', subPart: 8 },
      { name: 'is_top' },
      { name: 'sort' },
      { name: 'update_time' },
      { name: 'id', subPart: 64 },
    ],
  },
  {
    name: 'idx_note_tree_delete_batch',
    columns: [
      { name: 'create_by', subPart: 64 },
      { name: 'tree_delete_batch_id', subPart: 64 },
      { name: 'del_flag', subPart: 8 },
    ],
  },
  { name: 'idx_note_parent', columns: [{ name: 'parent_id' }] },
];

function indexColumnSignature(column) {
  return `${column.name}${column.subPart ? `(${column.subPart})` : ''}`;
}

function schemaMismatch(detail) {
  const error = new Error(`NOTE_TREE_SCHEMA_MISMATCH:${detail}`);
  error.code = 'NOTE_TREE_SCHEMA_MISMATCH';
  return error;
}

async function ensureColumn({ name, ddl }) {
  const [rows] = await pool.query(
    `SELECT column_type AS columnType, is_nullable AS isNullable
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note' AND COLUMN_NAME = ?
      LIMIT 1`,
    [name],
  );
  if (!rows.length) {
    await pool.query(`ALTER TABLE \`note\` ADD COLUMN ${ddl}`);
    return;
  }
  const columnType = String(rows[0]?.columnType ?? rows[0]?.column_type ?? '').toLowerCase();
  const isNullable = String(rows[0]?.isNullable ?? rows[0]?.is_nullable ?? '').toUpperCase();
  if (columnType !== 'varchar(255)' || isNullable !== 'YES') throw schemaMismatch(`note.${name}`);
}

async function ensureIndex({ name, columns }) {
  const [rows] = await pool.query(
    `SELECT column_name AS columnName, sub_part AS subPart
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'note' AND INDEX_NAME = ?
      ORDER BY seq_in_index`,
    [name],
  );
  if (!rows.length) {
    await pool.query(
      `ALTER TABLE \`note\` ADD KEY \`${name}\` (${columns
        .map((column) => `\`${column.name}\`${column.subPart ? `(${column.subPart})` : ''}`)
        .join(', ')})`,
    );
    return;
  }
  const actualColumns = rows.map((row) => {
    const columnName = String(row?.columnName ?? row?.column_name ?? '');
    const subPart = Number(row?.subPart ?? row?.sub_part ?? 0);
    return `${columnName}${subPart > 0 ? `(${subPart})` : ''}`;
  });
  if (actualColumns.join(',') !== columns.map(indexColumnSignature).join(',')) throw schemaMismatch(`note.${name}`);
}

/**
 * 页面树 Schema 的启动期幂等保障。
 *
 * 手工 migration 仍是发布时的主路径；这里负责旧实例漏跑迁移时补齐缺失列/索引。
 * 已存在但形状不符时失败关闭，不在应用启动时自动 DROP/重建未知索引。
 */
export async function ensureNoteTreeSchema() {
  for (const column of NOTE_TREE_COLUMNS) await ensureColumn(column);
  for (const index of NOTE_TREE_INDEXES) await ensureIndex(index);
}
