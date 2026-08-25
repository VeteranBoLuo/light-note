/**
 * AI Skill 的产品能力角色。
 *
 * test 是用于运营统计过滤的内部账号角色，不是受限账号；它应与 user 一样使用
 * 正常产品能力。root 额外拥有后台权限，但在普通产品能力中同样属于已登录角色。
 */
export const AI_SKILL_AUTHENTICATED_ROLES = Object.freeze(['user', 'test', 'root']);

/** 仅限公开、无私有资源读取的 Skill 使用。 */
export const AI_SKILL_PUBLIC_ROLES = Object.freeze(['visitor', ...AI_SKILL_AUTHENTICATED_ROLES]);
