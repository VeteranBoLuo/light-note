// Usage: ALLOW_REMOTE_DATABASE_READS=true node scripts/reportEntitlementRevenue.js --days=28
// 只读、只输出聚合；客户端行为不是付款事实。
process.env.ALLOW_REMOTE_DATABASE_READS = 'true';
process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
const { default: db } = await import('../db/index.js');
const days = Number(process.argv.find((v) => v.startsWith('--days='))?.split('=')[1] || 28);
if (![7, 28, 60].includes(days)) throw new Error('DAYS_MUST_BE_7_28_OR_60');
const ordinary =
  "COALESCE(u.role, '') NOT IN ('root', 'test', 'admin', 'visitor', 'system') AND COALESCE(u.del_flag, 0) = 0";
try {
  const [events] = await db.query(
    `SELECT l.operation, l.create_by, l.create_time,
    IF(u.create_time >= DATE_SUB(l.create_time, INTERVAL 7 DAY), 'new', 'existing') AS cohort
    FROM operation_logs l JOIN user u ON u.id = l.create_by
    WHERE l.module = 'entitlement_funnel' AND l.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
      AND ${ordinary} ORDER BY l.create_time, l.id LIMIT 100001`,
    [days],
  );
  if (events.length > 100000) throw new Error('REPORT_WINDOW_TOO_LARGE');
  const groups = new Map();
  const intentGroups = new Map();
  const flowGroups = new Map();
  const products = new Map();
  const productFor = (sku) => {
    if (!products.has(sku))
      products.set(sku, { events: new Map(), orders: 0, creditedOrders: 0, buyers: new Set(), revenue: 0 });
    return products.get(sku);
  };
  const ensure = (key) => {
    if (!groups.has(key))
      groups.set(key, { events: new Map(), paid: new Set(), credited: new Set(), buyers: new Set(), revenue: 0 });
    return groups.get(key);
  };
  for (const row of events) {
    let e;
    try {
      e = JSON.parse(row.operation);
    } catch {
      continue;
    }
    if (!e.e) continue;
    const flowKey = `${row.create_by}:${e.f || ''}`;
    const key =
      flowGroups.get(flowKey) || JSON.stringify({ source: e.s || 'other', level: e.l || 1, cohort: row.cohort });
    if (e.f) flowGroups.set(flowKey, key);
    const group = ensure(key);
    if (!group.events.has(e.e)) group.events.set(e.e, new Set());
    group.events.get(e.e).add(`${row.create_by}:${e.f || row.create_time}:${e.k || ''}`);
    if (e.k) {
      const product = productFor(e.k);
      if (!product.events.has(e.e)) product.events.set(e.e, new Set());
      product.events.get(e.e).add(`${row.create_by}:${e.f || row.create_time}`);
    }
    if (e.i) intentGroups.set(e.i, { key, userId: row.create_by });
  }
  const [orders] = await db.query(
    `SELECT o.id, o.checkout_intent_id, o.light_note_user_id, o.total_amount,
    i.sku_id, g.grant_status FROM support_orders o
    JOIN user u ON u.id = o.light_note_user_id
    LEFT JOIN support_checkout_intents i ON i.id = o.checkout_intent_id
    LEFT JOIN support_entitlement_grants g ON g.support_order_id = o.id
    WHERE o.verified_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND o.verification_state = 'api_verified'
      AND o.provider_status = 2 AND o.order_purpose = 'entitlement_purchase' AND ${ordinary}`,
    [days],
  );
  for (const order of orders) {
    const attribution = intentGroups.get(order.checkout_intent_id);
    const key =
      attribution?.userId === order.light_note_user_id ? attribution.key : JSON.stringify({ source: 'unattributed' });
    const group = ensure(key);
    if (group.paid.has(order.id)) continue;
    group.paid.add(order.id);
    group.buyers.add(order.light_note_user_id);
    group.revenue += Number(order.total_amount);
    if (order.grant_status === 'credited') group.credited.add(order.id);
    const sku = order.sku_id || 'unknown';
    const product = productFor(sku);
    product.orders++;
    product.buyers.add(order.light_note_user_id);
    if (order.grant_status === 'credited') product.creditedOrders++;
    product.revenue += Number(order.total_amount);
    products.set(sku, product);
  }
  const [intents] = await db.query(
    `SELECT COUNT(*) AS created FROM support_checkout_intents i JOIN user u ON u.id = i.user_id WHERE i.intent_type IN ('permanent', 'campaign') AND i.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${ordinary}`,
    [days],
  );
  const [starter] = await db.query(
    `SELECT COUNT(*) AS redemptions FROM points_shop_item_claims c
    JOIN user u ON u.id = c.user_id WHERE c.item_id = 'ai_pack_starter'
    AND c.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${ordinary}`,
    [days],
  );
  const [wallet] = await db.query(
    `SELECT COALESCE(SUM(l.amount_tokens), 0) AS tokens FROM ai_bonus_ledger l
    JOIN user u ON u.id = l.user_id WHERE l.entry_type = 'debit'
    AND l.source_type = 'ai_usage' AND l.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${ordinary}`,
    [days],
  );
  const [quota] = await db.query(
    `SELECT COUNT(DISTINCT e.actor_user_id) AS aiUsers,
    COUNT(DISTINCT CASE WHEN e.error_code IN ('AI_QUOTA_EXCEEDED', 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST') THEN e.actor_user_id END) AS blockedUsers
    FROM ai_executions e JOIN user u ON u.id = e.actor_user_id JOIN user_growth g ON g.user_id = u.id
    WHERE e.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND g.exp < 1700 AND ${ordinary}`,
    [days],
  );
  console.log(
    JSON.stringify(
      {
        days,
        cohorts: [...groups].map(([key, g]) => ({
          ...JSON.parse(key),
          events: Object.fromEntries([...g.events].map(([k, v]) => [k, v.size])),
          paidOrders: g.paid.size,
          creditedOrders: g.credited.size,
          buyers: g.buyers.size,
          revenue: Number(g.revenue.toFixed(2)),
          sampleInsufficient: g.buyers.size < 20,
        })),
        products: Object.fromEntries(
          [...products].map(([sku, product]) => [
            sku,
            {
              ...product,
              events: Object.fromEntries([...product.events].map(([event, flows]) => [event, flows.size])),
              buyers: product.buyers.size,
              revenue: Number(product.revenue.toFixed(2)),
              sampleInsufficient: product.buyers.size < 20,
            },
          ]),
        ),
        checkoutIntents: intents[0],
        starter: starter[0],
        permanentAiConsumption: wallet[0],
        lowLevelAi: quota[0],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('REVENUE_REPORT_FAILED', error.code || 'QUERY_FAILED');
  process.exitCode = 1;
} finally {
  await db.end();
}
