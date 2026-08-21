/** 把用户输入转为 SQL LIKE 的字面量片段；调用方仍需自行添加前后 `%`。 */
export function escapeLikePattern(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}
