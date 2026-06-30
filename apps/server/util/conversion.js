import pool from '../db/index.js';

/**
 * 记录游客转化漏斗事件(旁路、fire-and-forget,绝不阻塞/抛错影响主流程)。
 * 事件枚举:wall_hit(撞写操作墙) / cta_click(点立即注册) / register(注册成功) / page_view。
 * @param {object} req Express 请求(读 req.user 与 fingerprint 头)
 * @param {string} event 事件名
 * @param {string} [context] 上下文(如撞墙的接口路径、CTA 来源)
 */
export const recordConversionEvent = (req, event, context = '') => {
  try {
    const userId = req?.user?.id || null;
    const visitorType = req?.user?.role || 'visitor';
    const fingerprint = String(req?.headers?.['fingerprint'] || '').slice(0, 128);
    pool
      .query(
        'INSERT INTO conversion_events (fingerprint, user_id, visitor_type, event, context) VALUES (?,?,?,?,?)',
        [fingerprint, userId, visitorType, String(event || '').slice(0, 64), String(context || '').slice(0, 255)],
      )
      .catch((e) => console.error('[conversion] 写入失败:', e.message));
  } catch (e) {
    console.error('[conversion] 异常:', e.message);
  }
};
