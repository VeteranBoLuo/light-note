import { createHash } from 'node:crypto';

export function searchSeekScope(userId, options, types, type = '') {
  const fields = [
    'keyword',
    'sort',
    'date',
    'tagNames',
    'untagged',
    'fileExtensions',
    'todoStatus',
    'todoPriorities',
    'todoDue',
  ];
  return createHash('sha256')
    .update(JSON.stringify([userId, types, type, fields.map((field) => options[field])]))
    .digest('hex');
}

export function searchOrderKeys({ sort, keyword, titleColumn, updatedColumn, fallbackOrder, idColumn }) {
  let keys;
  if (sort === 'name') keys = [{ sql: `LOWER(COALESCE(${titleColumn}, ''))`, direction: 'ASC' }];
  else if (sort === 'updated') keys = [{ sql: updatedColumn, direction: 'DESC', date: true }];
  else {
    // These are fixed repository-owned SQL expressions, never request text.
    const pieces = [];
    let depth = 0,
      start = 0;
    for (let i = 0; i < fallbackOrder.length; i += 1) {
      if (fallbackOrder[i] === '(') depth += 1;
      if (fallbackOrder[i] === ')') depth -= 1;
      if (fallbackOrder[i] === ',' && depth === 0) {
        pieces.push(fallbackOrder.slice(start, i));
        start = i + 1;
      }
    }
    pieces.push(fallbackOrder.slice(start));
    keys = pieces.map((part) => {
      const match = /^(.*?)(?:\s+(ASC|DESC))?$/i.exec(part.trim());
      return {
        sql: match[1],
        direction: match[2] || 'ASC',
        date: match[1] === updatedColumn || match[1] === 't.due_at',
      };
    });
    if (keyword)
      keys.unshift({
        sql: `CASE WHEN LOWER(COALESCE(${titleColumn}, '')) = LOWER(?) THEN 3 WHEN LOWER(COALESCE(${titleColumn}, '')) LIKE LOWER(?) THEN 2 WHEN LOWER(COALESCE(${titleColumn}, '')) LIKE LOWER(?) THEN 1 ELSE 0 END`,
        direction: 'DESC',
        params: [keyword, `${keyword}%`, `%${keyword}%`],
      });
  }
  return [...keys, { sql: idColumn, direction: 'DESC', id: true }];
}

export function buildSearchSeek(keys, options) {
  if (!options.orderedSeekScope)
    return {
      projection: '',
      selectParams: [],
      where: '',
      whereParams: [],
      limitSql: 'LIMIT ? OFFSET ?',
      limitParams: [options.pageSize, options.offset],
    };
  const cursor = options.cursorSeek;
  if (
    cursor &&
    (cursor.v !== 1 ||
      cursor.scope !== options.orderedSeekScope ||
      !Array.isArray(cursor.values) ||
      cursor.values.length !== keys.length ||
      cursor.values.some(
        (value) =>
          value !== null &&
          !(typeof value === 'string' && value.length <= 4096) &&
          !(typeof value === 'number' && Number.isFinite(value)),
      ))
  ) {
    throw Object.assign(new Error('Invalid search cursor'), { code: 'SEARCH_CURSOR_INVALID' });
  }
  const selectParams = [];
  const projection =
    keys
      .map((key, i) => {
        selectParams.push(...(key.params || []));
        const sql = key.date
          ? `DATE_FORMAT(${key.sql}, '%Y-%m-%d %H:%i:%s.%f')`
          : key.id
            ? `CAST(${key.sql} AS CHAR)`
            : key.sql;
        return `${sql} AS _searchSeek${i}`;
      })
      .join(', ') + ', ';
  const whereParams = [];
  const terms = [];
  if (cursor)
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i],
        value = cursor.values[i];
      if (value === null && key.direction === 'DESC') continue;
      const parts = [];
      for (let j = 0; j < i; j += 1) {
        parts.push(`${keys[j].sql} <=> ?`);
        whereParams.push(...(keys[j].params || []), cursor.values[j]);
      }
      if (value === null) {
        parts.push(`${key.sql} IS NOT NULL`);
        whereParams.push(...(key.params || []));
      } else if (key.direction === 'ASC') {
        parts.push(`${key.sql} > ?`);
        whereParams.push(...(key.params || []), value);
      } else {
        parts.push(`(${key.sql} < ? OR ${key.sql} IS NULL)`);
        whereParams.push(...(key.params || []), value, ...(key.params || []));
      }
      terms.push(`(${parts.join(' AND ')})`);
    }
  return {
    projection,
    selectParams,
    where: cursor ? ` AND (${terms.join(' OR ') || '0 = 1'})` : '',
    whereParams,
    limitSql: cursor ? 'LIMIT ?' : 'LIMIT ? OFFSET ?',
    limitParams: cursor ? [options.pageSize] : [options.pageSize, options.offset],
  };
}

export function takeSearchSeekRows(rows) {
  return rows.map((row) => {
    const values = [];
    for (let i = 0; Object.hasOwn(row, `_searchSeek${i}`); i += 1) {
      values.push(row[`_searchSeek${i}`]);
      delete row[`_searchSeek${i}`];
    }
    return values.length ? values : null;
  });
}

// 深分页使用发布门禁已断言的账号前缀索引；5.7 可能误选时间优先的旧索引。
// 名称仅来自仓库常量，不接受请求传入的 SQL 标识符。
export function searchSeekIndexHint(type, options) {
  if (!options.orderedSeekScope || !options.cursorSeek || options.sort !== 'updated') return '';
  const indexes = { bookmark: 'idx_bookmark_search_time', file: 'idx_files_search_time' };
  return Object.hasOwn(indexes, type) ? `FORCE INDEX (${indexes[type]})` : '';
}
