import pool from '../../../db/index.js';
import { withQueryResultMetadata } from '../toolResultMetadata.js';
import { decorateCloudFolderRows } from '../../services/cloudFolderTreeService.js';

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
  sourceType: 'folder',
  description:
    '查询当前账号已有的云空间文件夹树，返回可用于保存文件的 folderId、准确名称和完整路径。用户询问有哪些文件夹、要求选择保存位置，或没有给出明确目标时调用；同名文件夹必须依据完整路径让用户选择，并把选中的 folderId 传给 save_attachment_to_cloud。本工具只查询，不会新建文件夹。',
  routing: {
    targetScope: 'single_owner',
    requireAny: [
      /(?:有哪些|列出|查询|查找|查看|搜索).{0,20}(?:云空间)?(?:文件夹|目录)|(?:云空间)?(?:文件夹|目录).{0,20}(?:有哪些|列表|清单|保存位置)|folder(?:s)?.{0,20}(?:list|search|available)/iu,
    ],
    preferAny: [/(?:云空间)?(?:文件夹|目录|保存位置)|folders?/iu],
    excludeAny: [
      /(?:文件夹|目录).{0,12}(?:中的|里的|下面的).{0,16}(?:文件|图片|文档)|(?:查询|列出|查找).{0,16}(?:文件|图片|文档).{0,20}(?:文件夹|目录)/iu,
    ],
  },
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '可选，按文件夹名称或完整路径模糊搜索' },
      limit: { type: 'integer', description: '返回数量，默认 20，最大 50' },
    },
  },
  argumentAliases: ['name', 'folderName', 'folder_name'],
  normalizeArgs,
  requireRoot: false,
  async execute(input, ctx) {
    const args = normalizeArgs(input);
    const [rows] = await pool.query(
      `SELECT folders.id, folders.name, folders.parent_id, folders.sort, folders.create_time,
              COUNT(files.id) AS direct_file_count
         FROM folders
         LEFT JOIN files ON files.folder_id = folders.id
                        AND files.create_by = folders.create_by
                        AND files.del_flag = 0
        WHERE folders.create_by = ? AND folders.del_flag = 0
        GROUP BY folders.id, folders.name, folders.parent_id, folders.sort, folders.create_time
        ORDER BY folders.sort ASC, folders.create_time DESC, folders.id ASC`,
      [ctx.userId],
    );
    const keyword = args.keyword.toLocaleLowerCase();
    const decorated = decorateCloudFolderRows(rows);
    const matches = keyword
      ? decorated.filter((row) =>
          String(row.full_path || row.name || '')
            .toLocaleLowerCase()
            .includes(keyword),
        )
      : decorated;
    const items = matches.slice(0, args.limit).map((row) => ({
      id: String(row.id),
      name: row.name || '未命名文件夹',
      parentId: row.parent_id == null ? null : String(row.parent_id),
      depth: Number(row.depth || 1),
      fullPath: row.full_path || row.name || '未命名文件夹',
      fileCount: Number(row.direct_file_count || 0),
    }));
    return withQueryResultMetadata({
      total: matches.length,
      items,
    });
  },
  transform(raw) {
    const items = raw?.items || [];
    if (!items.length) return '没有找到匹配的云空间文件夹。也可以选择不放入文件夹，文件仍会出现在“全部文件”中。';
    return `找到 ${items.length} 个云空间文件夹：\n${items
      .map((item, index) => `${index + 1}. [folder:${item.id}] ${item.fullPath}（${item.fileCount} 个直接文件）`)
      .join('\n')}`;
  },
  summarize(raw) {
    return raw?.items?.length ? `云空间文件夹查询：${raw.items.length} 个结果` : '云空间文件夹查询：无结果';
  },
};
