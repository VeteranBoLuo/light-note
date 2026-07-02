import pool from '../../../db/index.js';

export default {
  name: 'get_user_info',
  description: '查询当前登录用户的个人信息，包括用户名、邮箱、角色、注册时间等。支持「我的信息」「个人信息」「账号信息」等说法。',
  parameters: {
    type: 'object',
    properties: {
      user: { type: 'string', description: '可选，指定查询的用户（昵称/邮箱/ID），仅管理员可用。不填则查自己的信息' },
    },
  },
  requireRoot: false,
  async execute(args, ctx) {
    const [[row]] = await pool.query(
      'SELECT id, alias, email, role, create_time FROM user WHERE id = ? LIMIT 1',
      [ctx.userId],
    );
    return row || null;
  },
  transform(row) {
    if (!row) return '未找到你的个人信息（用户不存在或数据异常）';
    const time = row.create_time ? new Date(row.create_time).toLocaleString('zh-CN') : '未知';
    const roleMap = { root: '管理员', user: '普通用户', visitor: '访客' };
    const role = roleMap[row.role] || row.role || '未知';
    return [
      `你的个人信息如下：`,
      `• 用户名：${row.alias || '未设置'}`,
      `• 邮箱：${row.email || '未绑定'}`,
      `• 角色：${role}`,
      `• 注册时间：${time}`,
      `• 用户ID：${row.id}`,
    ].join('\n');
  },
  summarize(row) {
    if (!row) return '个人信息查询：未找到';
    return `个人信息：${row.alias || '未知'}（${row.email || '无邮箱'}）- ${row.role}`;
  },
};
