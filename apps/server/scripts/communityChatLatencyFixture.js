// Disposable loopback-only benchmark. Never load application .env or start workers.
process.env.NODE_ENV = 'test';
process.env.LIGHTNOTE_RUNTIME_ENV = 'test';
process.env.DOTENV_CONFIG_PATH = '/dev/null';
process.env.OBS_AK = process.env.OBS_SK = 'fixture';
process.env.OBS_ENDPOINT = 'https://fixture.invalid';
process.env.OBS_BUCKET_NAME = 'fixture';
const { default: mysql } = await import('mysql2/promise');
const { default: express } = await import('express');
const { default: net } = await import('node:net');
const { AsyncLocalStorage } = await import('node:async_hooks');
const { randomUUID } = await import('node:crypto');
const { COMMUNITY_CHAT_TABLE_SQL, COMMUNITY_CHAT_ROOM_SEED_SQL, COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL } =
  await import('../util/communityChatSchema.js');
const access = await import('../util/services/communityChatAccessService.js');
const messages = await import('../util/services/communityChatMessageService.js');
const { registerCommunityChatRealtimeHub } = await import('../util/communityChat/realtimeHub.js');
const { communityChatRealtimeBroker: broker } = await import('../util/communityChat/realtimeBroker.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
if (!/^\/(?:private\/)?tmp\//.test(socketPath || '')) throw Error('Disposable socket required');
const admin = await mysql.createConnection({ socketPath, user: 'root' });
const [[isolation]] = await admin.query('SELECT @@global.skip_networking AS isolated');
if (!Number(isolation.isolated)) throw Error('MySQL must disable networking');
const schema = `chat_latency_${randomUUID().replaceAll('-', '')}`;
await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
const pool = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 10 });
await pool.query(
  "CREATE TABLE user(id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY,alias varchar(80),role varchar(20),del_flag varchar(20) DEFAULT '0',head_picture TEXT,preferences JSON,create_time datetime DEFAULT CURRENT_TIMESTAMP)",
);
for (const sql of COMMUNITY_CHAT_TABLE_SQL) await pool.query(sql);
await pool.query(COMMUNITY_CHAT_ROOM_SEED_SQL);
await pool.query(COMMUNITY_CHAT_RUNTIME_POLICY_SEED_SQL);
await pool.query(
  'CREATE TABLE user_growth(user_id varchar(255) PRIMARY KEY,exp int DEFAULT 0,equipped_title varchar(80),equipped_frame varchar(80))',
);
await pool.query(
  'CREATE TABLE notification(id char(36) PRIMARY KEY,user_id varchar(255),type varchar(32),title varchar(255),content TEXT,link varchar(255),meta JSON,is_read tinyint DEFAULT 0,source_type varchar(40),source_id varchar(64),browser_push_pending tinyint,browser_push_created_at datetime(6),UNIQUE KEY uk_source(user_id,source_type,source_id))',
);
for (const id of ['a', 'b']) {
  await pool.query('INSERT INTO user(id,alias,role,preferences) VALUES(?,?,?,?)', [id, `隔离测试 ${id}`, 'user', '{}']);
  await pool.query('INSERT INTO community_chat_user_identities(user_id,public_id,community_id) VALUES(?,?,?)', [
    id,
    randomUUID(),
    id === 'a' ? 'LN000000001' : 'LN000000002',
  ]);
}
const [[room]] = await pool.query("SELECT id FROM community_chat_rooms WHERE slug='general'");
for (let i = 0; i < 60; i++)
  await pool.query(
    'INSERT INTO community_chat_messages(public_id,room_id,user_id,client_request_id,content) VALUES(?,?,?,?,?)',
    [randomUUID(), room.id, i % 2 ? 'a' : 'b', randomUUID(), `隔离历史 ${i}`],
  );
const env = {
  NODE_ENV: 'test',
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
  COMMUNITY_CHAT_REALTIME_ENABLED: '1',
};
const context = new AsyncLocalStorage();
const records = [],
  broadcasts = [],
  preflights = [];
const instrumented = new WeakSet();
function instrument(target) {
  if (instrumented.has(target)) return target;
  instrumented.add(target);
  if (target.getConnection) {
    const getConnection = target.getConnection.bind(target);
    target.getConnection = async () => instrument(await getConnection());
  }
  for (const key of ['query', 'execute']) {
    const execute = target[key].bind(target);
    target[key] = async (...args) => {
      const record = context.getStore(),
        start = performance.now();
      if (record) record.queries++;
      try {
        return await execute(...args);
      } finally {
        if (record) record.queryMs += performance.now() - start;
      }
    };
  }
  if (target.commit) {
    const commit = target.commit.bind(target);
    target.commit = async () => {
      const result = await commit(),
        record = context.getStore();
      if (record) record.commitAt = Date.now();
      return result;
    };
  }
  return target;
}
const db = instrument(pool);
broker.subscribe(({ event }) => {
  if (event.type === 'message.created') broadcasts.push({ id: event.payload.messagePublicId, at: Date.now() });
});
let rttMs = 0;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^http:\/\/(127\.0\.0\.1|localhost):5196$/.test(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.set('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') {
    preflights.push({ path: req.path, at: Date.now() });
    return res.sendStatus(204);
  }
  next();
});
app.get('/fixture/stats', (_req, res) => res.json({ records, broadcasts, preflights, rttMs }));
app.post('/fixture/network', (req, res) => {
  const next = Number(req.body.rttMs);
  if (![0, 80, 150, 300].includes(next)) return res.sendStatus(400);
  rttMs = next;
  res.json({ rttMs });
});
app.use(async (req, res) => {
  const who = /\bsid=([ab])(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const user = who ? { id: who, role: 'user', alias: `隔离测试 ${who}` } : { id: '', role: 'visitor' };
  const record = {
    who: who || 'guest',
    method: req.method,
    path: req.path,
    startAt: Date.now(),
    queries: 0,
    queryMs: 0,
  };
  await context.run(record, async () => {
    try {
      const args = { user, db, env, roomSlug: 'general', ...req.query };
      let data = {};
      if (req.path.endsWith('/rooms')) data = await access.listCommunityChatRooms(args);
      else if (req.path.endsWith('/messages') && req.method === 'POST')
        data = await messages.createCommunityChatMessage({ ...args, ...req.body });
      else if (req.path.endsWith('/messages')) data = await messages.listCommunityChatMessages(args);
      else if (req.path.endsWith('/pin')) data = await messages.getCommunityChatPinnedMessage(args);
      else if (req.path.endsWith('/read')) data = await messages.markCommunityChatRoomRead({ ...args, ...req.body });
      else if (req.path.endsWith('/settings/notifications')) data = { enabled: true, level: 'mentions' };
      record.endAt = Date.now();
      record.foregroundQueries = record.queries;
      record.foregroundQueryMs = record.queryMs;
      record.publicId = data.message?.publicId;
      record.bytes = Buffer.byteLength(JSON.stringify(data));
      records.push(record);
      res.json({ status: 200, data, msg: 'ok' });
    } catch (e) {
      console.error('fixture_request_failed', e.code || e.name);
      res.status(500).json({ status: 500, msg: e.code || 'FIXTURE_FAILED' });
    }
  });
});
const server = app.listen(19096, '127.0.0.1');
const hub = registerCommunityChatRealtimeHub(server, {
  env,
  db,
  getSessionById: async (sid) => (['a', 'b'].includes(sid) ? { user_id: sid } : null),
  getRestrictions: async () => [],
  manageBrokerLifecycle: false,
});
// A real TCP hop delays bytes in each direction, including HTTP and WebSocket frames.
const sockets = new Set();
const proxy = net
  .createServer((client) => {
    const upstream = net.connect(19096, '127.0.0.1'),
      timers = new Set();
    sockets.add(client);
    sockets.add(upstream);
    client.setNoDelay(true);
    upstream.setNoDelay(true);
    for (const [from, to] of [
      [client, upstream],
      [upstream, client],
    ]) {
      from.on('data', (chunk) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!to.destroyed && !to.write(chunk)) from.pause();
        }, rttMs / 2);
        timers.add(timer);
      });
      to.on('drain', () => from.resume());
      from.on('error', () => to.destroy());
      from.on('close', () => {
        for (const timer of timers) clearTimeout(timer);
        to.destroy();
        sockets.delete(from);
      });
    }
  })
  .listen(19097, '127.0.0.1');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  for (const s of sockets) s.destroy();
  proxy.close();
  await hub.close();
  server.close();
  await pool.end();
  await admin.query(`DROP DATABASE ${schema}`);
  await admin.end();
  process.exit(0);
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
console.log('Chat latency fixture ready: local MySQL, REST and WebSocket; no external services');
