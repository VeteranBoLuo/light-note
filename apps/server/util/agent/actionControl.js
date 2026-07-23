const RETRY_PATTERNS = [
  /^(?:请)?(?:重新|再次|再)(?:执行|操作|试)(?:一下|一次)?$/,
  /^(?:请)?(?:重试|再试)(?:一下|一次)?$/,
  /^(?:请)?继续(?:执行|刚才(?:的)?操作|上(?:一|个)操作)$/,
  /^(?:请)?(?:重新)?执行(?:刚才|上(?:一|个))(?:的)?操作$/,
  /^(?:retry|try\s+again|rerun|re-run|do\s+it\s+again)(?:\s+(?:it|that|the\s+last\s+action))?$/i,
];

function normalizeControlText(value) {
  return String(value || '')
    .trim()
    .replace(/[，。！？!?；;、,.]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:那就|那|好的|好|行|可以|麻烦)\s*/u, '')
    .replace(/吧$/u, '');
}

/**
 * 只识别不携带新参数的“动作控制语句”。
 * 一旦用户同时补充了目标或参数，就交回正常 Planner，避免擅自复用旧参数。
 */
export function parseAgentActionControl(message) {
  const text = normalizeControlText(message);
  if (!text) return null;
  return RETRY_PATTERNS.some((pattern) => pattern.test(text)) ? { type: 'retry' } : null;
}

export function actionControlMessage(state, locale = 'zh-CN', count = 0) {
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  const messages = english
    ? {
        none: 'There is no previous action that can be retried safely. Please describe the target action.',
        pending: 'The previous action is still awaiting your confirmation. Use its confirmation card to continue.',
        unknown:
          'The previous action may still be processing or awaiting verification. Retry from the original confirmation card; a new action will not be created.',
        succeeded:
          'The previous action has a verified server receipt and is already complete. It will not be repeated.',
        succeeded_batch:
          'The previous actions have verified server receipts and are already complete. They will not be repeated.',
        ambiguous: `There are ${count || 'multiple'} previous actions that could be retried. Please name the target action.`,
        unavailable: 'The previous action could not be prepared safely. Please describe the target action again.',
      }
    : {
        none: '没有可安全重试的上一项操作，请明确说明要执行的目标。',
        pending: '上一项操作仍在等待你的确认，请直接使用原确认卡继续。',
        unknown: '上一项操作仍在执行或核验结果中，请回到原确认卡安全重试；系统不会新建重复操作。',
        succeeded: '上一项操作已有服务端成功回执，已经完成，不会重复执行。',
        succeeded_batch: '上一批操作均已有服务端成功回执，已经完成，不会重复执行。',
        ambiguous: `上一轮有 ${count || '多'} 项操作可能需要重试，请明确指出目标操作。`,
        unavailable: '无法安全地重新准备上一项操作，请重新说明要执行的目标。',
      };
  return messages[state] || messages.none;
}
