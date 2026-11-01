/**
 * 官网是预渲染页面：首屏先显示，应用脚本接管前主按钮没有点击逻辑。
 * head 内联脚本在接管前记下第一次点击，官网挂载时取走并按原处理函数补执行一次。
 */
export const LANDING_EARLY_ACTION_ATTRIBUTE = 'data-landing-early-action';
export const LANDING_EARLY_PENDING_ATTRIBUTE = 'data-landing-early-pending';
export const LANDING_EARLY_INTENT_KEY = '__lightNoteLandingEarlyIntent';

export type LandingEarlyAction = 'primary' | 'account';
export interface LandingEarlyIntent {
  action: LandingEarlyAction;
  source: 'landing_primary' | 'landing_final' | 'landing_account';
}

/** 模板上的标记值；只有这几种组合会被补执行。 */
export const LANDING_EARLY_ACTIONS = Object.freeze({
  heroPrimary: 'primary:landing_primary',
  finalPrimary: 'primary:landing_final',
  account: 'account:landing_account',
} as const);

const INTENTS = new Map<string, LandingEarlyIntent>([
  [LANDING_EARLY_ACTIONS.heroPrimary, { action: 'primary', source: 'landing_primary' }],
  [LANDING_EARLY_ACTIONS.finalPrimary, { action: 'primary', source: 'landing_final' }],
  [LANDING_EARLY_ACTIONS.account, { action: 'account', source: 'landing_account' }],
]);

/** 取走接管前记下的点击并停止记录；没有记录或值不认识时返回 null。 */
export function takeLandingEarlyIntent(): LandingEarlyIntent | null {
  const recorder = (window as unknown as Record<string, { take?: () => unknown } | undefined>)[
    LANDING_EARLY_INTENT_KEY
  ];
  if (typeof recorder?.take !== 'function') return null;
  return INTENTS.get(String(recorder.take())) || null;
}
