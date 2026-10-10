import pool from '../../db/index.js';
import { comparisonTableMarkdown, COMPARISON_CELL_MAX_CHARS } from '@lightnote/shared/comparison-table';
import { toolboxError } from './errors.js';

export async function reviewComparisonCell({ userId, artifactId, input, database = pool }) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['version', 'sourceId', 'columnIndex', 'value'].includes(key)) ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    !Number.isSafeInteger(input.columnIndex) ||
    input.columnIndex < 0 ||
    typeof input.sourceId !== 'string' ||
    !input.sourceId ||
    input.sourceId.length > 200 ||
    typeof input.value !== 'string' ||
    input.value.length > COMPARISON_CELL_MAX_CHARS
  )
    throw toolboxError('TOOLBOX_COMPARISON_INVALID', '核对内容格式无效');
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM toolbox_artifacts WHERE id = ? AND user_id = ? AND tool_id = 'source_comparison'
       AND status = 'ready' AND expires_at > NOW() LIMIT 1 FOR UPDATE`,
      [artifactId, userId],
    );
    const artifact = rows[0];
    if (!artifact) throw toolboxError('TOOLBOX_ARTIFACT_NOT_FOUND', '成果不存在或已过期', 404);
    if (Number(artifact.artifact_version) !== input.version)
      throw toolboxError('TOOLBOX_COMPARISON_CONFLICT', '成果已更新，请刷新后核对', 409);
    const [jobs] = await connection.query(
      'SELECT save_status FROM toolbox_jobs WHERE id = ? AND user_id = ? FOR UPDATE',
      [artifact.job_id, userId],
    );
    if (!jobs.length || ['saving', 'saved'].includes(jobs[0].save_status))
      throw toolboxError('TOOLBOX_COMPARISON_SAVED', '成果正在保存或已存为笔记，请在笔记中继续编辑', 409);
    const meta = typeof artifact.meta_json === 'string' ? JSON.parse(artifact.meta_json) : artifact.meta_json;
    const table = meta?.comparisonTable;
    const cell = table?.rows.find((row) => row.sourceId === input.sourceId)?.cells[input.columnIndex];
    if (!cell) throw toolboxError('TOOLBOX_COMPARISON_INVALID', '对比单元格不存在');
    const value = input.value.trim();
    cell.originalValue ??= cell.value;
    cell.value = value;
    cell.edited = value !== cell.originalValue;
    cell.reviewed = true;
    await connection.query(
      'UPDATE toolbox_artifacts SET content = ?, meta_json = ?, artifact_version = artifact_version + 1 WHERE id = ? AND user_id = ?',
      [comparisonTableMarkdown(table), JSON.stringify(meta), artifactId, userId],
    );
    await connection.commit();
    return { version: input.version + 1 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
