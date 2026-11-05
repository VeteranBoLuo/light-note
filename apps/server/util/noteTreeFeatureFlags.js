export const NOTE_TREE_FEATURE = Object.freeze({
  READ: 'note_tree_read',
  WRITE: 'note_tree_write',
  MOBILE: 'note_tree_mobile',
  SUBTREE_TRASH: 'note_tree_subtree_trash',
  AI_BRANCH_SCOPE: 'ai_note_branch_scope',
  AI_BRANCH_ANALYSIS: 'ai_note_branch_analysis',
});

const FEATURE_NAMES = Object.freeze(Object.values(NOTE_TREE_FEATURE));
const FEATURE_SET = new Set(FEATURE_NAMES);
const ENV_PREFIX = Object.freeze({
  [NOTE_TREE_FEATURE.READ]: 'NOTE_TREE_READ',
  [NOTE_TREE_FEATURE.WRITE]: 'NOTE_TREE_WRITE',
  [NOTE_TREE_FEATURE.MOBILE]: 'NOTE_TREE_MOBILE',
  [NOTE_TREE_FEATURE.SUBTREE_TRASH]: 'NOTE_TREE_SUBTREE_TRASH',
  [NOTE_TREE_FEATURE.AI_BRANCH_SCOPE]: 'AI_NOTE_BRANCH_SCOPE',
  [NOTE_TREE_FEATURE.AI_BRANCH_ANALYSIS]: 'AI_NOTE_BRANCH_ANALYSIS',
});

function normalizedText(value) {
  return String(value ?? '').trim();
}

function explicitBoolean(value) {
  const normalized = normalizedText(value).toLowerCase();
  if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'off', 'no'].includes(normalized)) return false;
  return null;
}

// 页面树已全量开放，不随 NODE_ENV 变化；显式 false 是事故急停，Root 也不能绕过。
function rawFeatureEnabled(feature, identity = {}, env = process.env) {
  if (!FEATURE_SET.has(feature)) return false;
  if (explicitBoolean(env[`${ENV_PREFIX[feature]}_ENABLED`]) === false) return false;
  const actor = identity.actor || {};
  const subject = identity.subject || actor;
  return actor.role === 'root' || Boolean(normalizedText(subject.id));
}

/**
 * 返回当前 actor/subject 的页面树能力快照。下游能力依赖上游能力：例如分析开关打开，
 * 但目录范围本身关闭时，分析仍必须失败关闭，不能形成绕过读取开关的侧门。
 */
export function resolveNoteTreeFeatures(identity = {}, env = process.env) {
  const read = rawFeatureEnabled(NOTE_TREE_FEATURE.READ, identity, env);
  const write = read && rawFeatureEnabled(NOTE_TREE_FEATURE.WRITE, identity, env);
  const scope = read && rawFeatureEnabled(NOTE_TREE_FEATURE.AI_BRANCH_SCOPE, identity, env);
  return Object.freeze({
    [NOTE_TREE_FEATURE.READ]: read,
    [NOTE_TREE_FEATURE.WRITE]: write,
    [NOTE_TREE_FEATURE.MOBILE]: read && rawFeatureEnabled(NOTE_TREE_FEATURE.MOBILE, identity, env),
    [NOTE_TREE_FEATURE.SUBTREE_TRASH]:
      write && rawFeatureEnabled(NOTE_TREE_FEATURE.SUBTREE_TRASH, identity, env),
    [NOTE_TREE_FEATURE.AI_BRANCH_SCOPE]: scope,
    [NOTE_TREE_FEATURE.AI_BRANCH_ANALYSIS]:
      scope && rawFeatureEnabled(NOTE_TREE_FEATURE.AI_BRANCH_ANALYSIS, identity, env),
  });
}

export function noteTreeFeatureIdentity(req = {}) {
  const subject = req.resourceUser || req.user || {};
  const actor = req.billingUser || req.adminActor || req.user || {};
  return {
    actor: { id: normalizedText(actor.id), role: normalizedText(actor.role) || 'visitor' },
    subject: { id: normalizedText(subject.id), role: normalizedText(subject.role) || 'visitor' },
  };
}

export class NoteTreeFeatureError extends Error {
  constructor(feature) {
    super(`NOTE_TREE_FEATURE_DISABLED: ${feature}`);
    this.name = 'NoteTreeFeatureError';
    this.code = 'NOTE_TREE_FEATURE_DISABLED';
    this.feature = feature;
    // 关闭时不暴露功能存在性；客户端通过能力快照控制 UI。
    this.status = 404;
  }
}

export function assertNoteTreeFeature(req, feature, env = process.env) {
  const features = resolveNoteTreeFeatures(noteTreeFeatureIdentity(req), env);
  if (!features[feature]) throw new NoteTreeFeatureError(feature);
  return features;
}
