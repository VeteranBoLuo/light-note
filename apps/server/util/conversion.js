import pool from '../db/index.js';

// 取真实客户端 IP(服务在 nginx 后,优先 X-Forwarded-For 首段)
const clientIp = (req) => {
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req?.ip || req?.socket?.remoteAddress || '';
};

/**
 * 记录游客转化漏斗事件(旁路、fire-and-forget,绝不阻塞/抛错影响主流程)。
 * 事件枚举:page_view / wall_hit(撞写操作墙) / cta_click(点立即注册) / register_view(到达注册页) / register(注册成功) / share_view(分享页曝光) / share_cta_click(分享页点注册)。
 * @param {object} req Express 请求(读 req.user 与 fingerprint 头)
 * @param {string} event 事件名
 * @param {string} [context] 上下文(如撞墙的接口路径、CTA 来源)
 */
export const recordConversionEvent = (req, event, context = '', overrides = {}) => {
  try {
    const userId = overrides.userId ?? (req?.user?.id || null);
    const visitorType = overrides.visitorType ?? (req?.user?.role || 'visitor');
    const fingerprint = String(req?.headers?.['fingerprint'] || '').slice(0, 128);
    const ip = String(clientIp(req) || '').slice(0, 64);
    pool
      .query(
        'INSERT INTO conversion_events (fingerprint, user_id, visitor_type, event, context, ip) VALUES (?,?,?,?,?,?)',
        [fingerprint, userId, visitorType, String(event || '').slice(0, 64), String(context || '').slice(0, 255), ip],
      )
      .catch((e) => console.error('[conversion] 写入失败:', e.message));
  } catch (e) {
    console.error('[conversion] 异常:', e.message);
  }
};

// 激活里程碑:用户「首次自建资源」(书签/笔记/文件),每人只记一次。
// 注册时的示例数据走直插、不经过这些 handler,故首次调用即真实自建;仅登录用户触发,不走游客白名单接口,由 handler 直接调用。
export const recordFirstOwnResource = async (req, type) => {
  try {
    const userId = req?.user?.id;
    if (!userId) return;
    const [rows] = await pool.query(
      "SELECT 1 FROM conversion_events WHERE user_id = ? AND event = 'first_own_resource' LIMIT 1",
      [userId],
    );
    if (rows.length) return; // 已激活过,不重复记
    recordConversionEvent(req, 'first_own_resource', String(type || ''));
  } catch (e) {
    console.error('[conversion] first_own_resource 失败:', e.message);
  }
};
