/** Navigation counts and workspace attention filters share the same date boundaries. */
export function todoDueSql(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  const overdue = `((${prefix}due_at IS NOT NULL AND ${prefix}due_at < NOW())
    OR (${prefix}due_at IS NULL AND ${prefix}occurrence_date IS NOT NULL AND ${prefix}occurrence_date < CURDATE()))`;
  const today = `((${prefix}due_at IS NOT NULL AND ${prefix}due_at >= NOW() AND ${prefix}due_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY))
    OR (${prefix}due_at IS NULL AND ${prefix}occurrence_date = CURDATE()))`;
  return {
    overdue,
    today,
    week: `((${prefix}due_at IS NOT NULL AND ${prefix}due_at >= NOW()
    AND ${prefix}due_at < DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE())) DAY))
    OR (${prefix}due_at IS NULL AND ${prefix}occurrence_date >= CURDATE()
    AND ${prefix}occurrence_date < DATE_ADD(CURDATE(), INTERVAL (7 - WEEKDAY(CURDATE())) DAY)))`,
    attention: `(${prefix}status = 'pending' AND (${overdue} OR ${today}))`,
  };
}
