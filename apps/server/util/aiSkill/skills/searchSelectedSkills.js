import { createGroundedResourceSkill } from './resourceSkillFactory.js';

const PRIVATE_RESOURCE_TYPES = ['note', 'bookmark', 'file', 'todo'];

export const searchSelectedSkills = Object.freeze([
  createGroundedResourceSkill({
    id: 'search.summarize_selected',
    domain: 'search',
    resourceTypes: PRIVATE_RESOURCE_TYPES,
    minResources: 1,
    maxResources: 20,
    taskLabel: '总结资源中心当前选中的材料',
    defaultInstruction: '跨类型整理主题、关键事实、联系、冲突和下一步建议。',
    systemRole: '你是轻笺资源中心的选中材料总结 Skill。',
    historyTurns: 0,
  }),
  createGroundedResourceSkill({
    id: 'search.compare_selected',
    domain: 'search',
    resourceTypes: PRIVATE_RESOURCE_TYPES,
    minResources: 2,
    maxResources: 10,
    taskLabel: '比较资源中心当前选中的材料',
    defaultInstruction: '逐项比较共同点、差异、冲突、互补信息与覆盖限制。',
    systemRole: '你是轻笺资源中心的跨类型比较 Skill。',
    historyTurns: 0,
  }),
]);
