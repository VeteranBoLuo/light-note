export const ONBOARDING_SEED_VERSION = 'v1';

export async function markOnboardingSeedResource(connection, { userId, resourceType, resourceId }) {
  if (!userId || !resourceType || resourceId == null) {
    const error = new Error('ONBOARDING_SEED_MARKER_INVALID: 示例资源来源标记参数不完整');
    error.code = 'ONBOARDING_SEED_MARKER_INVALID';
    throw error;
  }

  await connection.query(
    `INSERT IGNORE INTO onboarding_seed_resources
      (user_id, resource_type, resource_id, seed_version)
     VALUES (?, ?, ?, ?)`,
    [String(userId), String(resourceType), String(resourceId), ONBOARDING_SEED_VERSION],
  );
}
