import pool from '../../../db/index.js';

export default {
  name: 'get_security_summary',
  description: '获取安全概览，返回风险最高的 IP 和账号排行。不返回事件明细；查询具体事件请使用 get_security_events。',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: '返回条数，默认20，最大100' },
    },
  },
  requireRoot: true,
  async execute(args) {
    const take = Math.min(Math.max(args.limit || 10, 1), 50);

    const [ipRows] = await pool.query(
      `SELECT ip, risk_score, is_banned, total_attacks
       FROM security_ip_reputation
       ORDER BY risk_score DESC LIMIT ?`,
      [take],
    );
    const [accountRows] = await pool.query(
      `SELECT sar.user_id, u.alias, sar.risk_score, sar.total_events
       FROM security_account_reputation sar
       LEFT JOIN user u ON u.id = sar.user_id
       ORDER BY sar.risk_score DESC LIMIT ?`,
      [take],
    );

    return { ipRisks: ipRows, accountRisks: accountRows };
  },
  transform(raw) {
    const parts = [];

    if (raw.ipRisks?.length) {
      const ips = raw.ipRisks.map((r, i) =>
        `${i + 1}. ${r.ip} - 风险分: ${r.risk_score}，攻击 ${r.total_attacks} 次${r.is_banned ? '，已封禁' : ''}`);
      parts.push(`IP 风险 Top ${raw.ipRisks.length}：\n${ips.join('\n')}`);
    }

    if (raw.accountRisks?.length) {
      const acts = raw.accountRisks.map((r, i) =>
        `${i + 1}. ${r.alias || r.user_id} - 风险分: ${r.risk_score}，事件 ${r.total_events} 次`);
      parts.push(`账号风险 Top ${raw.accountRisks.length}：\n${acts.join('\n')}`);
    }

    return parts.length ? parts.join('\n\n') : '暂无风险数据';
  },
  summarize(raw) {
    const ipCount = raw.ipRisks?.length || 0;
    const acctCount = raw.accountRisks?.length || 0;
    return `安全概览：${ipCount} 个风险 IP，${acctCount} 个风险账号`;
  },
};
