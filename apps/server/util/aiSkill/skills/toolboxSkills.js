import { aiSkillError } from '../errors.js';
import {
  getToolboxTool,
  TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS,
  TOOLBOX_RESOURCE_TYPES,
} from '@lightnote/shared/toolbox-protocol';
import { createGroundedResourceSkill } from './resourceSkillFactory.js';

const PROFILE_CONTRACTS = Object.freeze({
  material_to_note:
    '交付一篇结构清晰、可继续编辑的 Markdown 笔记。必须使用一个一级标题，并分别提供“## 关键证据”“## 冲突与差异”“## 未知与待核验”三个非空章节；没有发现时也要明确写“暂无”。不得改成交互问答或其他工具成果。',
});

function section(...labels) {
  return Object.freeze({ type: 'section', labels: Object.freeze(labels) });
}

const DOCUMENT_TITLE = Object.freeze({ type: 'document_title' });

const PROFILE_REQUIREMENTS = Object.freeze({
  material_to_note: Object.freeze([
    DOCUMENT_TITLE,
    section('来源', '证据', '依据', 'source', 'evidence'),
    section('冲突', '分歧', '差异', 'conflict', 'difference'),
    section('未知', '待核验', '限制', 'unknown', 'limitation'),
  ]),
});

function scanMarkdown(content) {
  const lines = content.split(/\r?\n/u);
  const visibleLines = [...lines];
  const headings = [];
  let fence = null;

  lines.forEach((line, index) => {
    if (fence) {
      visibleLines[index] = '';
      const closingMarker = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/u)?.[1] || '';
      if (closingMarker[0] === fence.marker && closingMarker.length >= fence.length) fence = null;
      return;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/u);
    const openingMarker = opening?.[1] || '';
    const info = String(opening?.[2] || '').trim();
    if (openingMarker && !(openingMarker[0] === '`' && info.includes('`'))) {
      visibleLines[index] = '';
      fence = { marker: openingMarker[0], length: openingMarker.length };
      return;
    }
    if (/^(?: {4}|\t)/u.test(line)) {
      visibleLines[index] = '';
      return;
    }
    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/u);
    if (heading) headings.push({ index, level: heading[1].length, title: heading[2].trim() });
  });

  headings.forEach((heading) => {
    const end = headings.find(
      (candidate) => candidate.index > heading.index && candidate.level <= heading.level,
    )?.index;
    const bodyLines = visibleLines.slice(heading.index + 1, end ?? visibleLines.length);
    heading.body = bodyLines
      .filter((line) => !/^ {0,3}#{1,6}[ \t]+/u.test(line))
      .join('\n')
      .trim();
  });

  return { headings };
}

function titleMatches(title, labels) {
  const normalizedTitle = title.toLocaleLowerCase();
  return labels.some((label) => normalizedTitle.includes(label.toLocaleLowerCase()));
}

function matchSectionRequirements(headings, requirements, requirementIndex = 0, assigned = new Set()) {
  if (requirementIndex >= requirements.length) return true;
  const requirement = requirements[requirementIndex];
  if (requirement.type !== 'section') {
    return matchSectionRequirements(headings, requirements, requirementIndex + 1, assigned);
  }
  return headings.some((heading) => {
    if (!heading.body || assigned.has(heading) || !titleMatches(heading.title, requirement.labels)) return false;
    assigned.add(heading);
    const matched = matchSectionRequirements(headings, requirements, requirementIndex + 1, assigned);
    assigned.delete(heading);
    return matched;
  });
}

function validateProfileStructure(content, requirements, markdown = scanMarkdown(content)) {
  const hasTitle = requirements.some((requirement) => requirement.type === 'document_title')
    ? markdown.headings.some((heading) => heading.level === 1 && heading.title)
    : true;
  return hasTitle && matchSectionRequirements(markdown.headings, requirements);
}

export function validateToolboxSkillResult(profileId, result) {
  const content = String(result?.content || '').trim();
  const requirements = PROFILE_REQUIREMENTS[profileId] || [];
  const markdown = scanMarkdown(content);
  const valid =
    content.length > 0 && validateProfileStructure(content, requirements, markdown);
  if (!valid) {
    throw aiSkillError('AI_SKILL_OUTPUT_PROFILE_INVALID', 'AI 返回内容没有满足当前工具的固定成果结构', 502, {
      profileId,
    });
  }
  return result;
}

function createToolboxSkill({ profileId, minResources, maxResources, taskLabel, systemRole, modelPolicy }) {
  const fixedInstruction = PROFILE_CONTRACTS[profileId];
  const definition = getToolboxTool(profileId);
  if (!definition || definition.executionMode !== 'ai_skill') {
    throw new Error(`工具箱 Skill Profile 缺少共享工具协议定义：${profileId}`);
  }
  return createGroundedResourceSkill({
    id: `toolbox.${profileId}`,
    domain: 'toolbox',
    resourceTypes: definition.input.resourceTypes || TOOLBOX_RESOURCE_TYPES,
    minResources: definition.input.minItems ?? minResources,
    maxResources: definition.input.maxItems ?? maxResources,
    taskLabel,
    defaultInstruction: '',
    maxQuestionLength: TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS,
    fixedInstruction,
    systemRole,
    historyTurns: 0,
    internalOnly: true,
    allowedInternalCallers: ['toolbox_worker'],
    modelPolicy,
    resultValidator: (result) => validateToolboxSkillResult(profileId, result),
    resultRepairInstruction: `重新生成完整成果并严格满足以下固定结构：${fixedInstruction}`,
  });
}

export const toolboxSkills = Object.freeze([
  createToolboxSkill({
    profileId: 'material_to_note',
    minResources: 2,
    maxResources: 20,
    taskLabel: '把本轮材料整理成可继续编辑的笔记',
    systemRole: '你是轻笺知识工具箱的资料转笔记 Skill。',
    modelPolicy: { temperature: 0.25, maxTokens: 6_000 },
  }),
]);

export const toolboxSkillInternals = Object.freeze({
  PROFILE_CONTRACTS,
  PROFILE_REQUIREMENTS,
  scanMarkdown,
  validateProfileStructure,
});
