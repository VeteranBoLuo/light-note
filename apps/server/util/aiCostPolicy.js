import { resolveAgentStageModelOptions } from './agent/stageModelPolicy.js';
// 人民币/百万 Tokens；仅用于成本估算，不改变用户 Token 账本。
export const AI_COST_POLICY_VERSION = 'ai-cost-20260909';
export const AI_PRICE_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
export const AI_PRICE_EFFECTIVE_AT = '2026-08-16T16:00:00Z';
const prices = {
  'deepseek-v4-flash': { input: 3, cached: 0.1, output: 9 },
  'deepseek-v4-pro': { input: 9, cached: 0.3, output: 27 },
  'deepseek-v4-flash-vision-exp': { input: 3, cached: 0.1, output: 9 },
};
export function isPeakAiTime(at = Date.now()) {
  const d = new Date(at);
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  return day >= 1 && day <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}
export function getAiModelPrice(provider, model, at = Date.now(), peak = false) {
  if (
    provider !== 'deepseek' ||
    !Object.hasOwn(prices, model) ||
    new Date(at).getTime() < Date.parse(AI_PRICE_EFFECTIVE_AT)
  )
    return null;
  const multiplier = peak || isPeakAiTime(at) ? 1 : 0.5;
  return Object.fromEntries(Object.entries(prices[model]).map(([key, value]) => [key, value * multiplier]));
}
export function estimateAiUsageCost({ provider, model, usage = {}, at = Date.now() }) {
  const price = getAiModelPrice(provider, model, at);
  if (!price) return null;
  const input = Math.max(0, Number(usage.promptTokens || 0));
  const cached = Math.min(input, Math.max(0, Number(usage.cachedPromptTokens || 0)));
  return Number(
    (
      (cached * price.cached +
        (input - cached) * price.input +
        Math.max(0, Number(usage.completionTokens || 0)) * price.output) /
      1_000_000
    ).toFixed(6),
  );
}
export function getConservativeAiUnitCost(env = process.env) {
  const stages = ['default', 'vision', 'intent_compiler', 'planner', 'note_draft', 'final'];
  const values = stages.map((stage) => {
    const { providerOverride: provider, modelOverride } = resolveAgentStageModelOptions(stage, env);
    const model =
      modelOverride ||
      (provider === 'deepseek' ? env.DEEPSEEK_MODEL || 'deepseek-v4-flash' : env.QWEN_MODEL || 'qwen3.5-flash');
    return getAiModelPrice(provider, model, Date.now(), true);
  });
  if (values.some((value) => !value)) return null;
  return Math.max(...values.flatMap((value) => Object.values(value))) * 1.2;
}
