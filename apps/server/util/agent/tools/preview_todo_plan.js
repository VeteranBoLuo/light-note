import { previewTodoPlan } from '../../services/todoSeriesService.js';
import { assertTodoPlanFeatureEnabled } from '../../todoPlanFeature.js';
import { normalizeTodoPlanToolArgs, TODO_PLAN_TOOL_PARAMETERS } from '../todoPlanToolShared.js';
import { EXPLICIT_PREVIEW_ONLY_PATTERN } from '../semanticPatterns.js';

export default {
  name: 'preview_todo_plan',
  description:
    '确定性预览待办与提醒，不写入数据。每日/每周/每月提醒默认预览为一条待办上的 singleTaskReminder；只有用户明确要求每次分别完成时才预览 independent 多实例计划。',
  routing: {
    requireAny: [EXPLICIT_PREVIEW_ONLY_PATTERN],
    preferAny: [/(?:预览|模拟|试算|演示|preview|dry[ -]?run|simulate)/iu],
  },
  parameters: TODO_PLAN_TOOL_PARAMETERS,
  normalizeArgs: normalizeTodoPlanToolArgs,
  validatePlanArgs(input) {
    previewTodoPlan(normalizeTodoPlanToolArgs(input));
  },
  requireRoot: false,
  async execute(input) {
    assertTodoPlanFeatureEnabled('ai');
    const preview = previewTodoPlan(normalizeTodoPlanToolArgs(input));
    return {
      ...preview,
      occurrences: preview.occurrences.slice(0, 12),
      reminderMoments: preview.reminderMoments.slice(0, 12),
    };
  },
  transform(raw) {
    const required = raw?.requiredChoices?.includes('pastPolicy')
      ? ' 首项已经过去，创建前必须请用户选择“保留逾期 / 从今天重启 / 跳过错过项”。'
      : '';
    return `计划预览：${raw?.displaySummary?.title || ''}；${raw?.displaySummary?.range || ''}；${raw?.displaySummary?.timing || ''}；${raw?.displaySummary?.reminder || ''}。提醒投递 ${raw?.reminderJobCount || 0} 条。${required}`;
  },
};
