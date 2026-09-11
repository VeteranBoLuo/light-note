/**
 * 秒级事件只能证明一条时间不逆序的近似路径，不能证明同一次注册尝试。
 * 每阶段先收敛为每个指纹的最早可达时间，再关联下一阶段，避免重复事件自连接膨胀。
 * 更早到达某阶段不会减少后续可达事件，因此无需保留全部路径组合。
 */
export function buildApproximateFunnelQuery({ startDate, endDate } = {}) {
  const params = [];
  const timeFor = (alias) => {
    let condition = '';
    if (startDate) {
      condition += ` AND ${alias}.create_time >= ?`;
      params.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      condition += ` AND ${alias}.create_time < DATE_ADD(?, INTERVAL 1 DAY)`;
      params.push(String(endDate));
    }
    return condition;
  };
  let sql = `SELECT p.fingerprint, MIN(p.create_time) AS reached_at
    FROM conversion_events p
    WHERE p.fingerprint <> '' AND p.event = 'page_view' AND p.visitor_type = 'visitor'${timeFor('p')}
    GROUP BY p.fingerprint`;
  const stages = [
    ['signup_open', 'signupOpen'],
    ['signup_submit', 'signupSubmit'],
    ['register', 'registerSuccess'],
  ];
  const counts = [];
  for (const [event, key] of stages) {
    sql = `SELECT previous.fingerprint${counts.map((name) => `, previous.${name}`).join('')},
      MIN(e.create_time) AS reached_at, MIN(e.create_time) AS ${key}
      FROM (${sql}) previous
      LEFT JOIN conversion_events e ON e.fingerprint = previous.fingerprint
        AND e.event = '${event}'${event === 'register' ? '' : " AND e.visitor_type = 'visitor'"}
        AND e.create_time >= previous.reached_at${timeFor('e')}
      GROUP BY previous.fingerprint${counts.map((name) => `, previous.${name}`).join('')}`;
    counts.push(key);
  }
  return {
    sql: `SELECT COUNT(*) AS pageView, COUNT(signupOpen) AS signupOpen,
      COUNT(signupSubmit) AS signupSubmit, COUNT(registerSuccess) AS registerSuccess
      FROM (${sql}) paths`,
    params,
  };
}
