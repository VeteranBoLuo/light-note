/**
 * SQL 控制台的执行前判定。
 *
 * 抽成独立模块是为了能测：这里判错的代价是**不可逆的数据丢失**，
 * 而误判的两个方向不对称——漏判（该拦没拦）会丢数据，多判只是多点一次确认，
 * 所以下面所有边界都往「宁可多问一次」偏。
 */

/** 破坏性 SQL 关键字：命中则要求二次确认。控制台可直接改库，误按回车的代价不可逆。 */
const MUTATION_SQL_PATTERN = /\b(delete|drop|truncate|update|insert|alter|replace|grant|revoke)\b/i;

/** 去掉字符串字面量与注释，避免 `SELECT '... delete ...'` 这类内容触发误判 */
function stripLiteralsAndComments(statement: string): string {
  return String(statement || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // /* 块注释 */
    .replace(/--[^\n]*/g, ' ') // -- 行注释
    .replace(/#[^\n]*/g, ' ') // # 行注释（MySQL）
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''") // 单引号字符串
    .replace(/"(?:[^"\\]|\\.|"")*"/g, '""'); // 双引号字符串
}

/** 命中的破坏性关键字（大写）；没有则返回空串 */
export function describeMutation(statement: string): string {
  const matched = stripLiteralsAndComments(statement).match(MUTATION_SQL_PATTERN);
  return matched ? matched[0].toUpperCase() : '';
}

/**
 * 无 WHERE 的 DELETE / UPDATE：会命中整张表，和「删一行」是两回事，
 * 值得比普通写操作更醒目的提示。
 *
 * 判定刻意保守：只要语句里出现了 WHERE 就不算无差别操作（哪怕 WHERE 属于子查询）。
 * 反过来把带子查询 WHERE 的语句误判成全表，会让真正的全表警告变成狼来了。
 */
export function isUnscopedWrite(statement: string): boolean {
  const sql = stripLiteralsAndComments(statement);
  if (!/\b(delete|update)\b/i.test(sql)) return false;
  if (/\bwhere\b/i.test(sql)) return false;
  // LIMIT 也能限定影响范围（MySQL 允许 DELETE ... LIMIT n）
  if (/\blimit\s+\d+/i.test(sql)) return false;
  return true;
}

export type SqlConfirmation = { title: string; content: string };

/** 执行前的确认文案；返回 null 表示这条语句不需要确认（只读查询） */
export function buildSqlConfirmation(statement: string): SqlConfirmation | null {
  const mutation = describeMutation(statement);
  if (!mutation) return null;
  const preview = String(statement || '')
    .trim()
    .slice(0, 300);
  if (isUnscopedWrite(statement)) {
    return {
      title: `⚠ ${mutation} 没有 WHERE，将影响整张表`,
      content: `这条语句没有 WHERE 也没有 LIMIT，会命中表里的**每一行**，且无法自动回滚。\n确认要对全表执行吗？\n\n${preview}`,
    };
  }
  return {
    title: `确认执行 ${mutation}`,
    content: `这条语句会修改数据库且无法自动回滚，请确认语句与 WHERE 条件无误：\n\n${preview}`,
  };
}
