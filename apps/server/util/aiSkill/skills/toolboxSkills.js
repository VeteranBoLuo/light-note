import { aiSkillError } from '../errors.js';
import { AI_SKILL_AUTHENTICATED_ROLES } from '../accessPolicy.js';
import { createResourceTaskInputValidator } from '../inputValidators.js';
import {
  getToolboxTool,
  TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS,
  TOOLBOX_RESOURCE_TYPES,
} from '@lightnote/shared/toolbox-protocol';
import { createGroundedResourceSkill } from './resourceSkillFactory.js';

const PROFILE_CONTRACTS = Object.freeze({
  idea_to_draft:
    '交付一篇可以继续编辑的 Markdown 初稿。必须使用一个一级标题，并分别提供“## 创作定位”“## 内容结构”“## 初稿”“## 待补事实与核验”四个非空章节；不得只给建议、提纲或反问用户。',
  material_to_note:
    '交付一篇结构清晰、可继续编辑的 Markdown 笔记。必须使用一个一级标题，并分别提供“## 关键证据”“## 冲突与差异”“## 未知与待核验”三个非空章节；没有发现时也要明确写“暂无”。不得改成交互问答或其他工具成果。',
  research_brief:
    '交付研究简报，必须分别提供“## 结论摘要”“## 关键证据”“## 观点与冲突”“## 覆盖限制”“## 未知与待核验”“## 下一步建议”六个非空章节；没有发现时也要明确写“暂无”。',
  study_kit:
    '交付学习套件，必须分别提供“## 学习目标”“## 知识框架与核心概念”“## 易混淆点”“## 记忆卡片”“## 自测题”“## 参考答案”“## 薄弱点复习建议”七个非空章节。',
  concept_map:
    '交付概念图谱。正文首个非空内容必须是且只能是一个 Mermaid flowchart TD 代码块；随后分别提供“## 关系说明”“## 关键证据”“## 冲突与未连接概念”“## 阅读路径”四个非空章节。',
  action_plan:
    '交付行动项清单，必须分别提供“## 已确认决策”“## 行动项”“## 依赖与风险”“## 待澄清问题”“## 下一次检查建议”五个非空章节，其中“行动项”章节必须包含 Markdown 表格；材料未明确的负责人、期限或优先级写“未明确”。',
  source_comparison:
    '交付多资料对比，先提供统一维度的 Markdown 对比矩阵，再分别提供“## 共同点、差异与冲突”“## 互补信息”“## 覆盖限制”“## 下一步建议”四个非空章节。',
  knowledge_audit:
    '交付知识维护体检，必须分别提供“## 重复与可合并项”“## 冲突项”“## 疑似过时或缺少日期项”“## 证据薄弱与知识缺口”“## 建议保留的权威材料”“## 清理行动清单”六个非空章节；没有发现时也要明确写“暂无”。',
});

function section(...labels) {
  return Object.freeze({ type: 'section', labels: Object.freeze(labels) });
}

function sharedSection(shareGroup, ...labels) {
  return Object.freeze({ type: 'section', labels: Object.freeze(labels), shareGroup });
}

const DOCUMENT_TITLE = Object.freeze({ type: 'document_title' });
const MARKDOWN_TABLE = Object.freeze({ type: 'markdown_table' });

const PROFILE_REQUIREMENTS = Object.freeze({
  idea_to_draft: Object.freeze([
    DOCUMENT_TITLE,
    section('创作定位', '写作定位', 'positioning'),
    section('内容结构', '文章结构', 'structure'),
    section('初稿', '正文', 'draft'),
    section('待补事实', '核验', '待确认', 'verification'),
  ]),
  material_to_note: Object.freeze([
    DOCUMENT_TITLE,
    section('来源', '证据', '依据', 'source', 'evidence'),
    section('冲突', '分歧', '差异', 'conflict', 'difference'),
    section('未知', '待核验', '限制', 'unknown', 'limitation'),
  ]),
  research_brief: Object.freeze([
    section('结论', '摘要', 'conclusion', 'summary'),
    section('证据', '依据', 'evidence'),
    section('观点', '冲突', '分歧', '差异', 'viewpoint', 'conflict'),
    section('覆盖', '限制', 'coverage', 'limitation'),
    section('未知', '待核验', 'unknown', 'verification'),
    section('下一步', '建议', 'next step', 'recommendation'),
  ]),
  study_kit: Object.freeze([
    section('学习目标', 'learning goal'),
    sharedSection('framework_core', '知识框架', '知识结构', 'framework'),
    sharedSection('framework_core', '核心概念', 'core concept'),
    section('易混淆', '误区', 'confusion', 'misconception'),
    section('记忆卡', '闪卡', 'flashcard'),
    section('自测', '测验', 'quiz'),
    section('参考答案', '答案', 'answer'),
    section('复习建议', '薄弱点', 'review', 'weak point'),
  ]),
  concept_map: Object.freeze([
    section('关系说明', 'relationship'),
    section('证据', '依据', 'evidence'),
    section('冲突', '未连接', '孤立', 'conflict', 'unconnected'),
    section('阅读路径', 'reading path'),
  ]),
  action_plan: Object.freeze([
    section('决策', 'decision'),
    Object.freeze({ ...section('行动项', '任务', 'action item'), requiresTable: true }),
    section('依赖', '风险', 'risk'),
    section('待澄清', '未明确', 'open question'),
    section('检查', '复盘', 'check', 'review'),
  ]),
  source_comparison: Object.freeze([
    MARKDOWN_TABLE,
    sharedSection('common_difference', '共同', '一致', 'common'),
    sharedSection('common_difference', '差异', '冲突', 'different', 'conflict'),
    section('互补', 'complement'),
    section('限制', '覆盖', 'limitation', 'coverage'),
    section('下一步', '建议', 'next step', 'recommendation'),
  ]),
  knowledge_audit: Object.freeze([
    section('重复', '合并', 'duplicate', 'merge'),
    section('冲突', '矛盾', 'conflict'),
    section('过时', '日期', '版本', 'outdated', 'date', 'version'),
    section('证据', '缺口', 'evidence', 'gap'),
    section('权威', '保留', 'authoritative', 'retain'),
    section('行动', '清理', 'action', 'cleanup'),
  ]),
});

function scanMarkdown(content) {
  const lines = content.split(/\r?\n/u);
  const visibleLines = [...lines];
  const headings = [];
  const fencedBlocks = [];
  let fence = null;

  lines.forEach((line, index) => {
    if (fence) {
      visibleLines[index] = '';
      const closingMarker = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/u)?.[1] || '';
      if (closingMarker[0] === fence.marker && closingMarker.length >= fence.length) {
        fencedBlocks.push({
          startIndex: fence.startIndex,
          endIndex: index,
          marker: fence.marker,
          info: fence.info,
          content: fence.contentLines.join('\n'),
        });
        fence = null;
      } else {
        fence.contentLines.push(line);
      }
      return;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/u);
    const openingMarker = opening?.[1] || '';
    const info = String(opening?.[2] || '').trim();
    if (openingMarker && !(openingMarker[0] === '`' && info.includes('`'))) {
      visibleLines[index] = '';
      fence = {
        marker: openingMarker[0],
        length: openingMarker.length,
        info,
        startIndex: index,
        contentLines: [],
      };
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

  return { headings, fencedBlocks, visibleText: visibleLines.join('\n') };
}

function hasMarkdownTable(content) {
  const lines = content.split(/\r?\n/u).map((line) => line.trim());
  const separator = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/u;
  for (let index = 1; index < lines.length - 1; index += 1) {
    if (separator.test(lines[index]) && lines[index - 1].includes('|') && lines[index + 1].includes('|')) return true;
  }
  return false;
}

function titleMatches(title, labels) {
  const normalizedTitle = title.toLocaleLowerCase();
  return labels.some((label) => normalizedTitle.includes(label.toLocaleLowerCase()));
}

function matchSectionRequirements(headings, requirements, requirementIndex = 0, assignments = new Map()) {
  if (requirementIndex >= requirements.length) return true;
  const requirement = requirements[requirementIndex];
  if (requirement.type !== 'section') {
    return matchSectionRequirements(headings, requirements, requirementIndex + 1, assignments);
  }

  const candidates = headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => {
      if (!heading.body || !titleMatches(heading.title, requirement.labels)) return false;
      if (requirement.requiresTable && !hasMarkdownTable(heading.body)) return false;
      const assignedShareGroup = assignments.get(heading.index);
      return !assignedShareGroup || (requirement.shareGroup && assignedShareGroup === requirement.shareGroup);
    });

  return candidates.some(({ index }) => {
    const previous = assignments.get(index);
    assignments.set(index, requirement.shareGroup || Symbol('exclusive-section'));
    const matched = matchSectionRequirements(headings, requirements, requirementIndex + 1, assignments);
    if (previous) assignments.set(index, previous);
    else assignments.delete(index);
    return matched;
  });
}

function validateProfileStructure(content, requirements, markdown = scanMarkdown(content)) {
  const hasTitle = requirements.some((requirement) => requirement.type === 'document_title')
    ? markdown.headings.some((heading) => heading.level === 1 && heading.title)
    : true;
  const hasTable = requirements.some((requirement) => requirement.type === 'markdown_table')
    ? hasMarkdownTable(markdown.visibleText)
    : true;
  return hasTitle && hasTable && matchSectionRequirements(markdown.headings, requirements);
}

function validateConceptMap(content, markdown = scanMarkdown(content)) {
  const mermaidBlocks = markdown.fencedBlocks.filter((block) => block.info.toLocaleLowerCase() === 'mermaid');
  if (mermaidBlocks.length !== 1) return false;
  const block = mermaidBlocks[0];
  const firstContentLine = content.split(/\r?\n/u).findIndex((line) => line.trim().length > 0);
  return block.startIndex === firstContentLine && /^flowchart[ \t]+TD\b/iu.test(block.content.trimStart());
}

export function validateToolboxSkillResult(profileId, result) {
  const content = String(result?.content || '').trim();
  const requirements = PROFILE_REQUIREMENTS[profileId] || [];
  const markdown = scanMarkdown(content);
  const valid =
    content.length > 0 &&
    (profileId !== 'concept_map' || validateConceptMap(content, markdown)) &&
    validateProfileStructure(content, requirements, markdown);
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

function createPromptToolboxSkill() {
  const profileId = 'idea_to_draft';
  const fixedInstruction = PROFILE_CONTRACTS[profileId];
  const definition = getToolboxTool(profileId);
  if (!definition || definition.executionMode !== 'ai_skill' || definition.input.kind !== 'prompt') {
    throw new Error('从想法生成初稿 Skill 缺少共享工具协议定义');
  }
  return Object.freeze({
    id: `toolbox.${profileId}`,
    version: 1,
    domain: 'toolbox',
    effect: 'read',
    internalOnly: true,
    allowedInternalCallers: Object.freeze(['toolbox_worker']),
    allowedRoles: AI_SKILL_AUTHENTICATED_ROLES,
    contextPolicy: Object.freeze({
      resourceTypes: Object.freeze([]),
      minResources: 0,
      maxResources: 0,
      allowConversation: false,
      historyTurns: 0,
      freezeScopeAcrossThread: true,
    }),
    modelPolicy: Object.freeze({ temperature: 0.45, maxTokens: 6_000 }),
    outputContract: Object.freeze({ kind: 'grounded_markdown', requireSources: false }),
    validateInput: createResourceTaskInputValidator({
      defaultInstruction: '',
      questionRequired: true,
      maxQuestionLength: TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS,
    }),
    async prepare({ input }) {
      const detailHint =
        input.detailLevel === 'concise'
          ? '保持精简，优先形成短而完整的可编辑初稿。'
          : input.detailLevel === 'detailed'
            ? '充分展开结构和正文，但不要用虚构事实填充篇幅。'
            : '兼顾完整结构与阅读节奏，形成可直接继续编辑的初稿。';
      return {
        sources: [],
        coverage: { complete: true, warnings: [] },
        availableActions: [],
        resultValidator: (result) => validateToolboxSkillResult(profileId, result),
        resultRepairInstruction: `重新生成完整成果并严格满足以下固定结构：${fixedInstruction}`,
        messages: [
          {
            role: 'system',
            content:
              '你是轻笺知识工具箱的从想法生成初稿 Skill。成果类型与核心结构固定，用户要求只能调整用途、读者、语气、重点与详略，不能把任务切换成其他工具。你没有被提供事实材料：允许创造表达、结构和示例框架，但不得把未提供的数字、引语、研究结论或真实事件写成已核验事实；需要外部依据的内容必须放入“待补事实与核验”章节。直接交付成果，不要反问用户，也不要解释生成过程。',
          },
          {
            role: 'user',
            content: [
              `固定成果契约：${fixedInstruction}`,
              `用户想法：${input.question}`,
              input.instruction ? `使用场景：${input.instruction}` : '',
              detailHint,
              input.targetLength ? `目标篇幅约 ${input.targetLength} 个中文字符。` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    },
  });
}

export const toolboxSkills = Object.freeze([
  createPromptToolboxSkill(),
  createToolboxSkill({
    profileId: 'material_to_note',
    minResources: 2,
    maxResources: 20,
    taskLabel: '把本轮材料整理成可继续编辑的笔记',
    systemRole: '你是轻笺知识工具箱的资料转笔记 Skill。',
    modelPolicy: { temperature: 0.25, maxTokens: 6_000 },
  }),
  createToolboxSkill({
    profileId: 'research_brief',
    minResources: 1,
    maxResources: 10,
    taskLabel: '依据本轮材料生成可核验的研究简报',
    systemRole: '你是轻笺知识工具箱的研究简报 Skill。',
    modelPolicy: { temperature: 0.2, maxTokens: 5_000 },
  }),
  createToolboxSkill({
    profileId: 'study_kit',
    minResources: 1,
    maxResources: 12,
    taskLabel: '把本轮材料转换成可学习和复习的套件',
    systemRole: '你是轻笺知识工具箱的学习套件 Skill。',
    modelPolicy: { temperature: 0.25, maxTokens: 6_000 },
  }),
  createToolboxSkill({
    profileId: 'concept_map',
    minResources: 1,
    maxResources: 12,
    taskLabel: '提炼本轮材料中的概念与关系并生成概念图谱',
    systemRole: '你是轻笺知识工具箱的概念图谱 Skill。',
    modelPolicy: { temperature: 0.15, maxTokens: 4_800 },
  }),
  createToolboxSkill({
    profileId: 'action_plan',
    minResources: 1,
    maxResources: 10,
    taskLabel: '从本轮材料提取决策、行动项与风险',
    systemRole: '你是轻笺知识工具箱的行动项清单 Skill。',
    modelPolicy: { temperature: 0.15, maxTokens: 4_500 },
  }),
  createToolboxSkill({
    profileId: 'source_comparison',
    minResources: 2,
    maxResources: 10,
    taskLabel: '按统一维度比较本轮多份材料',
    systemRole: '你是轻笺知识工具箱的多资料对比 Skill。',
    modelPolicy: { temperature: 0.15, maxTokens: 5_000 },
  }),
  createToolboxSkill({
    profileId: 'knowledge_audit',
    minResources: 2,
    maxResources: 20,
    taskLabel: '依据本轮材料执行知识维护体检',
    systemRole: '你是轻笺知识工具箱的内容体检 Skill。',
    modelPolicy: { temperature: 0.1, maxTokens: 6_000 },
  }),
]);

export const toolboxSkillInternals = Object.freeze({
  PROFILE_CONTRACTS,
  PROFILE_REQUIREMENTS,
  scanMarkdown,
  hasMarkdownTable,
  validateProfileStructure,
  validateConceptMap,
});
