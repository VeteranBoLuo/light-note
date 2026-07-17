import pool from '../../../db/index.js';

function normalizeArgs(args = {}) {
  const keyword = String(args.keyword || args.name || args.folderName || args.folder_name || '').trim();
  const rawLimit = Number(args.limit || 20);
  return {
    keyword: keyword.slice(0, 255),
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20,
  };
}

export default {
  name: 'query_cloud_folders',
  description:
    '查询当前账号已有的云空间文件夹，返回可用于保存文件的 folderId 和准确名称。用户询问有哪些文件夹、要求选择保存位置，或没有给出明确目标时调用；已给出精确文件夹名的保存请求应直接传给 save_attachment_to_cloud.folderName。本工具只查询，不会新建文件夹。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '可选，按文件夹名称模糊搜索' },
      limit: { type: 'integer', description: '返回数量，默认 20，最大 50' },
    },
  },
  normalizeArgs,
  requireRoot: false,
  async execute(input, ctx) {
    const args = normalizeArgs(input);
    let where = 'folders.create_by = ? AND folders.del_flag = 0';
    const params = [ctx.userId];
    if (args.keyword) {
      where += " AND folders.name LIKE CONCAT('%', ?, '%')";
      params.push(args.keyword);
    }
    params.push(args.limit);
    const [rows] = await pool.query(
      `SELECT folders.id, folders.name, folders.parent_id, COUNT(files.id) AS file_count
         FROM folders
         LEFT JOIN files ON files.folder_id = folders.id
                        AND files.create_by = folders.create_by
                        AND files.del_flag = 0
        WHERE ${where}
        GROUP BY folders.id, folders.name, folders.parent_id, folders.sort, folders.create_time
        ORDER BY folders.sort ASC, folders.create_time DESC
        LIMIT ?`,
      params,
    );
    return {
      total: rows.length,
      items: rows.map((row) => ({
        id: String(row.id),
        name: row.name || '未命名文件夹',
        parentId: row.parent_id == null ? null : String(row.parent_id),
        fileCount: Number(row.file_count || 0),
      })),
    };
  },
  transform(raw) {
    const items = raw?.items || [];
    if (!items.length) return '没有找到匹配的云空间文件夹。可选择保存到云空间根目录。';
    return `找到 ${items.length} 个云空间文件夹：\n${items
      .map((item, index) => `${index + 1}. [folder:${item.id}] ${item.name}（${item.fileCount} 个文件）`)
      .join('\n')}`;
  },
  summarize(raw) {
    return raw?.items?.length ? `云空间文件夹查询：${raw.items.length} 个结果` : '云空间文件夹查询：无结果';
  },
};
