import pool from '../../db/index.js';
import { listToolboxHomeWorkspaces } from './workspace.js';

import { preferences } from './projectPreference.js';
export async function readProjectEntry(userId, database = pool) {
  const [[users], [counts], projects] = await Promise.all([
    database.query('SELECT preferences FROM user WHERE id = ? AND del_flag = 0', [userId]),
    database.query('SELECT COUNT(*) AS total FROM toolbox_workspaces WHERE user_id = ?', [userId]),
    listToolboxHomeWorkspaces({ userId, database }),
  ]);
  return {
    dismissed: preferences(users[0]?.preferences).workshopIntroDismissed === true,
    hasProjects: Number(counts[0]?.total || 0) > 0,
    projects: projects.continue.filter((item) => item.status === 'active').slice(0, 3),
  };
}
export async function dismissProjectIntro(userId, database = pool) {
  await database.query(
    "UPDATE user SET preferences = JSON_SET(CASE WHEN JSON_VALID(preferences) THEN preferences ELSE JSON_OBJECT() END, '$.workshopIntroDismissed', JSON_EXTRACT('true', '$')) WHERE id = ? AND del_flag = 0",
    [userId],
  );
  return { dismissed: true };
}
