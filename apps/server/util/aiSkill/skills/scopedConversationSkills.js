import { createGroundedResourceSkill } from './resourceSkillFactory.js';
import { AI_SCOPED_CONVERSATION_MAX_RESOURCES } from '@lightnote/shared/ai-skill-protocol';

const MAX_SCOPED_RESOURCES = AI_SCOPED_CONVERSATION_MAX_RESOURCES;
const HISTORY_TURNS = 4;

function withScopePolicy(base, scopeMode, selectorType) {
  const tagScope = scopeMode === 'tag_resources';
  return Object.freeze({
    ...base,
    // 客户端只提交标签/目录选择器，真实材料数只能在 Context Resolver 展开后得知。
    // 必须用完整权威范围重新编译 Provider 阶段与额度预占，不能按一个标签或零个
    // 客户端 ref 低估最多 50 项材料（以及标签范围内的图片识别调用）。
    providerPlanPolicy: Object.freeze({ ...base.providerPlanPolicy, contextAware: true }),
    contextPolicy: Object.freeze({
      scopeMode,
      selectorType,
      resourceTypes: Object.freeze(tagScope ? ['tag'] : []),
      minResources: tagScope ? 1 : 0,
      maxResources: tagScope ? 1 : 0,
      expandedResourceTypes: Object.freeze(tagScope ? ['bookmark', 'note', 'file'] : ['note']),
      minExpandedResources: 1,
      maxExpandedResources: MAX_SCOPED_RESOURCES,
      allowConversation: true,
      historyTurns: HISTORY_TURNS,
      freezeScopeAcrossThread: true,
    }),
  });
}

const tagAskBase = createGroundedResourceSkill({
  id: 'tag.ask',
  domain: 'tag',
  resourceTypes: ['note', 'bookmark', 'file'],
  minResources: 1,
  maxResources: MAX_SCOPED_RESOURCES,
  taskLabel: '只根据当前标签关联材料回答用户问题',
  defaultInstruction: '',
  questionRequired: true,
  systemRole:
    '你是轻笺标签空间的范围问答 Skill。当前标签只是服务端已经固定的材料边界；材料没有答案时必须明确说明，不能使用标签外知识补全。',
  historyTurns: HISTORY_TURNS,
  modelPolicy: { temperature: 0.15, maxTokens: 2_600 },
});

const noteDirectoryAskBase = createGroundedResourceSkill({
  id: 'note.ask_directory',
  domain: 'note',
  resourceTypes: ['note'],
  minResources: 1,
  maxResources: MAX_SCOPED_RESOURCES,
  taskLabel: '只根据当前笔记目录范围回答用户问题',
  defaultInstruction: '',
  questionRequired: true,
  systemRole:
    '你是轻笺笔记库的目录范围问答 Skill。目录范围由服务端固定；材料没有答案时必须明确说明，不能使用目录外知识补全。',
  historyTurns: HISTORY_TURNS,
  modelPolicy: { temperature: 0.15, maxTokens: 2_600 },
});

export const scopedConversationSkills = Object.freeze([
  withScopePolicy(tagAskBase, 'tag_resources', 'tag'),
  withScopePolicy(noteDirectoryAskBase, 'note_directory', 'note_directory'),
]);

export const scopedConversationSkillInternals = Object.freeze({
  MAX_SCOPED_RESOURCES,
  HISTORY_TURNS,
  withScopePolicy,
});
