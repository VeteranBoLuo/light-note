import { apiBasePost } from '@/http/request';

// v1.1 轻量转化埋点统一入口:事件/来源走白名单、fire-and-forget、不生成 visitor/session/event id。
// 全站游客转化埋点都走这里,避免各组件散落拼字符串。register/first_own_resource 只由后端记,前端不发。

const EVENTS = new Set([
  'page_view',
  'demo_enter', // 进入游客示例空间(原 landing-hero 误记的 cta_click)
  'signup_open', // 注册弹窗真正打开
  'signup_submit', // 前端校验通过并发起注册
  'wall_hit', // 游客写操作被拦
  'share_view',
  'share_cta_click',
]);

const SOURCES = new Set([
  'landing_primary',
  'landing_final',
  'landing_demo',
  'nav',
  'home_demo_hint',
  'browse_nudge',
  'preview_guide',
  'write_add_bookmark',
  'write_add_note',
  'write_upload_file',
  'write_edit_bookmark',
  'write_edit_note',
  'write_ai',
  'share',
  'auth_switch',
  'unknown',
]);

const lastSignupOpenAt: Record<string, number> = {};

/** 上报一条转化事件。event/source 不在白名单则丢弃(source 兜底为 unknown)。 */
export function trackConversion(event: string, source = 'unknown'): void {
  if (!EVENTS.has(event)) return;
  const src = SOURCES.has(source) ? source : 'unknown';
  // signup_open 同 source 1.5s 去重:弹窗抖动、连点、切 tab 重开只算一次
  if (event === 'signup_open') {
    const now = Date.now();
    if (now - (lastSignupOpenAt[src] || 0) < 1500) return;
    lastSignupOpenAt[src] = now;
  }
  apiBasePost('/api/common/recordConversion', { event, source: src }).catch(() => {});
}
