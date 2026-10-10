import { notificationSchedulerEnabled } from './notificationSchedulerPolicy.js';
import { todoPushPresentation } from './todoPushPresentation.js';

// Internal endpoint namespace, never accepted by the browser subscription endpoint.
export const HUAWEI_ENDPOINT = 'huawei:';
export const isHuaweiEndpoint = (value) => typeof value === 'string' && value.startsWith(HUAWEI_ENDPOINT);
export function huaweiPushEnabled(env = process.env) {
  return (
    notificationSchedulerEnabled(env) &&
    env.HUAWEI_PUSH_ENABLED === 'true' &&
    /^\d+$/.test(env.HUAWEI_PUSH_APP_ID || '') &&
    /^\d+$/.test(env.HUAWEI_PUSH_PROJECT_ID || '') &&
    Boolean(env.HUAWEI_PUSH_APP_SECRET && env.HUAWEI_PUSH_ORIGIN)
  );
}
export function huaweiSubscription(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,1024}$/.test(token))
    throw Object.assign(new Error('INVALID_HUAWEI_TOKEN'), { code: 'INVALID_HUAWEI_TOKEN' });
  return { endpoint: HUAWEI_ENDPOINT + token, keys: { p256dh: '', auth: '' } };
}
// WORK approval covers user-scheduled todo reminders only. Recheck the authoritative job before sending.
export const huaweiWorkNotification = (n) =>
  n?.type === 'todo_reminder' && n?.source_type === 'todo_reminder_job' && Boolean(n?.source_id);
export const isHuaweiSubscriptionRequest = (context) =>
  String(context.method).toUpperCase() === 'POST' &&
  /^(?:\/api)?\/notification\/huawei\/subscribe\/?$/.test(String(context.path || context.url || ''));

// Only explicitly approved service categories are sent as such. Other messages use Huawei's
// normal classification rather than borrowing the WORK entitlement.
export function huaweiNotificationPresentation(n, env = process.env, verifiedTodo = null, verifiedChat = null) {
  let meta = n?.meta || {};
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  let category = null;
  let title = '轻笺通知';
  let body = '你有一条新通知，点击打开通知中心查看。';
  if (huaweiWorkNotification(n)) {
    category = 'WORK';
    title = '轻笺待办提醒';
    body = '你设置的待办提醒时间到了，点击打开通知中心。';
  } else if (n?.type === 'community_chat' && ['reply', 'mention'].includes(meta?.kind)) {
    category = 'SUBSCRIPTION';
    title = '轻笺订阅提醒';
    body = '你订阅的聊天室互动有新回复或提及，点击打开通知中心查看。';
  } else if (
    n?.type === 'community_feed' &&
    ['reply', 'mention', 'comment', 'subscription', 'like'].includes(meta?.kind)
  ) {
    category = 'SUBSCRIPTION';
    title = '轻笺订阅提醒';
    body = '你订阅的社区互动有新消息，点击打开通知中心查看。';
  }
  const detailedTodo = n?.type === 'todo_reminder' && verifiedTodo;
  if (detailedTodo) {
    ({ title, body } = todoPushPresentation(verifiedTodo));
  } else if (n?.type === 'community_chat' && verifiedChat) {
    ({ title, body } = verifiedChat);
  }
  const approved = new Set(
    String(env.HUAWEI_PUSH_APPROVED_CATEGORIES || '')
      .split(',')
      .map((x) => x.trim()),
  );
  return { title, body, ...(detailedTodo || verifiedChat ? { visibility: 'SECRET' } : {}),
    ...(category && approved.has(category) ? { category } : {}) };
}
