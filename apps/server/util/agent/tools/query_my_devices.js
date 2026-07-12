import { listUserSessions } from '../../sessionStore.js';

// 我的登录设备/会话(只读,仅本人)。
export default {
  name: 'query_my_devices',
  description: '查询当前用户最近登录的设备/会话(IP、设备信息、最后活跃时间)。回答"我在哪些设备登录过""最近的登录记录""我的登录设备"。',
  parameters: { type: 'object', properties: {} },
  requireRoot: false,
  async execute(args, ctx) {
    if (!ctx.userId || ctx.userRole === 'visitor') return { items: [] };
    const rows = await listUserSessions(ctx.userId);
    return { items: (rows || []).map((r) => ({ ip: r.ip || '', ua: r.user_agent || '', lastActive: r.last_active_time })) };
  },
  transform(raw) {
    const items = raw?.items || [];
    if (!items.length) return '没有查询到登录会话。';
    const lines = items.map((s, i) => {
      const t = s.lastActive ? new Date(s.lastActive).toLocaleString('zh-CN') : '';
      return `${i + 1}. ${s.ip || '未知IP'} · ${String(s.ua || '').slice(0, 60)} · 最后活跃 ${t}`;
    });
    return `当前有 ${items.length} 个登录会话:\n${lines.join('\n')}`;
  },
  summarize(raw) {
    return `登录设备:${raw?.items?.length || 0} 个会话`;
  },
};
