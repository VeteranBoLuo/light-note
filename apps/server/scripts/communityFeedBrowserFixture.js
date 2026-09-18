process.env.NODE_ENV = 'test';
process.env.LIGHTNOTE_RUNTIME_ENV = 'test';
process.env.DOTENV_CONFIG_PATH = '/dev/null';
process.env.OBS_AK = 'fixture-placeholder';
process.env.OBS_SK = 'fixture-placeholder';
process.env.OBS_ENDPOINT = 'https://fixture.invalid';
process.env.OBS_BUCKET_NAME = 'fixture';
const taskRewards = await import('../util/communityFeed/taskRewards.js');
const { grantExp } = await import('../util/growth.js');
const { earnPoints } = await import('../util/points.js');
const resources = await import('../util/communityFeed/resources.js');
const images = await import('../util/communityFeed/images.js');
import multer from 'multer';
import os from 'node:os';
import fs from 'node:fs/promises';
// Isolated browser QA server. No application .env, TCP database, or production data.
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import express from 'express';
const { COMMUNITY_CHAT_TABLE_SQL } = await import('../util/communityChatSchema.js');
const { ensureCommunityFeedSchema } = await import('../util/communityFeed/schema.js');
const topics = await import('../util/communityFeed/topics.js');
const fixturePort = Number(process.env.COMMUNITY_FIXTURE_PORT || 19092);
if (![19092, 19093, 19094, 19095].includes(fixturePort)) throw new Error('Unsupported fixture port');
const posts = await import('../util/communityFeed/posts.js');
const comments = await import('../util/communityFeed/comments.js');
const profiles = await import('../util/communityFeed/profiles.js');
const chatProfiles = await import('../util/services/communityChatProfileService.js');
const governance = await import('../util/communityFeed/governance.js');
const { capabilities, operationReceipt } = await import('../util/communityFeed/core.js');
const { consumeCommunityEvent, feedNotificationVisibleSql } = await import('../util/communityFeed/notifications.js');
const { getCommunityPreferences, updateCommunityPreferences } =
  await import('../util/services/communityPreferenceService.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
if (!/^\/(?:private\/)?tmp\//.test(socketPath || '')) throw new Error('Temporary MySQL socket required');
const admin = await mysql.createConnection({ socketPath, user: 'root' });
const [[server]] = await admin.query('SELECT @@global.skip_networking AS isolated');
if (Number(server.isolated) !== 1) throw new Error('Isolated server required');
const reuseSchema = process.env.COMMUNITY_FIXTURE_SCHEMA;
if (reuseSchema && !/^community_browser_[a-f0-9]{32}$/.test(reuseSchema)) throw new Error('Invalid fixture schema');
const schema = reuseSchema || 'community_browser_' + randomUUID().replaceAll('-', '');
if (!reuseSchema) await admin.query(`CREATE DATABASE ${schema}`);
const db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 8 });
const env = {
  COMMUNITY_FEED_ENABLED: 'true',
  COMMUNITY_FEED_WRITES_ENABLED: 'true',
  COMMUNITY_FEED_WORKER_ENABLED: 'true',
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_CHAT_MESSAGING_ENABLED: '1',
};
if (!reuseSchema) {
  await db.query(
    "CREATE TABLE user (id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY,role varchar(255),del_flag varchar(255) DEFAULT '0',alias varchar(80),preferences JSON,head_picture TEXT,create_time DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  );
  for (const sql of COMMUNITY_CHAT_TABLE_SQL) await db.query(sql);
  await ensureCommunityFeedSchema(db);
  await db.query(`CREATE TABLE user_growth_preferences(user_id varchar(255) PRIMARY KEY,
  weekly_active_target int,streak_reminder_enabled int,celebration_enabled int,low_pressure_mode int,
  timezone varchar(64),utc_offset_minutes int,points_goal_item_id varchar(80),points_goal_enabled int)`);
  await db.query(
    'CREATE TABLE points_earning_period_policy(period_type varchar(8),period_key varchar(8),policy_version varchar(80),PRIMARY KEY(period_type,period_key))',
  );
  await db.query(
    'CREATE TABLE user_growth (user_id varchar(255) PRIMARY KEY,exp int DEFAULT 0,level int DEFAULT 1,points int DEFAULT 0,equipped_title varchar(80),equipped_frame varchar(80))',
  );
  const growthSchema = await fs.readFile(new URL('../migrations/20260708_growth.sql', import.meta.url), 'utf8');
  await db.query(growthSchema.slice(growthSchema.indexOf('CREATE TABLE'), growthSchema.indexOf('-- 成长快照')));
  await db.query(
    'CREATE TABLE user_achievements (user_id varchar(255),achievement_key varchar(80),unlocked_at datetime,claimed_at datetime,reward_points_snapshot int,reward_frame_id_snapshot varchar(80),policy_version varchar(80),PRIMARY KEY(user_id,achievement_key))',
  );
  await db.query(
    'CREATE TABLE points_log (id bigint PRIMARY KEY AUTO_INCREMENT,user_id varchar(255),delta int,reason varchar(80),ref varchar(80),policy_version varchar(80),meta JSON,create_time datetime DEFAULT CURRENT_TIMESTAMP)',
  );
  await db.query(
    'CREATE TABLE notification (id char(36) PRIMARY KEY,user_id varchar(255),type varchar(32),title varchar(255),content text,link varchar(255),meta json,batch_id char(36),source_type varchar(40),source_id varchar(160),is_read tinyint,del_flag tinyint DEFAULT 0,browser_push_pending tinyint,create_time datetime(6) DEFAULT CURRENT_TIMESTAMP(6),read_time datetime,browser_push_created_at datetime(6),UNIQUE KEY uk_source(user_id,source_type,source_id))',
  );
  for (const [id, role, name] of [
    ['a', 'user', '薄荷'],
    ['b', 'user', '南风'],
    ['root', 'root', '轻笺团队'],
  ])
    await db.query('INSERT INTO user(id,role,alias,preferences) VALUES(?,?,?,?)', [id, role, name, '{}']);
  await db.query(
    'CREATE TABLE note(id varchar(255) PRIMARY KEY,create_by varchar(255),del_flag tinyint DEFAULT 0,title varchar(255),content MEDIUMTEXT,type varchar(20))',
  );
  await db.query(
    'CREATE TABLE bookmark(id varchar(255) PRIMARY KEY,user_id varchar(255),del_flag tinyint DEFAULT 0,name varchar(255),url TEXT)',
  );
  for (const id of ['a', 'b', 'root']) {
    await db.query('INSERT INTO note(id,create_by,title,content,type) VALUES(?,?,?,?,?)', [
      id + '-note',
      id,
      '我的知识整理方法',
      '<h2>让记录成为习惯</h2><p>每天留出十分钟，记录今天的一次发现。</p><p>每周回顾，把零散想法整理成可以复用的方法。</p>',
      'html',
    ]);
    await db.query('INSERT INTO note(id,create_by,title,content,type) VALUES(?,?,?,?,?)', [
      id + '-image-note',
      id,
      '含图片的旅行笔记',
      '<p>旅行记录</p><img src="private.png">',
      'html',
    ]);
    await db.query('INSERT INTO bookmark(id,user_id,name,url) VALUES(?,?,?,?)', [
      id + '-bookmark',
      id,
      'MDN 网页开发文档',
      'https://developer.mozilla.org/zh-CN/',
    ]);
  }
  const root = { id: 'root', role: 'root' };
  const seed = await posts.submitPost({
    db,
    env,
    user: root,
    input: {
      requestId: randomUUID(),
      kind: 'share',
      title: '欢迎来到轻笺广场',
      body: '分享使用心得，交流整理方法。\n让好的想法在这里慢慢生长。',
      topics: ['ideas'],
      profileConsentVersion: 1,
    },
  });
  const examples = [
    [
      'share',
      '把收藏的资料变成真正用得上的知识',
      '以前我总是收藏完就忘了。现在每周留出二十分钟，只做三件事：删除过期链接、给正在做的项目补充资料、把值得复用的方法记成一条笔记。\n\n不追求整理完所有内容，先让下一次查找更轻松。',
      'tips',
    ],
    [
      'question',
      '大家怎么区分笔记目录和标签？',
      '最近开始整理读书笔记，有些内容既属于设计，也和工作项目有关。放进一个目录怕找不到，复制两份又不方便更新。大家有没有更顺手的整理方法？',
      'help',
    ],
    [
      'thought',
      '',
      '今天翻到半年前写的一句话，突然发现当时困扰自己的问题，已经在不知不觉中解决了。记录的意义，也许就是给以后的自己留一条线索。',
      'daily',
    ],
    [
      'share',
      '我的周回顾：只保留三个小问题',
      '这周学到了什么？有什么事情可以做得更简单？下周最想完成哪一件事？\n\n每次只写几行，比起复杂模板，这个方法更容易坚持。',
      'ideas',
    ],
  ];
  for (const id of ['a', 'b'])
    await profiles.updateProfileOptions({
      db,
      env,
      user: { id, role: 'user' },
      input: { requestId: randomUUID(), expectedRevision: 0, enabled: true, consentVersion: 1, interests: ['tips'] },
    });
  // Synthetic multi-page data bypasses rate limits only inside this disposable fixture.
  for (let i = 0; i < 65; i++) {
    const id = randomUUID();
    const example = examples[i % examples.length];
    const authorId = ['a', 'b', 'root'][i % 3];
    const [p] = await db.query(
      "INSERT INTO community_posts(public_id,author_id,status,published_at) VALUES(?,?,'published',DATE_SUB(NOW(6),INTERVAL ? MINUTE))",
      [id, authorId, i + 1],
    );
    const [r] = await db.query(
      "INSERT INTO community_post_revisions(post_id,revision_no,kind,title,body,mentions,status) VALUES(?,1,?,?,?,JSON_ARRAY(),'published')",
      [p.insertId, example[0], example[1] + (i >= 4 && example[1] ? ' · ' + (i + 1) : ''), example[2]],
    );
    await db.query('UPDATE community_posts SET published_revision_id=? WHERE id=?', [r.insertId, p.insertId]);
    await db.query(
      'INSERT INTO community_post_topics(post_id,topic_id) SELECT ?,id FROM community_topics WHERE slug=?',
      [p.insertId, example[3]],
    );
  }
  const showcaseResources = [];
  for (const type of ['note', 'bookmark']) {
    const snapshot = await resources.prepareResource({
      db,
      env,
      user: root,
      input: { requestId: randomUUID(), type, id: 'root-' + type },
    });
    showcaseResources.push(snapshot.publicId);
  }
  await posts.submitPost({
    db,
    env,
    user: root,
    input: {
      requestId: randomUUID(),
      kind: 'share',
      title: '分享一份轻量的知识整理方法',
      body: '把记录变成习惯，比一次整理完所有资料更容易坚持。附上我的文字笔记和常用文档书签，欢迎一起交流。',
      topics: ['tips'],
      resources: showcaseResources,
    },
  });
  for (const id of ['a', 'b', 'root']) {
    const keys = ['streak_7', 'bookmark_10', 'note_10'];
    for (const key of keys)
      await db.query('INSERT INTO user_achievements(user_id,achievement_key,unlocked_at) VALUES(?,?,NOW())', [id, key]);
    await db.query('INSERT INTO community_chat_member_profiles(user_id,bio,featured_achievements) VALUES(?,?,?)', [
      id,
      '记录生活，分享每一次发现。',
      JSON.stringify(keys),
    ]);
    const [featured] = await db.query(
      "SELECT public_id FROM community_posts WHERE author_id=? AND status='published' ORDER BY published_at DESC LIMIT 2",
      [id],
    );
    await db.query('UPDATE community_profile_options SET featured_posts=? WHERE user_id=?', [
      JSON.stringify(featured.map((post) => post.public_id)),
      id,
    ]);
  }
}
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.set('Access-Control-Allow-Headers', 'Content-Type,X-Fixture-Account');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const routes = {
  'GET feed/capabilities': async (args) => ({
    ...(await capabilities(args)),
    imagesEnabled: await images.imagesReady(db),
    resourcesEnabled: await resources.resourcesReady(db),
  }),
  'GET resources/eligible': resources.eligibleResources,
  'POST resources/prepare': resources.prepareResource,
  'GET topics': topics.listTopics,
  'GET moderation/topics': (args) => topics.listTopics({ ...args, moderation: true }),
  'POST moderation/topics': topics.saveTopic,
  'GET members': profiles.members,
  'GET posts': posts.listPosts,
  'POST posts': posts.submitPost,
  'POST posts/withdraw': posts.withdrawPost,
  'POST posts/delete': posts.deletePost,
  'POST posts/state': comments.postState,
  'POST posts/resolve': comments.resolveQuestion,
  'GET own/posts': posts.ownPosts,
  'GET own/comments': comments.ownComments,
  'POST moderation/reports': governance.dismissReport,
  'GET own/results': governance.results,
  'GET comments': comments.listComments,
  'GET comments/context': comments.commentContext,
  'POST comments': comments.createComment,
  'POST comments/state': comments.commentState,
  'POST comments/withdraw': comments.withdrawComment,
  'GET profiles/options/me': profiles.profileOptions,
  'PUT profiles/options/me': profiles.updateProfileOptions,
  'GET relations': profiles.relationList,
  'PUT relations': profiles.relation,
  'POST reports': governance.reportContent,
  'POST appeals': governance.appeal,
  'GET moderation/posts': (args) => posts.ownPosts({ ...args, moderation: true }),
  'GET moderation/queue': governance.moderationQueue,
  'POST moderation/posts': posts.moderatePost,
  'POST moderation/comments': comments.moderateComment,
  'POST moderation/appeals': governance.reviewAppeal,
  'GET preferences/me': getCommunityPreferences,
  'PUT preferences/me': updateCommunityPreferences,
};
const imageObjects = new Map();
app.use(
  '/api/community/images',
  multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single('file'),
);
app.use(async (req, res) => {
  const id = req.get('X-Fixture-Account') || (req.path.startsWith('/api/community/images/') ? req.query.account : null);
  if (!['a', 'b', 'root'].includes(id)) return res.sendStatus(403);
  const user = { id, role: id === 'root' ? 'root' : 'user' },
    path = req.path.replace(/^\/api\/community\//, '');
  const args = { db, env, user, input: req.method === 'GET' ? req.query : req.body };
  try {
    let data;
    if (req.path === '/api/growth/claimAll') {
      const c = await db.getConnection();
      try {
        await c.beginTransaction();
        await c.query('INSERT INTO user_growth(user_id) VALUES(?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)', [
          id,
        ]);
        const receipts = await taskRewards.claimTaskRewards(
          c,
          id,
          req.body.keys?.community ? new Set(req.body.keys.community) : null,
          { grantExp, earnPoints, userRole: user.role },
        );
        const [[growth]] = await c.query('SELECT * FROM user_growth WHERE user_id=?', [id]);
        await c.commit();
        const awarded = receipts.filter((r) => r.status === 'claimed');
        data = {
          ok: true,
          receipts,
          claimed: awarded.length,
          exp: awarded.reduce((n, r) => n + (r.reward.exp || 0), 0),
          points: awarded.reduce((n, r) => n + (r.reward.points || 0), 0),
          growth,
        };
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    } else if (req.path === '/api/growth/claimable') {
      const items = (await taskRewards.taskRewardStates(db, id)).filter((r) => r.state === 'claimable');
      data = {
        count: items.length,
        community: { count: items.length, items },
        daily: { count: 0, items: [] },
        growthTasks: { count: 0, items: [] },
        achievements: { count: 0, items: [] },
        weekly: { count: 0, items: [] },
      };
    } else if (req.path === '/api/community-chat/profile/me')
      data =
        req.method === 'GET'
          ? await chatProfiles.getCommunityChatOwnProfile(args)
          : await chatProfiles.updateCommunityChatOwnProfile({ ...args, ...req.body });
    else if (/^resources\/[a-f0-9-]+\/discard$/.test(path))
      data = await resources.discardResource({ ...args, id: path.split('/')[1] });
    else if (/^resources\/[a-f0-9-]+$/.test(path))
      data = await resources.readResource({ ...args, id: path.split('/')[1] });
    else if (path === 'images' && req.method === 'POST')
      data = await images.uploadImage({
        ...args,
        file: req.file,
        putObject: async (key, file) => {
          imageObjects.set(key, await fs.readFile(file));
        },
      });
    else if (/^images\/[a-f0-9-]+\/discard$/.test(path))
      data = await images.discardImage({ ...args, id: path.split('/')[1] });
    else if (/^images\/[a-f0-9-]+$/.test(path)) {
      const result = await images.readImage({ ...args, id: path.split('/')[1], sign: () => ({ url: 'unused' }) });
      const bytes = imageObjects.get(result.object_key);
      if (!bytes) return res.sendStatus(404);
      return res.set('Cache-Control', 'private, no-store').type(result.content_type).send(bytes);
    } else if (req.path === '/fixture/notifications') {
      while (await consumeCommunityEvent({ db, env })) {}
      const [items] = await db.query(
        `SELECT * FROM notification WHERE user_id=? AND ${feedNotificationVisibleSql(true)} ORDER BY create_time DESC`,
        [id],
      );
      data = { items };
    } else if (routes[req.method + ' ' + path]) data = await routes[req.method + ' ' + path](args);
    else if (/^topics\/[a-z0-9-]+$/.test(path)) data = await topics.topicDetail({ ...args, slug: path.split('/')[1] });
    else if (/^posts\/[a-f0-9-]+$/.test(path)) data = await posts.postDetail({ ...args, id: path.split('/')[1] });
    else if (/^profiles\/[a-f0-9-]+$/.test(path))
      data = await profiles.publicProfile({ ...args, id: path.split('/')[1] });
    else if (path.startsWith('operations/')) data = await operationReceipt({ ...args, requestId: path.split('/')[1] });
    else return res.status(404).json({ status: 404 });
    const result = JSON.parse(JSON.stringify(data), (key, value) =>
      key === 'url' && typeof value === 'string' && value.startsWith('/api/community/images/')
        ? `http://127.0.0.1:${fixturePort}` + value + (value.includes('?') ? '&' : '?') + 'account=' + id
        : value,
    );
    res.json({ status: 200, data: result });
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ status: error.status || 500, data: { code: error.code || 'FIXTURE_ERROR' } });
  }
});
const http = app.listen(fixturePort, '127.0.0.1', (error) => {
  if (error) {
    console.error(`Community fixture failed to listen: ${error.code || 'LISTEN_FAILED'}`);
    void close(1);
    return;
  }
  console.log(`Community fixture ready on 127.0.0.1:${fixturePort}`);
});
async function close(exitCode = 0) {
  http.close();
  await db.end();
  await admin.query(`DROP DATABASE ${schema}`);
  await admin.end();
  process.exit(exitCode);
}
process.on('SIGTERM', () => close());
process.on('SIGINT', () => close());
