import { communityGrowthMetrics, communityWeekPosts } from './growthMetrics.js';
import { taskRewardStates, claimTaskRewards } from './taskRewards.js';
import { listTopics, topicDetail, saveTopic } from './topics.js';
import { prepareResource, readResource, discardResource, cleanupResources, resourcesReady } from './resources.js';
import { readImage, uploadImage, discardImage, cleanupImages, imagesReady } from './images.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { ensureCommunityFeedSchema, communityFeedSchemaReady } from './schema.js';
import { COMMUNITY_CHAT_TABLE_SQL } from '../communityChatSchema.js';
import { submitPost, moderatePost, listPosts, postDetail, withdrawPost, deletePost, ownPosts } from './posts.js';
import {
  createComment,
  withdrawComment,
  listComments,
  ownComments,
  resolveQuestion,
  postState,
  commentState,
} from './comments.js';
import { relation, updateProfileOptions, profileOptions, members, publicProfile } from './profiles.js';
import { reportContent, appeal, results, dismissReport } from './governance.js';
import { markNotificationSnapshotRead } from '../notificationReadSnapshot.js';
import { purgeCommunityFeedData } from './lifecycle.js';
import { COMMUNITY_FEED_TABLES } from './schema.js';
import { identity } from './core.js';
import { consumeCommunityEvent, feedNotificationVisibleSql } from './notifications.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const env = {
  COMMUNITY_FEED_ENABLED: 'true',
  COMMUNITY_FEED_WRITES_ENABLED: 'true',
  COMMUNITY_CHAT_ACCESS_MODE: 'public',
  COMMUNITY_FEED_WORKER_ENABLED: 'true',
};
const A = { id: 'a', role: 'user' },
  B = { id: 'b', role: 'user' },
  ROOT = { id: 'root', role: 'root' };
let db, admin;
const schema = 'community_feed_' + randomUUID().replaceAll('-', '');
const input = (values = {}) => ({ requestId: randomUUID(), ...values });
const postInput = (values = {}) =>
  input({
    kind: 'question',
    title: '怎样整理资料？',
    body: '希望交流可行的办法。',
    topics: ['help'],
    profileConsentVersion: 1,
    ...values,
  });
const run = (fn, user, body) => fn({ user, input: body, env, db });
async function published(user = A) {
  const p = await run(submitPost, user, postInput());
  if (user.role !== 'root')
    await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: p.revision, action: 'approve', reason: '符合讨论规则' }),
    );
  return postDetail({ user, id: p.publicId, env, db });
}
describe.skipIf(!socketPath)('P2 real database boundaries', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema}`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 8 });
    await db.query(
      "CREATE TABLE user (id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY, role varchar(255),del_flag varchar(255) DEFAULT '0', alias varchar(80),preferences JSON,head_picture TEXT,create_time DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    );
    await db.query(
      'CREATE TABLE user_growth(user_id varchar(255) PRIMARY KEY,exp int,level int DEFAULT 1,equipped_title varchar(80),equipped_frame varchar(80))',
    );
    await db.query(
      'CREATE TABLE user_achievements (user_id varchar(255),achievement_key varchar(80),unlocked_at datetime,claimed_at datetime,reward_points_snapshot int,reward_frame_id_snapshot varchar(80),policy_version varchar(80),PRIMARY KEY(user_id,achievement_key))',
    );
    await db.query(
      'CREATE TABLE points_log (id bigint PRIMARY KEY,user_id varchar(255),reason varchar(80),ref varchar(80))',
    );
    for (const sql of COMMUNITY_CHAT_TABLE_SQL) await db.query(sql);
    await db.query(
      'CREATE TABLE IF NOT EXISTS note(id varchar(255) PRIMARY KEY,create_by varchar(255),del_flag tinyint DEFAULT 0,title varchar(255),content MEDIUMTEXT,type varchar(20))',
    );
    await db.query(
      'CREATE TABLE IF NOT EXISTS bookmark(id varchar(255) PRIMARY KEY,user_id varchar(255),del_flag tinyint DEFAULT 0,name varchar(255),url TEXT)',
    );
    await db.query(`CREATE TABLE user_growth_preferences(user_id varchar(255) PRIMARY KEY,
      weekly_active_target int,streak_reminder_enabled int,celebration_enabled int,low_pressure_mode int,
      timezone varchar(64),utc_offset_minutes int,points_goal_item_id varchar(80),points_goal_enabled int)`);
    await db.query(
      'CREATE TABLE points_earning_period_policy(period_type varchar(8),period_key varchar(8),policy_version varchar(80),PRIMARY KEY(period_type,period_key))',
    );
    await ensureCommunityFeedSchema(db);
    await ensureCommunityFeedSchema(db);
    await db.query(
      'CREATE TABLE notification (id char(36) PRIMARY KEY,user_id varchar(255),type varchar(32),title varchar(255),content text,link varchar(255),meta json,batch_id char(36),source_type varchar(40),source_id varchar(160),is_read tinyint,read_time datetime,del_flag tinyint DEFAULT 0,browser_push_pending tinyint,create_time datetime(6) DEFAULT CURRENT_TIMESTAMP(6),browser_push_created_at datetime(6),UNIQUE KEY uk_source(user_id,source_type,source_id))',
    );
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    const [tables] = await db.query('SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()');
    for (const row of tables) {
      const name = row.TABLE_NAME || row.table_name;
      if (name !== 'community_topics') await db.query(`DELETE FROM \`${name}\``);
    }
    for (const u of [A, B, ROOT])
      await db.query('INSERT INTO user (id,role,alias,preferences) VALUES (?,?,?,?)', [
        u.id,
        u.role,
        `测试成员${u.id}`,
        '{}',
      ]);
  });
  it('loads only the requested author post and its latest revision for editing', async () => {
    const target = await published(A);
    await published(A);
    const current = target;
    await run(
      submitPost,
      A,
      postInput({ postId: target.publicId, expectedRevision: current.revision, body: '新的待审核修改' }),
    );
    const page = await run(ownPosts, A, { postId: target.publicId, limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ publicId: target.publicId, body: '新的待审核修改', pending: true });
    expect((await run(ownPosts, B, { postId: target.publicId })).items).toEqual([]);
  });
  it('freezes approved activity rewards, blocks removed posts and serializes claims with rollback', async () => {
    const config = {
      slug: 'reward-test',
      nameZh: '活动',
      nameEn: 'Activity',
      descriptionZh: '',
      descriptionEn: '',
      enabled: true,
      sortOrder: 0,
      officialPinned: true,
      postTask: true,
      expectedRevision: 0,
      reward: {
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 60000).toISOString(),
        exp: 20,
        points: 50,
      },
    };
    await run(saveTopic, ROOT, input(config));
    const draft = await run(submitPost, A, postInput({ topics: ['reward-test'] }));
    expect((await taskRewardStates(db, A.id))[0].state).toBe('pending');
    await run(
      moderatePost,
      ROOT,
      input({ postId: draft.publicId, expectedRevision: draft.revision, action: 'approve', reason: 'ok' }),
    );
    expect((await taskRewardStates(db, A.id))[0]).toMatchObject({ state: 'claimable', exp: 20, points: 50 });
    expect((await taskRewardStates(db, B.id))[0].state).toBe('active');
    await expect(
      run(saveTopic, ROOT, input({ ...config, expectedRevision: 1, reward: { ...config.reward, points: 100 } })),
    ).rejects.toMatchObject({ code: 'COMMUNITY_REWARD_LOCKED' });
    let post = await postDetail({ user: A, id: draft.publicId, env, db });
    await run(
      moderatePost,
      ROOT,
      input({ postId: draft.publicId, expectedRevision: post.revision, action: 'remove', reason: 'test' }),
    );
    expect((await taskRewardStates(db, A.id))[0].state).toBe('unavailable');
    const [row] = await db.query('SELECT row_revision FROM community_posts WHERE public_id=?', [draft.publicId]);
    await run(
      moderatePost,
      ROOT,
      input({
        postId: draft.publicId,
        expectedRevision: Number(row[0].row_revision),
        action: 'restore',
        reason: 'test',
      }),
    );
    const grantExp = vi.fn(async () => ({ granted: 20 })),
      earnPoints = vi.fn(async () => true);
    async function claim(fail = false) {
      const c = await db.getConnection();
      try {
        await c.beginTransaction();
        const result = await claimTaskRewards(c, A.id, new Set(['reward-test']), {
          grantExp,
          earnPoints: fail
            ? async () => {
                throw new Error('rollback');
              }
            : earnPoints,
          userRole: 'user',
        });
        await c.commit();
        return result;
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    }
    await expect(claim(true)).rejects.toThrow('rollback');
    expect((await taskRewardStates(db, A.id))[0].state).toBe('claimable');
    grantExp.mockClear();
    const results = await Promise.all([claim(), claim()]);
    expect(results.flat().filter((x) => x.status === 'claimed')).toHaveLength(1);
    expect(grantExp).toHaveBeenCalledTimes(1);
    expect(earnPoints).toHaveBeenCalledTimes(1);
    expect((await taskRewardStates(db, A.id))[0].state).toBe('claimed');
  });
  it('does not award submissions outside the activity window', async () => {
    const now = Date.now();
    await run(
      saveTopic,
      ROOT,
      input({
        slug: 'future-reward',
        nameZh: '未来',
        nameEn: 'Future',
        descriptionZh: '',
        descriptionEn: '',
        enabled: true,
        sortOrder: 0,
        officialPinned: true,
        postTask: true,
        expectedRevision: 0,
        reward: {
          startsAt: new Date(now + 60000).toISOString(),
          endsAt: new Date(now + 120000).toISOString(),
          exp: 0,
          points: 50,
        },
      }),
    );
    const draft = await run(submitPost, A, postInput({ topics: ['future-reward'] }));
    await run(
      moderatePost,
      ROOT,
      input({ postId: draft.publicId, expectedRevision: draft.revision, action: 'approve', reason: 'ok' }),
    );
    const [awards] = await db.query('SELECT * FROM community_task_awards WHERE user_id=?', [A.id]);
    expect(awards).toHaveLength(0);
    expect((await taskRewardStates(db, A.id))[0].state).toBe('upcoming');
  });
  it('allows approval after the deadline, but not rejected or late submissions', async () => {
    const now = Date.now();
    const config = {
      slug: 'deadline-reward',
      nameZh: '截止测试',
      nameEn: 'Deadline',
      descriptionZh: '',
      descriptionEn: '',
      enabled: true,
      sortOrder: 0,
      officialPinned: true,
      postTask: true,
      expectedRevision: 0,
      reward: {
        startsAt: new Date(now - 120000).toISOString(),
        endsAt: new Date(now - 60000).toISOString(),
        exp: 20,
        points: 0,
      },
    };
    await run(saveTopic, ROOT, input(config));
    const timely = await run(submitPost, A, postInput({ topics: [config.slug] }));
    await db.query(
      'UPDATE community_post_revisions SET created_at=FROM_UNIXTIME(?/1000) WHERE post_id=(SELECT id FROM community_posts WHERE public_id=?)',
      [now - 90000, timely.publicId],
    );
    await run(
      moderatePost,
      ROOT,
      input({ postId: timely.publicId, expectedRevision: timely.revision, action: 'approve', reason: 'ok' }),
    );
    expect((await taskRewardStates(db, A.id))[0].state).toBe('claimable');
    const rejected = await run(submitPost, B, postInput({ topics: [config.slug] }));
    await db.query(
      'UPDATE community_post_revisions SET created_at=FROM_UNIXTIME(?/1000) WHERE post_id=(SELECT id FROM community_posts WHERE public_id=?)',
      [now - 90000, rejected.publicId],
    );
    await run(
      moderatePost,
      ROOT,
      input({
        postId: rejected.publicId,
        expectedRevision: rejected.revision,
        action: 'reject',
        reason: 'not eligible',
      }),
    );
    expect((await taskRewardStates(db, B.id))[0].state).toBe('ended');
    const late = await run(submitPost, B, postInput({ topics: [config.slug] }));
    await run(
      moderatePost,
      ROOT,
      input({ postId: late.publicId, expectedRevision: late.revision, action: 'approve', reason: 'ok' }),
    );
    expect((await taskRewardStates(db, B.id))[0].state).toBe('ended');
  });
  it('persists comment likes, deduplicates retries and rejects deleted or cross-post comments', async () => {
    const post = await published();
    const comment = await run(createComment, B, input({ postId: post.publicId, body: 'A useful answer' }));
    const like = input({ postId: post.publicId, commentId: comment.publicId, liked: true });
    await run(commentState, A, like);
    expect((await run(commentState, A, like)).likeCount).toBe(1);
    const page = await run(listComments, A, { postId: post.publicId });
    expect(page.items[0]).toMatchObject({ liked: true, likeCount: 1 });
    expect((await run(listComments, B, { postId: post.publicId })).items[0]).toMatchObject({
      liked: false,
      likeCount: 1,
    });
    expect((await run(commentState, A, input({ ...like, requestId: randomUUID(), liked: false }))).likeCount).toBe(0);
    const another = await published();
    await expect(
      run(commentState, A, input({ postId: another.publicId, commentId: comment.publicId, liked: true })),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
    await run(
      withdrawComment,
      B,
      input({ postId: post.publicId, commentId: comment.publicId, expectedRevision: page.items[0].revision }),
    );
    await expect(run(commentState, A, input({ ...like, requestId: randomUUID() }))).rejects.toMatchObject({
      code: 'COMMUNITY_CONTENT_UNAVAILABLE',
    });
  });

  it('allows resolving help-topic posts regardless of legacy kind and rejects other topics', async () => {
    const help = await run(submitPost, ROOT, postInput({ kind: 'share', title: '' }));
    const detail = await postDetail({ user: ROOT, id: help.publicId, env, db });
    const result = await run(
      resolveQuestion,
      ROOT,
      input({ postId: help.publicId, expectedRevision: detail.revision, resolved: true }),
    );
    expect(result.resolved).toBe(true);
    const other = await run(submitPost, ROOT, postInput({ topics: [] }));
    const otherDetail = await postDetail({ user: ROOT, id: other.publicId, env, db });
    await expect(
      run(
        resolveQuestion,
        ROOT,
        input({ postId: other.publicId, expectedRevision: otherDetail.revision, resolved: true }),
      ),
    ).rejects.toMatchObject({ code: 'COMMUNITY_INVALID_INPUT' });
  });

  it('notifies administrators for a pending revision and the author after approval', async () => {
    const post = await run(submitPost, A, postInput());
    while (await consumeCommunityEvent({ db, env })) {}
    const [alerts] = await db.query(
      "SELECT * FROM notification WHERE user_id=? AND source_type='community_feed_review'",
      [ROOT.id],
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].link).toBe('/community/moderation');
    expect(
      (
        await db.query(
          `SELECT * FROM notification WHERE ${feedNotificationVisibleSql(true)} AND source_type='community_feed_review'`,
        )
      )[0],
    ).toHaveLength(1);
    await run(
      moderatePost,
      ROOT,
      input({ postId: post.publicId, expectedRevision: post.revision, action: 'approve', reason: '通过' }),
    );
    while (await consumeCommunityEvent({ db, env })) {}
    expect(
      (await db.query("SELECT * FROM notification WHERE user_id=? AND source_type='community_feed_result'", [A.id]))[0],
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          `SELECT * FROM notification WHERE ${feedNotificationVisibleSql(true)} AND source_type='community_feed_review'`,
        )
      )[0],
    ).toHaveLength(0);
  });
  it('manages topics with root authorization, revisions and replay-safe receipts', async () => {
    const draft = input({
      slug: 'mid-autumn',
      nameZh: '中秋',
      nameEn: 'Mid-Autumn',
      descriptionZh: '记录团圆',
      descriptionEn: 'Share a moment',
      enabled: true,
      sortOrder: -10,
      officialPinned: true,
      postTask: true,
      expectedRevision: 0,
    });
    await expect(run(saveTopic, A, draft)).rejects.toMatchObject({ status: 403 });
    const saved = await run(saveTopic, ROOT, draft);
    expect(saved.revision).toBe(1);
    expect(await run(saveTopic, ROOT, draft)).toEqual(saved);
    await expect(run(saveTopic, ROOT, { ...draft, requestId: randomUUID() })).rejects.toMatchObject({
      code: 'COMMUNITY_REVISION_CONFLICT',
    });
    expect((await listTopics({ user: A, db, env })).find((t) => t.slug === 'mid-autumn')).toMatchObject({
      postTask: true,
      officialPinned: true,
    });
    await run(saveTopic, ROOT, { ...draft, requestId: randomUUID(), expectedRevision: 1, enabled: false });
    expect((await listTopics({ user: A, db, env })).some((t) => t.slug === 'mid-autumn')).toBe(false);
    await expect(topicDetail({ user: A, slug: 'mid-autumn', db, env })).rejects.toMatchObject({ status: 404 });
    await expect(run(submitPost, A, postInput({ topics: ['mid-autumn'] }))).rejects.toMatchObject({
      code: 'COMMUNITY_TOPIC_UNAVAILABLE',
    });
    await run(saveTopic, ROOT, { ...draft, requestId: randomUUID(), expectedRevision: 2, enabled: true });
  });
  it('counts task participation from current public topic revisions, never another member or a withdrawn post', async () => {
    await run(
      saveTopic,
      ROOT,
      input({
        slug: 'mid-autumn',
        nameZh: '中秋',
        nameEn: 'Mid-Autumn',
        descriptionZh: '记录团圆',
        descriptionEn: 'Share',
        enabled: true,
        sortOrder: -10,
        officialPinned: true,
        postTask: true,
        expectedRevision: 0,
      }),
    );
    const detail = () => topicDetail({ user: A, slug: 'mid-autumn', db, env });
    expect((await detail()).participation).toBe('not_started');
    const post = await run(submitPost, A, postInput({ topics: ['mid-autumn'] }));
    expect(await detail()).toMatchObject({ participation: 'pending_review', postCount: 0 });
    expect((await topicDetail({ user: B, slug: 'mid-autumn', db, env })).participation).toBe('not_started');
    await run(
      moderatePost,
      ROOT,
      input({ postId: post.publicId, expectedRevision: post.revision, action: 'approve', reason: '通过' }),
    );
    expect(await detail()).toMatchObject({
      participation: 'completed',
      participationPostId: post.publicId,
      postCount: 1,
    });
    const published = await postDetail({ user: A, id: post.publicId, db, env });
    await run(withdrawPost, A, input({ postId: post.publicId, expectedRevision: published.revision }));
    expect(await detail()).toMatchObject({ participation: 'not_started', postCount: 0 });
  });
  it('community members have a public home without an opt-in or an options row', async () => {
    const member = await identity(db, A.id);
    const page = await publicProfile({ user: B, id: member.userPublicId, db, env });
    expect(page.isOwn).toBe(false);
    expect(page.interests).toEqual([]);
    expect(page.posts.items).toEqual([]);
    expect(page).not.toHaveProperty('email');
    await run(relation, B, input({ userPublicId: member.userPublicId, action: 'follow', enabled: true }));
    await updateProfileOptions({
      user: A,
      db,
      env,
      input: input({ expectedRevision: 0, enabled: false, interests: ['ideas'], featuredPosts: [] }),
    });
    expect((await publicProfile({ user: B, id: member.userPublicId, db, env })).following).toBe(true);
  });
  it('schema installation is repeatable and feed fails closed', async () => {
    expect(await communityFeedSchemaReady(db)).toBe(true);
    await expect(submitPost({ user: A, input: postInput(), env: {}, db })).rejects.toMatchObject({
      code: 'COMMUNITY_CLOSED',
    });
  });
  it('pending drafts stay private and revision approval publishes only the exact version', async () => {
    const p = await run(submitPost, A, postInput());
    expect((await listPosts({ user: B, env, db })).items).toEqual([]);
    await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: 1, action: 'approve', reason: '通过' }),
    );
    const before = await postDetail({ user: B, id: p.publicId, env, db });
    const edit = await run(
      submitPost,
      A,
      postInput({ postId: p.publicId, expectedRevision: before.revision, body: '待审核的新内容' }),
    );
    expect((await postDetail({ user: B, id: p.publicId, env, db })).body).toBe('希望交流可行的办法。');
    await expect(
      run(
        moderatePost,
        ROOT,
        input({ postId: p.publicId, expectedRevision: before.revision, action: 'approve', reason: '旧审核' }),
      ),
    ).rejects.toMatchObject({ code: 'COMMUNITY_REVISION_CONFLICT' });
    await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: edit.revision, action: 'approve', reason: '新版通过' }),
    );
    expect((await postDetail({ user: B, id: p.publicId, env, db })).body).toBe('待审核的新内容');
  });
  it('same request has one result under concurrency and cannot be reused with another body', async () => {
    const body = postInput();
    const all = await Promise.all(Array.from({ length: 4 }, () => run(submitPost, A, body)));
    expect(new Set(all.map((x) => x.publicId)).size).toBe(1);
    await expect(run(submitPost, A, { ...body, body: 'different' })).rejects.toMatchObject({
      code: 'COMMUNITY_REQUEST_REUSED',
    });
  });
  it('withdrawal defeats late approval, works read-only, and never restores through moderation', async () => {
    const p = await run(submitPost, A, postInput());
    await withdrawPost({ user: A, input: input({ postId: p.publicId, expectedRevision: p.revision }), db, env: {} });
    await expect(
      run(moderatePost, ROOT, input({ postId: p.publicId, expectedRevision: 2, action: 'approve', reason: 'late' })),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
  });
  it('republishes a withdrawn post through a new review without exposing the old version', async () => {
    const original = await published();
    const withdrawn = await run(
      withdrawPost,
      A,
      input({ postId: original.publicId, expectedRevision: original.revision }),
    );
    const payload = postInput({
      postId: original.publicId,
      expectedRevision: withdrawn.revision,
      title: '重新整理后发布',
    });
    await expect(run(submitPost, B, payload)).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
    const submitted = await run(submitPost, A, payload);
    expect(submitted).toMatchObject({ publicId: original.publicId, status: 'pending_review' });
    expect(
      (await ownPosts({ user: A, env, db })).items.find((item) => item.publicId === original.publicId),
    ).toMatchObject({
      status: 'pending_review',
      displayStatus: 'pending_review',
      hasPublishedVersion: false,
      title: '重新整理后发布',
    });
    await expect(postDetail({ user: B, id: original.publicId, env, db })).rejects.toMatchObject({
      code: 'COMMUNITY_CONTENT_UNAVAILABLE',
    });
    await expect(
      run(
        moderatePost,
        ROOT,
        input({
          postId: original.publicId,
          expectedRevision: original.revision,
          action: 'approve',
          reason: '迟到审批',
        }),
      ),
    ).rejects.toMatchObject({ code: 'COMMUNITY_REVISION_CONFLICT' });
    const rejected = await run(
      moderatePost,
      ROOT,
      input({ postId: original.publicId, expectedRevision: submitted.revision, action: 'reject', reason: '补充说明' }),
    );
    await expect(postDetail({ user: B, id: original.publicId, env, db })).rejects.toMatchObject({
      code: 'COMMUNITY_CONTENT_UNAVAILABLE',
    });
    const revised = await run(
      submitPost,
      A,
      postInput({ postId: original.publicId, expectedRevision: rejected.revision, title: '补充后的版本' }),
    );
    await run(
      moderatePost,
      ROOT,
      input({ postId: original.publicId, expectedRevision: revised.revision, action: 'approve', reason: '通过' }),
    );
    expect(await postDetail({ user: B, id: original.publicId, env, db })).toMatchObject({ title: '补充后的版本' });
    expect(
      (await ownPosts({ user: A, env, db })).items.filter((item) => item.publicId === original.publicId),
    ).toHaveLength(1);
  });
  it('lets root republish directly but never edit a deleted post', async () => {
    const original = await published(ROOT);
    const withdrawn = await run(
      withdrawPost,
      ROOT,
      input({ postId: original.publicId, expectedRevision: original.revision }),
    );
    const republished = await run(
      submitPost,
      ROOT,
      postInput({ postId: original.publicId, expectedRevision: withdrawn.revision, title: '管理员重新发布' }),
    );
    expect(republished.status).toBe('published');
    expect(await postDetail({ user: A, id: original.publicId, env, db })).toMatchObject({ title: '管理员重新发布' });
    const withdrawnAgain = await run(
      withdrawPost,
      ROOT,
      input({ postId: original.publicId, expectedRevision: republished.revision }),
    );
    const deleted = await run(
      deletePost,
      ROOT,
      input({ postId: original.publicId, expectedRevision: withdrawnAgain.revision }),
    );
    await expect(
      run(submitPost, ROOT, postInput({ postId: original.publicId, expectedRevision: deleted.revision })),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
  });
  it('directly deletes published, pending and locked posts without allowing late approval', async () => {
    for (const state of ['published', 'pending', 'locked']) {
      let post = state === 'pending' ? await run(submitPost, A, postInput()) : await published();
      if (state === 'locked') {
        const locked = await run(
          moderatePost,
          ROOT,
          input({ postId: post.publicId, expectedRevision: post.revision, action: 'lock', reason: '暂停讨论' }),
        );
        post = { ...post, revision: locked.revision };
      }
      const args = { postId: post.publicId, expectedRevision: post.revision };
      await expect(run(deletePost, B, input(args))).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
      const deleted = await run(deletePost, A, input(args));
      expect(deleted.status).toBe('deleted');
      expect((await ownPosts({ user: A, env, db })).items.some((item) => item.publicId === post.publicId)).toBe(false);
      expect((await listPosts({ user: B, env, db })).items.some((item) => item.publicId === post.publicId)).toBe(false);
      await expect(postDetail({ user: B, id: post.publicId, env, db })).rejects.toMatchObject({
        code: 'COMMUNITY_CONTENT_UNAVAILABLE',
      });
      await expect(
        run(
          moderatePost,
          ROOT,
          input({ ...args, expectedRevision: deleted.revision, action: 'approve', reason: 'late' }),
        ),
      ).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
      const [rows] = await db.query('SELECT pending_revision_id FROM community_posts WHERE public_id=?', [
        post.publicId,
      ]);
      expect(rows[0].pending_revision_id).toBeNull();
    }
  });
  it('shows withdrawal over the published revision and enforces owner deletion and revision checks', async () => {
    const p = await published();
    const args = { postId: p.publicId, expectedRevision: p.revision };
    const withdrawn = await run(withdrawPost, A, input(args));
    const own = await ownPosts({ user: A, env, db });
    expect(own.items.find((item) => item.publicId === p.publicId)).toMatchObject({
      status: 'withdrawn',
      displayStatus: 'withdrawn',
      revisionStatus: 'published',
      hasPublishedVersion: false,
    });
    await expect(run(deletePost, B, input({ ...args, expectedRevision: withdrawn.revision }))).rejects.toMatchObject({
      code: 'COMMUNITY_CONTENT_UNAVAILABLE',
    });
    await expect(run(deletePost, A, input(args))).rejects.toMatchObject({ code: 'COMMUNITY_REVISION_CONFLICT' });
    const request = input({ ...args, expectedRevision: withdrawn.revision });
    const deleted = await deletePost({ user: A, input: request, db, env: {} });
    expect(deleted.status).toBe('deleted');
    expect(await deletePost({ user: A, input: request, db, env: {} })).toEqual(deleted);
    expect((await ownPosts({ user: A, env, db })).items.some((item) => item.publicId === p.publicId)).toBe(false);
    await expect(run(withdrawPost, A, input({ ...args, expectedRevision: deleted.revision }))).rejects.toMatchObject({
      code: 'COMMUNITY_CONTENT_UNAVAILABLE',
    });
    await expect(
      run(
        moderatePost,
        ROOT,
        input({ ...args, expectedRevision: deleted.revision, action: 'restore', reason: 'restore' }),
      ),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
    await expect(postDetail({ user: A, id: p.publicId, env, db })).rejects.toMatchObject({
      code: 'COMMUNITY_CONTENT_UNAVAILABLE',
    });
  });
  it('root comment withdrawal preserves replies; cross-post replies are denied', async () => {
    const p = await published(),
      other = await published();
    const c = await run(createComment, B, input({ postId: p.publicId, body: '建议分主题' }));
    await run(createComment, A, input({ postId: p.publicId, body: '谢谢', replyTo: c.publicId }));
    await run(withdrawComment, B, input({ postId: p.publicId, commentId: c.publicId, expectedRevision: 1 }));
    const roots = await run(listComments, A, { postId: p.publicId });
    expect(roots.items[0].body).toBe('');
    expect(roots.items[0].replyCount).toBe(1);
    expect((await run(listComments, A, { postId: p.publicId, root: c.publicId })).items).toHaveLength(1);
    await expect(
      run(createComment, A, input({ postId: other.publicId, body: 'bad', replyTo: c.publicId })),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
  });
  it('lock and comment race has a valid serial outcome; subsequent comments fail', async () => {
    const p = await published();
    await Promise.allSettled([
      run(createComment, B, input({ postId: p.publicId, body: '同时评论' })),
      run(
        moderatePost,
        ROOT,
        input({ postId: p.publicId, expectedRevision: p.revision, action: 'lock', reason: '暂停讨论' }),
      ),
    ]);
    await expect(run(createComment, B, input({ postId: p.publicId, body: 'late' }))).rejects.toMatchObject({
      code: 'COMMUNITY_THREAD_LOCKED',
    });
  });
  it('block invalidates discovery and relationships', async () => {
    const p = await published();
    const author = p.author.userPublicId;
    await run(relation, B, input({ userPublicId: author, action: 'follow', enabled: true }));
    await run(relation, B, input({ userPublicId: author, action: 'block', enabled: true }));
    expect((await listPosts({ user: B, env, db })).items).toEqual([]);
    expect((await db.query('SELECT * FROM community_follows'))[0]).toHaveLength(0);
    await expect(
      run(relation, B, input({ userPublicId: author, action: 'follow', enabled: true })),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
  });
  it('comment event retries do not duplicate notifications; likes do not add events and removed sources leave unread', async () => {
    const p = await published();
    await db.query("UPDATE community_outbox SET status='done'");
    await run(postState, B, input({ postId: p.publicId, liked: true }));
    expect((await db.query("SELECT * FROM community_outbox WHERE status='pending'"))[0]).toHaveLength(0);
    await run(createComment, B, input({ postId: p.publicId, body: '评论' }));
    await consumeCommunityEvent({ db, env });
    await db.query("UPDATE community_outbox SET status='pending',recipient_cursor='' WHERE kind='comment'");
    await consumeCommunityEvent({ db, env });
    const [notifications] = await db.query("SELECT * FROM notification WHERE type='community_feed'");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].user_id).toBe(A.id);
    expect(notifications[0].browser_push_pending).toBe(0);
    await run(withdrawPost, A, input({ postId: p.publicId, expectedRevision: p.revision }));
    expect((await db.query(`SELECT * FROM notification WHERE ${feedNotificationVisibleSql(true)}`))[0]).toHaveLength(0);
  });
  it('report, disposition and appeal remain available when feed is disabled', async () => {
    const p = await published();
    await run(reportContent, B, input({ postId: p.publicId, reason: 'privacy', detail: '请核查' }));
    const action = await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: p.revision, action: 'remove', reason: '需要修改' }),
    );
    const a = await appeal({ user: A, input: input({ actionId: action.actionId, body: '请求复核' }), env: {}, db });
    expect(a.status).toBe('pending');
    expect((await results({ user: A, env: {}, db })).items.some((x) => x.publicId === action.actionId)).toBe(true);
  });
  it('disabled owners are not visible and cannot write through an old session', async () => {
    await published();
    await db.query("UPDATE user SET del_flag='1' WHERE id=?", [A.id]);
    expect((await listPosts({ user: B, env, db })).items).toEqual([]);
    await expect(run(submitPost, A, postInput())).rejects.toMatchObject({ code: 'COMMUNITY_ACCOUNT_UNAVAILABLE' });
  });
  it('legacy profile switches do not close a home; private notification preferences remain editable after feature closure', async () => {
    await published();
    const options = await profileOptions({ user: A, env, db });
    expect(options.userPublicId).toBe((await identity(db, A.id)).userPublicId);
    await updateProfileOptions({
      user: A,
      env: {},
      db,
      input: input({
        expectedRevision: options.revision,
        enabled: false,
        interests: [],
        featuredPosts: [],
        commentNotificationsEnabled: false,
      }),
    });
    expect((await profileOptions({ user: A, env: {}, db })).enabled).toBe(true);
    expect((await profileOptions({ user: A, env: {}, db })).commentNotificationsEnabled).toBe(false);
  });
  it('omits deleted comments before pagination and retains surviving replies', async () => {
    const p = await published(ROOT);
    const root = await run(createComment, A, input({ postId: p.publicId, body: 'root' }));
    const child = await run(createComment, B, input({ postId: p.publicId, replyTo: root.publicId, body: 'reply' }));
    const withdraw = async (user, comment) => {
      const [[row]] = await db.query('SELECT row_revision FROM community_comments WHERE public_id=?', [
        comment.publicId,
      ]);
      return run(
        withdrawComment,
        user,
        input({ postId: p.publicId, commentId: comment.publicId, expectedRevision: Number(row.row_revision) }),
      );
    };
    await withdraw(A, root);
    expect((await run(listComments, B, { postId: p.publicId })).items).toHaveLength(1);
    expect(
      (await run(listComments, B, { postId: p.publicId, root: root.publicId })).items.map((c) => c.publicId),
    ).toEqual([child.publicId]);
    await withdraw(B, child);
    expect((await run(listComments, B, { postId: p.publicId, root: root.publicId })).items).toHaveLength(0);
    const survivor = await run(createComment, A, input({ postId: p.publicId, body: 'visible' }));
    const page = await run(listComments, B, { postId: p.publicId, limit: 1 });
    expect(page.items.map((c) => c.publicId)).toEqual([survivor.publicId]);
    expect(page.nextCursor).toBeNull();
    await withdraw(A, survivor);
    expect((await run(listComments, B, { postId: p.publicId })).items).toHaveLength(0);
  });
  it('blocked and permanently deleted root authors retain anonymous thread placeholders', async () => {
    const p = await published(ROOT);
    const c = await run(createComment, A, input({ postId: p.publicId, body: 'root' }));
    await run(createComment, B, input({ postId: p.publicId, replyTo: c.publicId, body: 'valid reply' }));
    const identityRow = await identity(db, A.id);
    await run(relation, B, input({ userPublicId: identityRow.userPublicId, action: 'block', enabled: true }));
    let roots = await run(listComments, B, { postId: p.publicId });
    expect(roots.items[0].author).toBeNull();
    expect(roots.items[0].body).toBe('');
    expect(roots.items[0].replyCount).toBe(1);
    await db.query('DELETE FROM user WHERE id=?', [A.id]);
    roots = await run(listComments, B, { postId: p.publicId });
    expect(roots.items).toHaveLength(1);
    expect((await run(listComments, B, { postId: p.publicId, root: c.publicId })).items).toHaveLength(1);
  });
  it('subscription does not notify on post edits; reply + mention + subscription deduplicate', async () => {
    const p = await published();
    const bid = (await identity(db, B.id)).userPublicId;
    await run(postState, B, input({ postId: p.publicId, subscription: 'enabled' }));
    await db.query("UPDATE community_outbox SET status='done'");
    const edit = await run(
      submitPost,
      A,
      postInput({ postId: p.publicId, expectedRevision: p.revision, body: 'updated' }),
    );
    await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: edit.revision, action: 'approve', reason: 'ok' }),
    );
    while (await consumeCommunityEvent({ db, env })) {}
    expect((await db.query('SELECT id FROM notification WHERE user_id=?', [B.id]))[0]).toHaveLength(0);
    const c = await run(createComment, B, input({ postId: p.publicId, body: 'thread' }));
    await run(
      createComment,
      A,
      input({ postId: p.publicId, replyTo: c.publicId, body: 'reply and mention', mentions: [bid] }),
    );
    while (await consumeCommunityEvent({ db, env })) {}
    const [rows] = await db.query('SELECT meta FROM notification WHERE user_id=?', [B.id]);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].meta === 'string' ? JSON.parse(rows[0].meta).kind : rows[0].meta.kind).toBe('reply');
  });
  it('expired worker leases recover once and blocks before dispatch suppress notifications', async () => {
    const p = await published();
    await db.query("UPDATE community_outbox SET status='done'");
    await run(createComment, B, input({ postId: p.publicId, body: 'queued' }));
    await db.query(
      "UPDATE community_outbox SET status='processing',lease_until=DATE_SUB(NOW(6),INTERVAL 1 MINUTE) WHERE kind='comment'",
    );
    await run(relation, B, input({ userPublicId: p.author.userPublicId, action: 'block', enabled: true }));
    await consumeCommunityEvent({ db, env });
    expect((await db.query('SELECT * FROM notification'))[0]).toHaveLength(0);
    expect((await db.query("SELECT status FROM community_outbox WHERE kind='comment'"))[0][0].status).toBe('done');
  });
  it('schema gate detects missing unique keys without modifying the database', async () => {
    await db.query('ALTER TABLE community_posts DROP INDEX uk_public');
    expect(await communityFeedSchemaReady(db)).toBe(false);
    await db.query('ALTER TABLE community_posts ADD UNIQUE KEY uk_public(public_id)');
    expect(await communityFeedSchemaReady(db)).toBe(true);
  });
  it('multi-page feed has no duplicates and the latest-feed index supports the range', async () => {
    const seed = await published(ROOT);
    const [[row]] = await db.query('SELECT * FROM community_posts WHERE public_id=?', [seed.publicId]);
    for (let n = 0; n < 65; n++)
      await db.query(
        "INSERT INTO community_posts(public_id,author_id,status,published_revision_id,published_at) VALUES(?,'root','published',?,DATE_SUB(NOW(6),INTERVAL ? MINUTE))",
        [randomUUID(), row.published_revision_id, n + 1],
      );
    const ids = [];
    let before;
    do {
      const page = await listPosts({ user: B, input: { limit: 15, ...(before ? { before } : {}) }, env, db });
      ids.push(...page.items.map((x) => x.publicId));
      before = page.nextCursor;
    } while (before);
    expect(ids).toHaveLength(66);
    expect(new Set(ids).size).toBe(66);
    const [plan] = await db.query(
      "EXPLAIN SELECT id FROM community_posts WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT 20",
    );
    expect(plan.some((row) => row.key === 'idx_feed')).toBe(true);
  });
  it('pagination preserves microseconds when posts share one millisecond', async () => {
    const seed = await published(ROOT);
    const [[p]] = await db.query('SELECT published_revision_id FROM community_posts WHERE public_id=?', [
      seed.publicId,
    ]);
    for (let i = 1; i <= 5; i++)
      await db.query(
        "INSERT INTO community_posts(public_id,author_id,status,published_revision_id,published_at) VALUES(?,'root','published',?,?)",
        [randomUUID(), p.published_revision_id, `2025-01-01 00:00:00.00000${i}`],
      );
    const all = [];
    let before;
    do {
      const page = await listPosts({ user: B, input: { limit: 2, ...(before ? { before } : {}) }, env, db });
      all.push(...page.items.map((x) => x.publicId));
      before = page.nextCursor;
    } while (before);
    expect(new Set(all).size).toBe(6);
  });
  it('report dismissal is audited and cannot be applied twice', async () => {
    const p = await published();
    const report = await run(reportContent, B, input({ postId: p.publicId, reason: 'other' }));
    await run(dismissReport, ROOT, input({ reportId: report.publicId, reason: '无需处置' }));
    await expect(run(dismissReport, ROOT, input({ reportId: report.publicId, reason: '重复' }))).rejects.toMatchObject({
      code: 'COMMUNITY_REVISION_CONFLICT',
    });
    expect((await results({ user: B, env: {}, db })).items[0].action).toBe('report_dismissed');
  });

  it('mark-all uses a stable snapshot across pages and excludes a later committed row even with an older timestamp', async () => {
    for (let n = 0; n < 270; n++)
      await db.query(
        "INSERT INTO notification(id,user_id,type,is_read,create_time) VALUES(?,'a','system',0,'2020-01-01')",
        [randomUUID()],
      );
    const late = randomUUID();
    let injected = false;
    const wrapped = {
      getConnection: async () => {
        const c = await db.getConnection();
        return {
          query: async (sql, params) => {
            const result = await c.query(sql, params);
            if (sql.startsWith('SELECT id FROM notification') && !injected) {
              injected = true;
              await db.query(
                "INSERT INTO notification(id,user_id,type,is_read,create_time) VALUES(?,'a','system',0,'2019-01-01')",
                [late],
              );
            }
            return result;
          },
          commit: () => c.commit(),
          rollback: () => c.rollback(),
          release: () => c.release(),
        };
      },
    };
    expect(await markNotificationSnapshotRead(wrapped, ['user_id=?', 'is_read=0', "type='system'"], [A.id])).toBe(270);
    expect((await db.query('SELECT is_read FROM notification WHERE id=?', [late]))[0][0].is_read).toBe(0);
  });
  it('permanent deletion clears authored text and private relationships without deleting other members replies', async () => {
    const p = await published(ROOT);
    const c = await run(createComment, A, input({ postId: p.publicId, body: 'personal text' }));
    await run(createComment, B, input({ postId: p.publicId, replyTo: c.publicId, body: 'other member text' }));
    await published(A);
    await purgeCommunityFeedData(db, new Set(COMMUNITY_FEED_TABLES), A.id);
    expect((await db.query('SELECT body FROM community_comments WHERE author_id=?', [A.id]))[0][0].body).toBe('');
    expect((await db.query('SELECT body FROM community_comments WHERE author_id=?', [B.id]))[0][0].body).toBe(
      'other member text',
    );
    expect(
      (
        await db.query(
          'SELECT r.body FROM community_post_revisions r JOIN community_posts p ON p.id=r.post_id WHERE p.author_id=?',
          [A.id],
        )
      )[0].every((row) => row.body === ''),
    ).toBe(true);
  });
  it('a lost commit response remains recoverable with the same request', async () => {
    const body = postInput();
    let firstCommit = true;
    const wrapped = {
      getConnection: async () => {
        const c = await db.getConnection();
        return {
          query: (...args) => c.query(...args),
          beginTransaction: () => c.beginTransaction(),
          commit: async () => {
            await c.commit();
            if (firstCommit) {
              firstCommit = false;
              throw new Error('lost response');
            }
          },
          rollback: () => c.rollback(),
          release: () => c.release(),
        };
      },
    };
    await expect(submitPost({ user: A, input: body, env, db: wrapped })).rejects.toMatchObject({
      code: 'COMMUNITY_RESULT_UNKNOWN',
    });
    const result = await run(submitPost, A, body);
    expect(result.publicId).toBeTruthy();
    expect(
      (await db.query('SELECT COUNT(*) AS total FROM community_posts WHERE author_id=?', [A.id]))[0][0].total,
    ).toBe(1);
  });
  it('community identities remain discoverable after withdrawing their comments', async () => {
    const p = await published(A);
    const c = await run(createComment, B, input({ postId: p.publicId, body: 'public contribution' }));
    expect((await members({ user: A, input: { q: '测试成员b' }, env, db })).items).toHaveLength(1);
    await run(withdrawComment, B, input({ postId: p.publicId, commentId: c.publicId, expectedRevision: 1 }));
    expect((await members({ user: A, input: { q: '测试成员b' }, env, db })).items).toHaveLength(1);
  });
  it('validates upload bytes, reuses receipts and cleans abandoned objects', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ff8AAAAASUVORK5CYII=',
      'base64',
    );
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'community-image-test-'));
    const putObject = vi.fn().mockResolvedValue({});
    const upload = async (id, bytes = png, mimetype = 'image/png') => {
      const filePath = path.join(temp, randomUUID());
      await fs.writeFile(filePath, bytes);
      try {
        return await uploadImage({
          db,
          env,
          user: A,
          input: { requestId: id },
          file: { path: filePath, size: bytes.length, mimetype },
          putObject,
        });
      } finally {
        await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
      }
    };
    try {
      const id = randomUUID();
      const first = await upload(id);
      expect(first).toMatchObject({ publicId: id, width: 1, height: 1 });
      expect(await upload(id)).toEqual(first);
      expect(putObject).toHaveBeenCalledTimes(1);
      await expect(upload(randomUUID(), Buffer.from('fake png'))).rejects.toMatchObject({
        code: 'COMMUNITY_IMAGE_INVALID',
      });
      await expect(upload(randomUUID(), png, 'image/jpeg')).rejects.toMatchObject({ code: 'COMMUNITY_IMAGE_INVALID' });
      await expect(readImage({ db, env, user: B, id })).rejects.toMatchObject({ status: 404 });
      await discardImage({ db, env, user: B, id });
      expect((await db.query('SELECT status FROM community_post_images WHERE public_id=?', [id]))[0][0].status).toBe(
        'ready',
      );
      await discardImage({ db, env, user: A, id });
      // Removed uploads must release quota even before the storage cleanup worker runs.
      for (let n = 0; n < 25; n++) {
        const discarded = await upload(randomUUID());
        await discardImage({ db, env, user: A, id: discarded.publicId });
      }
      const deleteObject = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
      await expect(cleanupImages({ db, deleteObject })).rejects.toThrow('offline');
      await cleanupImages({ db, deleteObject });
      expect((await db.query('SELECT * FROM community_post_images WHERE public_id=?', [id]))[0]).toEqual([]);
      expect(deleteObject).toHaveBeenCalledTimes(27);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
  it('missing image index disables images without disabling the text feed', async () => {
    await db.query('ALTER TABLE community_revision_images DROP INDEX uk_order');
    try {
      expect(await imagesReady(db)).toBe(false);
      expect(await communityFeedSchemaReady(db)).toBe(true);
      await published(ROOT);
    } finally {
      await db.query('ALTER TABLE community_revision_images ADD UNIQUE KEY uk_order(revision_id,sort_order)');
    }
  });
  it('images stay on their reviewed revision and obey post visibility', async () => {
    const seedImage = async (owner) => {
      const id = randomUUID();
      await db.query(
        "INSERT INTO community_post_images (public_id,owner_id,object_key,content_type,content_hash,file_size,width,height,status) VALUES (?,?,?,'image/png',?,100,1,1,'ready')",
        [id, owner, id, 'a'.repeat(64)],
      );
      return id;
    };
    const image1 = await seedImage('a'),
      image2 = await seedImage('a'),
      foreign = await seedImage('b');
    await expect(run(submitPost, A, postInput({ images: [foreign] }))).rejects.toMatchObject({
      code: 'COMMUNITY_IMAGE_UNAVAILABLE',
    });
    const p = await run(submitPost, A, postInput({ images: [image1] }));
    const read = (user, id, revision) =>
      readImage({ user, id, input: { postId: p.publicId, revision }, db, env, sign: () => ({ url: 'test' }) });
    await expect(read(B, image1, 1)).rejects.toMatchObject({ status: 404 });
    expect((await read(ROOT, image1, 1)).public_id).toBe(image1);
    await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: p.revision, action: 'approve', reason: 'approved' }),
    );
    const live = await postDetail({ user: B, id: p.publicId, db, env });
    expect(live.images.map((i) => i.publicId)).toEqual([image1]);
    expect((await read(B, image1, 1)).public_id).toBe(image1);
    const edit = await run(
      submitPost,
      A,
      postInput({ postId: p.publicId, expectedRevision: live.revision, images: [image2] }),
    );
    expect((await postDetail({ user: B, id: p.publicId, db, env })).images.map((i) => i.publicId)).toEqual([image1]);
    await expect(read(B, image2, edit.revision)).rejects.toMatchObject({ status: 404 });
    await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: edit.revision, action: 'approve', reason: 'approved' }),
    );
    await expect(read(B, image1, 1)).rejects.toMatchObject({ status: 404 });
    const updated = await postDetail({ user: B, id: p.publicId, db, env });
    expect(updated.images.map((i) => i.publicId)).toEqual([image2]);
    await run(withdrawPost, A, input({ postId: p.publicId, expectedRevision: updated.revision }));
    await expect(read(B, image2, edit.revision)).rejects.toMatchObject({ status: 404 });
  });
  it('snapshots are owned, immutable and bound to a specific reviewed post revision', async () => {
    await db.query(
      "INSERT INTO note(id,create_by,title,content,type) VALUES('n','a','Original','<p>Original text</p>','html')",
    );
    await expect(run(prepareResource, B, input({ type: 'note', id: 'n' }))).rejects.toMatchObject({
      code: 'COMMUNITY_RESOURCE_UNAVAILABLE',
    });
    const snap = await run(prepareResource, A, input({ type: 'note', id: 'n' }));
    expect(snap).not.toHaveProperty('body');
    expect(snap).not.toHaveProperty('owner_id');
    const read = (user, extra = {}) => readResource({ user, id: snap.publicId, input: extra, db, env });
    await expect(read(B)).rejects.toMatchObject({ code: 'COMMUNITY_RESOURCE_UNAVAILABLE' });
    await db.query("UPDATE note SET title='Changed',content='Changed text',del_flag=1 WHERE id='n'");
    expect((await read(A)).body).toBe('Original text');
    const p = await run(submitPost, A, postInput({ resources: [snap.publicId] }));
    await expect(read(B, { postId: p.publicId, revision: 1 })).rejects.toMatchObject({
      code: 'COMMUNITY_CONTENT_UNAVAILABLE',
    });
    await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: p.revision, action: 'approve', reason: 'OK' }),
    );
    const live = await postDetail({ user: B, id: p.publicId, db, env });
    expect(live.resources[0].title).toBe('Original');
    expect((await read(B, live.resources[0])).body).toBe('Original text');
    await expect(run(submitPost, B, postInput({ resources: [snap.publicId] }))).rejects.toMatchObject({
      code: 'COMMUNITY_RESOURCE_UNAVAILABLE',
    });
    await expect(run(submitPost, A, postInput({ resources: [snap.publicId] }))).rejects.toMatchObject({
      code: 'COMMUNITY_RESOURCE_UNAVAILABLE',
    });
    await discardResource({ user: A, id: snap.publicId, db, env });
    expect((await read(B, live.resources[0])).body).toBe('Original text');
    const edit = await run(
      submitPost,
      A,
      postInput({ postId: p.publicId, expectedRevision: live.revision, resources: [] }),
    );
    expect((await postDetail({ user: B, id: p.publicId, db, env })).resources).toHaveLength(1);
    await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: edit.revision, action: 'approve', reason: 'OK' }),
    );
    await expect(read(B, live.resources[0])).rejects.toMatchObject({ code: 'COMMUNITY_RESOURCE_UNAVAILABLE' });
    expect((await postDetail({ user: B, id: p.publicId, db, env })).resources).toEqual([]);
  });
  it('bookmark snapshot reads respect blocks, withdrawal and community availability', async () => {
    await db.query("INSERT INTO bookmark(id,user_id,name,url) VALUES('b1','a','Docs','https://example.com/')");
    const snap = await run(prepareResource, A, input({ type: 'bookmark', id: 'b1' }));
    const p = await run(submitPost, A, postInput({ resources: [snap.publicId] }));
    await run(
      moderatePost,
      ROOT,
      input({ postId: p.publicId, expectedRevision: p.revision, action: 'approve', reason: 'OK' }),
    );
    const live = await postDetail({ user: B, id: p.publicId, db, env });
    const read = () => readResource({ user: B, id: snap.publicId, input: live.resources[0], db, env });
    await db.query("DELETE FROM bookmark WHERE id='b1'");
    expect((await read()).url).toBe('https://example.com/');
    await db.query("INSERT INTO community_chat_blocks(id,user_id,blocked_user_id) VALUES(UUID(),'b','a')");
    await expect(read()).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
    await db.query('DELETE FROM community_chat_blocks');
    await expect(
      readResource({
        user: B,
        id: snap.publicId,
        input: live.resources[0],
        db,
        env: { ...env, COMMUNITY_FEED_ENABLED: 'false' },
      }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_CLOSED' });
    await run(withdrawPost, A, input({ postId: p.publicId, expectedRevision: live.revision }));
    await expect(read()).rejects.toMatchObject({ code: 'COMMUNITY_CONTENT_UNAVAILABLE' });
  });
  it('expired drafts are cleaned up, prepare retries are idempotent and missing optional schema leaves text available', async () => {
    await db.query("INSERT INTO bookmark(id,user_id,name,url) VALUES('b1','a','Docs','https://example.com/')");
    const payload = input({ type: 'bookmark', id: 'b1' });
    const snap = await run(prepareResource, A, payload);
    expect(await run(prepareResource, A, payload)).toEqual(snap);
    await db.query('UPDATE community_resource_snapshots SET created_at=DATE_SUB(NOW(),INTERVAL 25 HOUR)');
    await cleanupResources({ db });
    expect((await db.query('SELECT * FROM community_resource_snapshots'))[0]).toEqual([]);
    await db.query('ALTER TABLE community_revision_resources DROP INDEX uk_order');
    try {
      expect(await resourcesReady(db)).toBe(false);
      expect(await communityFeedSchemaReady(db)).toBe(true);
    } finally {
      await db.query('ALTER TABLE community_revision_resources ADD UNIQUE KEY uk_order(revision_id,sort_order)');
    }
  });
  it('counts first publication once, uses the approval week and persists adopted answers without self-awards', async () => {
    const draft = await run(submitPost, A, postInput());
    expect(await communityGrowthMetrics(A.id, { db, env })).toEqual({ communityPostCount: 0, communityAnswerCount: 0 });
    await run(
      moderatePost,
      ROOT,
      input({ postId: draft.publicId, expectedRevision: draft.revision, action: 'approve', reason: 'ok' }),
    );
    let post = await postDetail({ user: A, id: draft.publicId, env, db });
    await db.query("UPDATE community_posts SET published_at='2026-09-20 23:30:00' WHERE public_id=?", [post.publicId]);
    const edited = await run(
      submitPost,
      A,
      postInput({ postId: post.publicId, expectedRevision: post.revision, body: '更新正文' }),
    );
    await run(
      moderatePost,
      ROOT,
      input({ postId: post.publicId, expectedRevision: edited.revision, action: 'approve', reason: 'ok' }),
    );
    expect((await communityGrowthMetrics(A.id, { db, env })).communityPostCount).toBe(1);
    expect(await communityWeekPosts(A.id, { db, env, calendar: { shiftMinutes: 0 }, weekKey: '202638' })).toBe(1);
    expect(await communityWeekPosts(A.id, { db, env, calendar: { shiftMinutes: 60 }, weekKey: '202639' })).toBe(1);
    expect(await communityWeekPosts(A.id, { db, env, calendar: { shiftMinutes: 0 }, weekKey: '202639' })).toBe(0);
    const self = await run(createComment, A, input({ postId: post.publicId, body: '自己的回答', mentions: [] }));
    const answer = await run(createComment, B, input({ postId: post.publicId, body: '帮助回答', mentions: [] }));
    const resolve = async (resolved, commentId) => {
      const current = await postDetail({ user: A, id: post.publicId, env, db });
      return run(
        resolveQuestion,
        A,
        input({
          postId: post.publicId,
          expectedRevision: current.revision,
          resolved,
          ...(commentId ? { commentId } : {}),
        }),
      );
    };
    await resolve(true, self.publicId);
    expect((await communityGrowthMetrics(A.id, { db, env })).communityAnswerCount).toBe(0);
    await resolve(true, answer.publicId);
    await resolve(false);
    await resolve(true, answer.publicId);
    expect((await communityGrowthMetrics(B.id, { db, env })).communityAnswerCount).toBe(1);
    while (await consumeCommunityEvent({ db, env })) {}
    const [achievements] = await db.query(
      'SELECT user_id,achievement_key,reward_points_snapshot FROM user_achievements ORDER BY user_id',
    );
    expect(achievements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: 'a', achievement_key: 'community_post_1', reward_points_snapshot: 20 }),
        expect.objectContaining({ user_id: 'b', achievement_key: 'community_answer_1', reward_points_snapshot: 30 }),
      ]),
    );
    const current = await postDetail({ user: A, id: post.publicId, env, db });
    await run(withdrawPost, A, input({ postId: post.publicId, expectedRevision: current.revision }));
    expect((await communityGrowthMetrics(A.id, { db, env })).communityPostCount).toBe(1);
    expect(await communityGrowthMetrics(A.id, { db, env: {} })).toEqual({
      communityPostCount: 0,
      communityAnswerCount: 0,
    });
  });

  it('provides the replied-to comment for navigation and hides root self-publication results', async () => {
    const post = await published();
    const parent = await run(createComment, A, input({ postId: post.publicId, body: '原评论' }));
    const reply = await run(createComment, B, input({ postId: post.publicId, replyTo: parent.publicId, body: '回复' }));
    const own = await ownComments({ user: B, env, db });
    expect(own.items.find((row) => row.publicId === reply.publicId).replyTo).toBe(parent.publicId);
    await run(submitPost, ROOT, postInput());
    expect((await results({ user: ROOT, env, db })).items).toHaveLength(0);
    const record = (await results({ user: A, env, db })).items[0];
    expect(record.title).toBe('怎样整理资料？');
    expect(record.action).toBe('approve');
  });
});
