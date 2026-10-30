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

/**
 * 访客来源表：每个浏览器标识取所选时间内最早一条 entry_source 作为首次来源，
 * 再看同一标识在时间内是否打开注册、注册成功，以及注册账号是否完成首个自建资源。
 * 只覆盖记录了来源的访客；跨设备注册无法归回原来源。MySQL 5.7 无窗口函数，用 MIN(id) 取首条。
 */
export function buildEntrySourceQuery({ startDate, endDate } = {}) {
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
  // 参数按 SQL 文本顺序收集：先 SELECT 列表里的子查询，再 FROM 的首次来源。
  const reached = (event, alias) => `SUM(EXISTS(SELECT 1 FROM conversion_events ${alias}
      WHERE ${alias}.fingerprint = ft.fingerprint AND ${alias}.event = '${event}'${
        event === 'register' ? '' : ` AND ${alias}.visitor_type = 'visitor'`
      }${timeFor(alias)}))`;
  const signupOpen = reached('signup_open', 'o');
  const registered = reached('register', 'r');
  const activated = `SUM(EXISTS(SELECT 1 FROM conversion_events a
      JOIN conversion_events f ON f.user_id = a.user_id AND f.event = 'first_own_resource'
      WHERE a.fingerprint = ft.fingerprint AND a.event = 'register' AND a.user_id IS NOT NULL${timeFor('a')}))`;
  const firstTouch = `SELECT s.fingerprint, s.context AS source
      FROM conversion_events s
      JOIN (SELECT t.fingerprint, MIN(t.id) AS first_id FROM conversion_events t
        WHERE t.event = 'entry_source' AND t.fingerprint <> ''${timeFor('t')}
        GROUP BY t.fingerprint) first_touch ON first_touch.first_id = s.id`;
  return {
    sql: `SELECT ft.source, COUNT(*) AS visitors, ${signupOpen} AS signupOpen,
      ${registered} AS registered, ${activated} AS activated
      FROM (${firstTouch}) ft
      GROUP BY ft.source ORDER BY visitors DESC, ft.source LIMIT 50`,
    params,
  };
}
