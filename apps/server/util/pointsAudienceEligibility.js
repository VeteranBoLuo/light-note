// These predicates use the account alias shared by the points award queries.
export const POINTS_ACCOUNT_ELIGIBLE = "u.del_flag = 0 AND COALESCE(u.role, 'user') = 'user' AND u.id <> 'visitor'";
export const POINTS_ACCOUNT_NOT_BANNED = `NOT EXISTS (
  SELECT 1 FROM security_account_bans sab WHERE sab.user_id = u.id AND sab.is_active = 1
)`;

export function isPointsAudienceAccount(user) {
  return Boolean(user?.id && user.id !== 'visitor' && (user.role ?? 'user') === 'user');
}
