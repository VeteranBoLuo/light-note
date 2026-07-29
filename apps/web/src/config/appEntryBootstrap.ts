export const LOGIN_HISTORY_STORAGE_KEYS = {
  loggedIn: 'hasLoggedInBefore',
  rememberedEmail: 'rememberedLoginEmail',
  rememberedSession: 'rememberedSid',
} as const;

// 只记录“这个浏览器已经完整看过一次移动官网”，与账号身份、登录态解耦。
export const MOBILE_LANDING_VISIT_STORAGE_KEY = 'ln-mobile-landing-visited';

// 与登录记忆的现有产品语义保持一致：近期使用记录保留 30 天。
export const LOGIN_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const APPLICATION_ENTRY_PATH = '/app';
