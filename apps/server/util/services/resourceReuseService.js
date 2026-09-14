import pool from '../../db/index.js';

const resources = Object.freeze({
  bookmark: { table: 'bookmark', owner: 'user_id' },
  note: { table: 'note', owner: 'create_by' },
  file: { table: 'files', owner: 'create_by' },
});

export function normalizeResourceReuseInput(body) {
  if (!body || Array.isArray(body) || Object.keys(body).some((key) => !['resourceType', 'resourceId'].includes(key)))
    return null;
  const { resourceType, resourceId } = body;
  if (!Object.hasOwn(resources, resourceType) || !['string', 'number'].includes(typeof resourceId)) return null;
  const id = String(resourceId);
  if (!/^[a-zA-Z0-9:_-]{1,255}$/.test(id)) return null;
  if (resourceType === 'file' && (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) return null;
  return { resourceType, resourceId: id };
}

export async function recordResourceReuse(userId, input, { db = pool } = {}) {
  const normalized = normalizeResourceReuseInput(input);
  if (!userId || !normalized) return { accepted: false };
  const { resourceType, resourceId } = normalized;
  const resource = resources[resourceType];
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Same account lock as deletion: a delayed event cannot recreate a deleted account's telemetry.
    const [users] = await connection.query(
      {
        sql: "SELECT id FROM user WHERE id = ? AND role = 'user' AND del_flag = 0 FOR UPDATE",
        timeout: 3000,
      },
      [userId],
    );
    if (!users.length) {
      await connection.rollback();
      return { accepted: false };
    }
    const [existing] = await connection.query(
      {
        sql: 'SELECT 1 FROM resource_reuse_milestones WHERE user_id = ? AND resource_type = ? LIMIT 1',
        timeout: 3000,
      },
      [userId, resourceType],
    );
    if (existing.length) {
      await connection.commit();
      return { accepted: true };
    }
    // Resource identifiers are only lookup inputs. Time comes from the server, never the client.
    // Existing content DATETIME uses Beijing time; refuse to infer dates in a misconfigured session.
    const [result] = await connection.query(
      {
        sql: `INSERT INTO resource_reuse_milestones (user_id, resource_type, first_opened_at)
        SELECT ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 8 HOUR)
        FROM ${resource.table} r WHERE r.id = ? AND r.${resource.owner} = ? AND r.del_flag = 0
        AND r.create_time < DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))
        AND TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) = 480
        AND EXISTS (SELECT 1 FROM resource_reuse_metadata WHERE id = 1)
        AND NOT EXISTS (SELECT 1 FROM onboarding_seed_resources s
          WHERE s.user_id = ? AND s.resource_type = ? AND s.resource_id = CAST(r.id AS BINARY))`,
        timeout: 3000,
      },
      [userId, resourceType, resourceId, userId, userId, resourceType],
    );
    await connection.commit();
    return { accepted: result.affectedRows > 0 };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}
