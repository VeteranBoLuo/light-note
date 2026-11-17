/**
 * Writers take a shared lock before the database timestamps a scoring fact.
 * Settlement takes the exclusive lock before reading the week's facts.
 * The caller holds the lock until its own transaction ends.
 */
export async function lockLeaderboardFacts(conn, { forSettlement = false } = {}) {
  if (!forSettlement && !process.env.POINTS_LEADERBOARD_OPEN_WEEK) return;
  const lock = forSettlement ? 'FOR UPDATE' : 'LOCK IN SHARE MODE';
  const [[row]] = await conn.query('SELECT id FROM leaderboard_settlement_lock WHERE id = 1 ' + lock);
  if (!row) {
    throw Object.assign(new Error('Leaderboard settlement lock is missing'), { code: 'LEADERBOARD_LOCK_MISSING' });
  }
}
