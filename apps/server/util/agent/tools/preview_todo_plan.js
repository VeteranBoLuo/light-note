import { previewTodoPlan } from '../../services/todoSeriesService.js';
import { assertTodoPlanFeatureEnabled } from '../../todoPlanFeature.js';
import { normalizeTodoPlanToolArgs, TODO_PLAN_TOOL_PARAMETERS } from '../todoPlanToolShared.js';

export default {
  name: 'preview_todo_plan',
  description:
    '确定性预览完整待办计划，不写入数据。用于核对任务实例数、首末日期、每项开始/截止时间、提醒 Job 数以及过去日期歧义。用户要求每日/每周/每月重复、共 N 次、完成后再次安排或多次催办时，应先使用本工具，不要自行心算末项日期。',
  parameters: TODO_PLAN_TOOL_PARAMETERS,
  normalizeArgs: normalizeTodoPlanToolArgs,
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
