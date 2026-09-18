import { lockActiveUserForUpdate } from '../aiOutboundDispatchGuard.js';
import { json } from './organizeSuggestionStorage.js';
import { suggestionError } from './organizeSuggestionRules.js';

export const maintenanceActor = (options) => json(options)?.maintenanceActorId;

export function publicOrganizeOptions(options) {
  const { maintenanceActorId, ...visible } = json(options) || {};
  return visible;
}

// Only server-created run options can authorize a visitor subject. Do not relax
// the shared AI guard: visitors must remain unable to dispatch AI themselves.
export async function lockOrganizeIdentity(c, userId, options) {
  const actorId = maintenanceActor(options);
  if (!actorId) return lockActiveUserForUpdate(c, userId);
  const actor = await lockActiveUserForUpdate(c, actorId);
  if (actor.role !== 'root') throw suggestionError('AI_ACCOUNT_UNAVAILABLE', '维护管理员当前不可用', 403);
  await lockVisitorSubject(c, userId);
  return actor;
}

export async function lockVisitorSubject(c, userId) {
  const [rows] = await c.query('SELECT id,role,del_flag FROM user WHERE id=? FOR UPDATE', [userId]);
  const subject = rows[0];
  if (!subject || subject.role !== 'visitor' || Number(subject.del_flag || 0) !== 0)
    throw suggestionError('AI_ACCOUNT_UNAVAILABLE', '游客示例账号当前不可用', 403);
  return { id: String(subject.id), role: 'visitor' };
}

export async function lockOrganizeRunOwner(c, userId, id) {
  const [rows] = await c.query('SELECT options_json FROM organize_suggestion_runs WHERE user_id=? AND id=?', [
    userId,
    id,
  ]);
  if (!rows.length) throw suggestionError('ORGANIZE_RUN_NOT_FOUND', '整理任务不存在', 404);
  return lockOrganizeIdentity(c, userId, rows[0].options_json);
}
