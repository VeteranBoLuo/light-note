import { FILE_CATEGORY_ORDER, FILE_CATEGORY_RULES } from '@lightnote/shared/file-category';

export {
  FILE_CATEGORY_ORDER,
  resolveFileCategory,
  normalizeFileCategory,
  normalizeFileMimeType as normalizeMimeType,
  getFileCategoryExtension as getFileExtension,
} from '@lightnote/shared/file-category';

function toSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * 从共享规则按原顺序编译 CASE，数据库先分类过滤，再执行 LIMIT/OFFSET。
 * 参数只能由代码传入可信列名/SQL 表达式，不接受用户输入。
 * files 没有分类列；categorySql 仅用于存在历史分类的读模型兜底。
 */
export function buildFileCategorySql({
  fileNameSql = 'files.file_name',
  fileTypeSql = 'files.file_type',
  categorySql,
} = {}) {
  const name = `TRIM(COALESCE(${fileNameSql}, ''))`;
  const mime = `BINARY LOWER(TRIM(SUBSTRING_INDEX(COALESCE(${fileTypeSql}, ''), ';', 1)))`;
  const extension = `BINARY LOWER(SUBSTRING_INDEX(${name}, '.', -1))`;
  const hasExtension = `(LOCATE('.', ${name}, 2) > 0 AND RIGHT(${name}, 1) <> '.')`;
  const cases = FILE_CATEGORY_RULES.map((rule) => {
    const conditions = [];
    if (rule.extensions)
      conditions.push(
        `(${hasExtension} AND ${extension} IN (${rule.extensions.map(toSqlString).join(', ')}))`,
      );
    if (rule.mimeTypes) conditions.push(`${mime} IN (${rule.mimeTypes.map(toSqlString).join(', ')})`);
    if (rule.mimePrefixes)
      conditions.push(...rule.mimePrefixes.map((prefix) => `${mime} LIKE ${toSqlString(`${prefix}%`)}`));
    const match = `(${conditions.join(' OR ')})`;
    return `WHEN ${match} THEN ${toSqlString(rule.category)}`;
  });
  if (categorySql) {
    const category = `LOWER(TRIM(COALESCE(${categorySql}, '')))`;
    cases.push(
      `WHEN BINARY ${category} IN (${FILE_CATEGORY_ORDER.map(toSqlString).join(', ')}) THEN ${category}`,
    );
  }
  return `(CASE ${cases.join(' ')} ELSE 'other' END)`;
}
