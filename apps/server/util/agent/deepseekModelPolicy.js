// 官方 Flash 别名同时支持文本和图片；升级默认值只在此处维护。
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
export const MAX_DEEPSEEK_IMAGE_TOKENS = 1024;

// 不继承 DEEPSEEK_MODEL：它可能被覆盖为不支持图片的文本模型。
export function resolveDeepSeekVisionModel(env = process.env, fallback = DEFAULT_DEEPSEEK_MODEL) {
  return (
    [env.AGENT_VISION_MODEL, env.DEEPSEEK_VISION_MODEL, fallback]
      .map((value) => String(value || '').trim())
      .find(Boolean) || DEFAULT_DEEPSEEK_MODEL
  );
}
