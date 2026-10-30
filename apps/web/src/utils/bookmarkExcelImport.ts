export interface BookmarkExcelImportItem {
  name: string;
  url: string;
  description: string;
  tagNames: string[];
}

/**
 * 把 Excel 首个工作表的行转换成书签导入条目；缺少必需列时返回 null。
 * 书签页导出的表和「数据与备份」里的 书签.xlsx 都用「书签名」表头、「|」分隔标签；
 * 早期备份表头是「标题」、标签用「, 」分隔，同样兼容。网页正文、收藏时间等其他列不导入。
 */
export function parseBookmarkExcelRows(rows: Record<string, string>[]): BookmarkExcelImportItem[] | null {
  const first = rows[0];
  if (!first) return null;
  const nameKey = '书签名' in first ? '书签名' : '标题' in first ? '标题' : '';
  if (!nameKey || !('网址' in first) || !('描述' in first)) return null;
  const separator = nameKey === '标题' ? /[|,，]/ : /\|/;
  return rows.map((item) => ({
    name: String(item[nameKey] ?? '').trim(),
    url: String(item['网址'] ?? '').trim(),
    description: String(item['描述'] ?? '').trim(),
    tagNames: Array.from(
      new Set(
        String(item['标签'] || '')
          .split(separator)
          .map((tagName) => tagName.trim())
          .filter(Boolean),
      ),
    ),
  }));
}
