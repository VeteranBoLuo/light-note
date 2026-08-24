import helpAnswer from './skills/helpAnswer.js';
import searchAnswer from './skills/searchAnswer.js';
import { bookmarkSkills } from './skills/bookmarkSkills.js';
import bookmarkParseSkill from './skills/bookmarkParseSkill.js';
import { fileSkills } from './skills/fileSkills.js';
import { noteSkills } from './skills/noteSkills.js';
import noteTransformSkill from './skills/noteTransformSkill.js';
import { searchSelectedSkills } from './skills/searchSelectedSkills.js';
import { todoSkills } from './skills/todoSkills.js';
import { todoExtractionSkills } from './skills/todoExtractionSkills.js';
import { aiSkillError } from './errors.js';

const definitions = Object.freeze([
  searchAnswer,
  helpAnswer,
  ...searchSelectedSkills,
  ...fileSkills,
  ...noteSkills,
  noteTransformSkill,
  ...bookmarkSkills,
  bookmarkParseSkill,
  ...todoSkills,
  ...todoExtractionSkills,
]);
const registry = new Map(definitions.map((definition) => [`${definition.id}@${definition.version}`, definition]));

export function resolveAiSkill(skillId, version) {
  const definition = registry.get(`${String(skillId || '')}@${Number(version)}`);
  if (!definition) throw aiSkillError('AI_SKILL_NOT_FOUND', '不支持该 AI 能力或版本', 404);
  return definition;
}

export function listAiSkills() {
  return definitions.map((definition) => ({
    id: definition.id,
    version: definition.version,
    domain: definition.domain,
    effect: definition.effect,
  }));
}
