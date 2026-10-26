import pool from '../../db/index.js';
import { readCloudSpacePreference, mergeCloudSpacePreference } from '../cloudSpacePreferences.js';

function fail(code, status) {
  throw Object.assign(new Error(code), { code, status });
}

export async function cloudSpacePreference({ user, input, write = false, database = pool }) {
  if (!user?.id || !['user', 'root', 'test'].includes(user.role)) fail('CLOUD_PREFERENCE_LOGIN_REQUIRED', 403);
  if (
    write &&
    (!input ||
      typeof input.includeDescendants !== 'boolean' ||
      Object.keys(input).some((key) => key !== 'includeDescendants'))
  )
    fail('CLOUD_PREFERENCE_INVALID', 400);
  if (!write) {
    const [[account]] = await database.query('SELECT preferences FROM user WHERE id = ? AND del_flag = 0 LIMIT 1', [
      user.id,
    ]);
    if (!account) fail('CLOUD_PREFERENCE_ACCOUNT_UNAVAILABLE', 403);
    return readCloudSpacePreference(account.preferences);
  }
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [[account]] = await connection.query(
      'SELECT preferences FROM user WHERE id = ? AND del_flag = 0 LIMIT 1 FOR UPDATE',
      [user.id],
    );
    if (!account) fail('CLOUD_PREFERENCE_ACCOUNT_UNAVAILABLE', 403);
    await connection.query('UPDATE user SET preferences = ? WHERE id = ? AND del_flag = 0', [
      mergeCloudSpacePreference(account.preferences, input.includeDescendants),
      user.id,
    ]);
    await connection.commit();
    return { includeDescendants: input.includeDescendants };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
