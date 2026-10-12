import { AI_SKILL_AUTHENTICATED_ROLES } from '../accessPolicy.js';
import { callStructuredSkillModel } from '../structuredModel.js';
import { aiSkillError } from '../errors.js';
import {
  planTool,
  extractTool,
  validatePlan,
  validateRecords,
  planMessages,
  extractionMessages,
  sourcePayload,
  extractionRepairInstruction,
} from '../../extraction/contract.js';
const completeTool = {
  ...extractTool,
  parameters: {
    ...extractTool.parameters,
    properties: { ...extractTool.parameters.properties, complete: { type: 'boolean' } },
    required: ['records', 'complete'],
  },
};
export const extractionSkills = ['suggest', 'extract'].map((mode) =>
  Object.freeze({
    id: `toolbox.extraction_${mode}`,
    version: 1,
    domain: 'toolbox',
    effect: 'read',
    internalOnly: true,
    allowedInternalCallers: ['extraction_worker'],
    allowedRoles: AI_SKILL_AUTHENTICATED_ROLES,
    contextPolicy: {
      resourceTypes: [],
      minResources: 0,
      maxResources: 0,
      allowConversation: false,
      historyTurns: 0,
      freezeScopeAcrossThread: true,
    },
    modelPolicy: { temperature: 0, maxTokens: 8192, timeoutMs: 90000 },
    providerPlanPolicy: { modelGenerationCalls: 1, outputRepairCalls: 1 },
    outputContract: { kind: 'structured_draft', requireSources: false },
    validateInput(input) {
      if (
        input &&
        typeof input === 'object' &&
        Object.keys(input).some((key) => !['source', 'goal', 'plan'].includes(key))
      )
        throw aiSkillError('AI_SKILL_INPUT_UNKNOWN_FIELD', '包含未知的提取参数');
      if (!input || typeof input !== 'object' || typeof input.goal !== 'string' || input.goal.length > 1000)
        throw aiSkillError('EXTRACTION_INPUT_INVALID', '提取参数无效');
      sourcePayload(input.source);
      if (mode === 'extract' && !input.plan?.fields?.length)
        throw aiSkillError('EXTRACTION_INPUT_INVALID', '缺少提取字段');
      return input;
    },
    async prepare({ input, dependencies = {} }) {
      const extractionTool = structuredClone(completeTool);
      const cells = extractionTool.parameters.properties.records.items.properties.cells;
      if (mode === 'extract') {
        cells.minItems = input.plan.fields.length;
        cells.maxItems = input.plan.fields.length;
        const maxSegment = input.source.segments.length - 1;
        extractionTool.parameters.properties.records.items.properties.anchor.properties.segment.maximum = maxSegment;
        cells.items.properties.evidence.items.properties.segment.maximum = maxSegment;
      }
      return {
        sources: [],
        coverage: {
          complete: input.source.complete,
          warnings: input.source.complete ? [] : ['extraction_window_scope'],
        },
        availableActions: [],
        async callModel({ signal, trace, modelPolicy }) {
          const result = await (dependencies.callStructuredSkillModel || callStructuredSkillModel)({
            signal,
            trace,
            modelPolicy,
            beforeRequest: dependencies.beforeRequest,
            repairableErrorCodes: [
              'AI_SKILL_STRUCTURED_OUTPUT_MISSING',
              'AI_SKILL_STRUCTURED_OUTPUT_INVALID',
              'EXTRACTION_CONTRACT_INVALID',
            ],
            buildRepairInstruction: extractionRepairInstruction,
            structuredTool: mode === 'suggest' ? planTool : extractionTool,
            messages:
              mode === 'suggest'
                ? planMessages(input)
                : [
                    ...extractionMessages(input, input.plan),
                    {
                      role: 'user',
                      content:
                        '只在已处理本次全部片段、输出未省略任何条目时设置 complete=true。无法完整输出时 complete=false。最多 100 条记录，超限不得声称完整。相邻片段可能是同一条目的续页，尽量以条目起始位置作为 anchor。',
                    },
                  ],
            validateArguments(raw) {
              if (mode === 'suggest') return validatePlan(raw);
              if (raw.complete === false) throw aiSkillError('EXTRACTION_OUTPUT_INCOMPLETE', '本段提取未完整完成', 502);
              if (raw.complete !== true || Object.keys(raw).some((key) => !['complete', 'records'].includes(key)))
                throw aiSkillError('AI_SKILL_STRUCTURED_OUTPUT_INVALID', '提取输出格式无效', 502);
              return validateRecords({ records: raw.records }, input.plan, input.source);
            },
          });
          return { kind: 'structured_draft', ...(mode === 'suggest' ? { plan: result } : { records: result }) };
        },
      };
    },
  }),
);
