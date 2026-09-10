import { DEFAULT_DEEPSEEK_MODEL } from './agent/deepseekModelPolicy.js';
import { resolveAgentStageModelOptions } from './agent/stageModelPolicy.js';
// 人民币/百万 Tokens；仅用于成本估算，不改变用户 Token 账本。
export const AI_COST_POLICY_VERSION = 'ai-cost-20260911';
export const AI_PRICE_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
export const AI_PRICE_EFFECTIVE_AT = '2026-08-16T16:00:00Z';
const legacyPrices = {
  'deepseek-v4-flash': { input: 3, cached: 0.1, output: 9 },
  'deepseek-v4-pro': { input: 9, cached: 0.3, output: 27 },
  'deepseek-v4-flash-vision-exp': { input: 3, cached: 0.1, output: 9 },
};
// 新价格从本项目核验日零点启用，不冒充官方精确切价时刻，也不回算历史账本。
const FLASH_PRICE_VERIFIED_AT = Date.parse('2026-09-11T00:00:00+08:00');
// 官方明确的 Pro 重定向时间；未来 Pro 再次升级时需重新核验价格。
const PRO_REDIRECT_AT = Date.parse('2026-09-14T12:00:00+08:00');
const flashPrice = { input: 2, cached: 0.04, output: 8 };
const flashModels = new Set([DEFAULT_DEEPSEEK_MODEL, 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']);

export function isPeakAiTime(at = Date.now()) {
  const d = new Date(at);
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  return day >= 1 && day <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}
export function getAiModelPrice(provider, model, at = Date.now(), peak = false) {
  const timestamp = new Date(at).getTime();
  if (provider !== 'deepseek' || !Number.isFinite(timestamp) || timestamp < Date.parse(AI_PRICE_EFFECTIVE_AT))
    return null;
  const price =
    (flashModels.has(model) && timestamp >= FLASH_PRICE_VERIFIED_AT) ||
    (model === 'deepseek-v4-pro' && timestamp >= PRO_REDIRECT_AT)
      ? flashPrice
      : Object.hasOwn(legacyPrices, model)
        ? legacyPrices[model]
        : null;
  if (!price) return null;
  const multiplier = peak || isPeakAiTime(at) ? 1 : 0.5;
  return Object.fromEntries(Object.entries(price).map(([key, value]) => [key, value * multiplier]));
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
export function getConservativeAiUnitCost(env = process.env, at = Date.now()) {
  const stages = ['default', 'vision', 'intent_compiler', 'planner', 'note_draft', 'final'];
  const values = stages.map((stage) => {
    const { providerOverride: provider, modelOverride } = resolveAgentStageModelOptions(stage, env);
    const model =
      modelOverride ||
      (provider === 'deepseek' ? env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL : env.QWEN_MODEL || 'qwen3.5-flash');
    return getAiModelPrice(provider, model, at, true);
  });
  if (values.some((value) => !value)) return null;
  return Math.max(...values.flatMap((value) => Object.values(value))) * 1.2;
}
