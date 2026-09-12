import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import mysql from 'mysql2/promise';
import express from 'express';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

// Opt-in evidence runner: a fresh local Socket database, synthetic rows only, real handlers and SQL.
// No application .env, workers, authentication sessions, OBS calls or production writes.
const state = vi.hoisted(() => ({ db: null, queries: [], fault: null, context: null }));
vi.mock('../db/index.js', () => ({
  default: {
    query(sql, params) {
      const call = { sql, params, context: state.context?.getStore() };
      state.queries.push(call);
      if (state.fault?.(sql))
        return Promise.reject(Object.assign(new Error('fixture failure'), { code: 'FIXTURE_FAILURE' }));
      return state.db.query(sql, params);
    },
    getConnection: () => state.db.getConnection(),
  },
}));
vi.mock('../util/obsClient.js', () => ({
  default: {},
  bucketBaseUrl: 'https://fixture.invalid',
  buildObjectKey: (owner, name) => `files/${owner}/${name}`,
  buildObjectUrl: (key) => `https://fixture.invalid/${key}`,
  createDownloadSignedUrl: ({ objectKey }) => ({ url: `https://fixture.invalid/signed/${objectKey}` }),
  createUploadSignedUrl: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  copyObjectInObs: vi.fn(),
  putObjectToObs: vi.fn(),
  getObjectMetadataFromObs: vi.fn(),
}));

const socket = process.env.API_PERF_MYSQL_SOCKET;
const schemaFile = process.env.API_PERF_SCHEMA_FILE;
const baseline = process.env.API_PERF_BASELINE;
const output = process.env.API_PERF_OUTPUT;
const enabled = Boolean(socket && schemaFile && baseline && output);

describe.skipIf(!enabled)('接口优化真实 MySQL / HTTP 前后对照（显式本地 Socket）', () => {
  const schema = 'api_perf_' + randomUUID().replaceAll('-', '');
  let admin,
    server,
    origin,
    created = false;
  const results = { environment: {}, equalityCases: 0, benchmarks: [], querySamples: {} };
  const paths = [
    '/file/queryFolder',
    '/bookmark/getTagSpace',
    '/bookmark/getBookmarkList',
    '/file/queryFiles',
    '/notification/list',
  ];
  async function insert(table, rows) {
    if (!rows.length) return;
    const columns = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500);
      await admin.query(`INSERT INTO \`${table}\` (${columns.map((x) => '`' + x + '`').join(',')}) VALUES ?`, [
        part.map((row) => columns.map((c) => row[c] ?? null)),
      ]);
    }
  }
  beforeAll(async () => {
    if (!socket.startsWith('/tmp/') && !socket.startsWith('/private/tmp/'))
      throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    results.environment.database = (await admin.query('SELECT VERSION() AS v'))[0][0].v;
    results.environment.connectionLimit = 10;
    results.environment.externalServices =
      'OBS signing stubbed; authentication identity fixture; actual read handlers, real SQL, HTTP and serialization';
    await admin.query('CREATE DATABASE ' + schema);
    created = true;
    await admin.query('USE ' + schema);
    await admin.query('SET FOREIGN_KEY_CHECKS=0');
    for (const ddl of Object.values(JSON.parse(readFileSync(schemaFile, 'utf8')))) await admin.query(ddl);
    state.db = mysql.createPool({
      socketPath: socket,
      user: 'root',
      database: schema,
      connectionLimit: 10,
      charset: 'utf8mb4',
    });
    // Disable MySQL 8 predicate pushdown so it does not hide the old SQL cost; this is not a full 5.7 emulation.
    state.db.on('connection', (c) => c.query("SET SESSION optimizer_switch='derived_condition_pushdown=off'"));
    state.context = new AsyncLocalStorage();
    const now = '2026-09-01 12:00:00';
    const folders = [],
      files = [],
      bookmarks = [],
      tags = [],
      rels = [],
      snapshots = [],
      inbox = [],
      notifications = [],
      todos = [];
    for (const [owner, roots, children, fileCount, bookmarkCount, tagCount, noticeCount] of [
      ['small', 2, 2, 40, 40, 8, 60],
      ['large', 30, 25, 10000, 10000, 600, 12000],
      ['other', 1, 1, 4, 4, 2, 5],
    ]) {
      const ids = [];
      for (let r = 0; r < roots; r++) {
        const id = folders.length + 1;
        ids.push(id);
        folders.push({
          id,
          create_by: owner,
          name: `目录 ${r}`,
          parent_id: null,
          del_flag: 0,
          sort: r,
          create_time: now,
        });
        for (let c = 0; c < children; c++)
          folders.push({
            id: folders.length + 1,
            create_by: owner,
            name: `子目录 ${c}`,
            parent_id: id,
            del_flag: 0,
            sort: c,
            create_time: now,
          });
      }
      for (let i = 0; i < tagCount; i++)
        tags.push({
          id: `${owner}-tag-${i}`,
          user_id: owner,
          name: `标签 ${owner} ${i}`,
          del_flag: i === tagCount - 1 ? 1 : 0,
          sort: i,
          create_time: now,
        });
      for (let i = 0; i < fileCount; i++) {
        const id = files.length + 1;
        files.push({
          id,
          create_by: owner,
          file_name: `文件 ${i}.${i % 2 ? 'png' : 'pdf'}`,
          file_type: i % 2 ? 'image/png' : 'application/pdf',
          file_size: 1024 + i,
          directory: 'https://fixture.invalid/',
          obs_key: `${owner}/object-${i}`,
          folder_id: i % 10 === 0 ? null : ids[i % roots],
          del_flag: i % 17 === 0 ? 1 : 0,
          create_time: now,
        });
        rels.push({
          tag_id: `${owner}-tag-${i % tagCount}`,
          resource_type: 'file',
          resource_id: String(id),
          user_id: owner,
        });
        if (i % 3 === 0)
          inbox.push({
            id: `${owner}-fi-${i}`,
            user_id: owner,
            resource_type: 'file',
            resource_id: String(id),
            status: 'pending',
          });
      }
      for (let i = 0; i < bookmarkCount; i++) {
        const id = `${owner}-bookmark-${i}`;
        bookmarks.push({
          id,
          name: `书签 ${i}`,
          user_id: owner,
          url: `https://example.invalid/${i}`,
          description: i % 3 ? '说明' : '',
          sort: i,
          is_top: i % 23 === 0 ? 1 : 0,
          del_flag: i % 17 === 0 ? 1 : 0,
          create_time: now,
        });
        for (const t of new Set([i % tagCount, (i + 1) % tagCount, (i + 3) % tagCount]))
          rels.push({ tag_id: `${owner}-tag-${t}`, resource_type: 'bookmark', resource_id: id, user_id: owner });
        snapshots.push({
          bookmark_id: id,
          user_id: owner,
          content: i % 2 ? '归档正文' : '',
          summary: i % 3 ? '摘要' : null,
        });
        if (i % 3 === 0)
          inbox.push({
            id: `${owner}-bi-${i}`,
            user_id: owner,
            resource_type: 'bookmark',
            resource_id: id,
            status: 'pending',
          });
      }
      for (let i = 0; i < 8; i++)
        todos.push({
          id: `${owner}-todo-${i}`,
          user_id: owner,
          title: `任务 ${i}`,
          status: i % 2 ? 'completed' : 'pending',
          del_flag: i === 7 ? 1 : 0,
        });
      for (let i = 0; i < noticeCount; i++) {
        const type = ['todo_reminder', 'system', 'community_chat', 'level_up', 'daily_brief', 'other'][i % 6];
        notifications.push({
          id: `${owner}-notice-${String(i).padStart(5, '0')}`,
          user_id: owner,
          type,
          title: `通知 ${i}`,
          content: '测试通知',
          link: '/inbox',
          meta: JSON.stringify(
            type === 'todo_reminder' ? { todoId: `${owner}-todo-${i % 8}` } : { kind: i % 4 ? 'mention' : 'message' },
          ),
          is_read: i % 3 === 0 ? 1 : 0,
          del_flag: i % 17 === 0 ? 1 : 0,
          create_time: now,
        });
      }
    }
    await insert('folders', folders);
    await insert('files', files);
    await insert('bookmark', bookmarks);
    await insert('tag', tags);
    await insert('resource_tag_relations', rels);
    await insert('bookmark_snapshot', snapshots);
    await insert('resource_inbox', inbox);
    await insert('todo_items', todos);
    await insert('notification', notifications);
    await insert('note', [
      { id: 'large-note', title: '测试笔记', create_by: 'large', content: '正文', del_flag: 0, create_time: now },
    ]);
    await insert('resource_tag_relations', [
      { tag_id: 'large-tag-1', resource_type: 'note', resource_id: 'large-note', user_id: 'large' },
      { tag_id: 'large-tag-1', resource_type: 'note', resource_id: 'missing-note', user_id: 'large' },
      { tag_id: 'large-tag-1', resource_type: 'bookmark', resource_id: 'other-bookmark-1', user_id: 'large' },
    ]);
    await insert('todo_tag_relations', [
      { user_id: 'large', target_type: 'todo', target_id: 'large-todo-0', tag_id: 'large-tag-1' },
      { user_id: 'large', target_type: 'todo', target_id: 'large-todo-1', tag_id: 'large-tag-1' },
      { user_id: 'large', target_type: 'todo', target_id: 'large-todo-7', tag_id: 'large-tag-1' },
    ]);
    // Same parent/folder IDs owned by another account must not inflate counts.
    await insert('folders', [
      { id: 99999, create_by: 'other', name: '跨账号子级', parent_id: 7, del_flag: 0, sort: 0 },
    ]);
    await insert('files', [
      {
        id: 99999,
        create_by: 'other',
        file_name: '跨账号文件.pdf',
        file_type: 'application/pdf',
        file_size: 1,
        directory: '/',
        folder_id: 7,
        del_flag: 0,
      },
    ]);
    const assets = [],
      artifacts = [];
    for (const owner of ['small', 'large']) {
      for (const [i, file] of files
        .filter((f) => f.create_by === owner && f.file_type === 'image/png' && f.del_flag === 0)
        .slice(0, 4)
        .entries()) {
        const id = assets.length + 1;
        const version = '1'.repeat(64);
        assets.push({
          id,
          owner_user_id: owner,
          source_type: 'cloud_file',
          source_id: String(file.id),
          identity_hash: createHash('sha256').update(`${owner}:obs:${file.obs_key}`).digest('hex'),
          storage_kind: 'obs',
          source_locator: file.obs_key,
          source_version: version,
          status: 'active',
        });
        artifacts.push({
          id,
          file_id: id,
          owner_user_id: owner,
          source_type: 'image_asset',
          strategy: 'image_thumbnail',
          strategy_version: 1,
          format_id: 'png',
          source_etag: 'fixture',
          source_size: file.file_size,
          source_revision: version,
          status: ['ready', 'queued', 'processing', 'failed'][i],
          artifact_object_key: i === 0 ? `preview/${owner}/${id}` : null,
          error_code: i === 3 ? 'IMAGE_DECODE_FAILED' : null,
        });
      }
    }
    await insert('image_assets', assets);
    await insert('file_preview_artifacts', artifacts);
    results.environment.syntheticRows = {
      folders: folders.length + 1,
      files: files.length + 1,
      bookmarks: bookmarks.length,
      tags: tags.length,
      relations: rels.length + 3,
      notifications: notifications.length,
    };
    await import('../util/common.js');
    const current = [
      await import('./fileHandle.js'),
      await import('./tagSpaceHandle.js'),
      await import('./bookmarkHandle.js'),
      await import('../router/file.js'),
      await import('./notificationHandle.js'),
    ];
    const previous = await Promise.all(
      [
        'router_handle/fileHandle.js',
        'router_handle/tagSpaceHandle.js',
        'router_handle/bookmarkHandle.js',
        'router/file.js',
        'router_handle/notificationHandle.js',
      ].map((p) => import(`${baseline}/${p}`)),
    );
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-fixture-owner'] || 'large', role: req.headers['x-fixture-role'] || 'user' };
      if (req.headers['x-fixture-subject']) {
        req.resourceUser = { id: req.headers['x-fixture-subject'], role: 'user' };
        req.adminContext = { mode: 'readonly' };
      }
      return state.context.run({ variant: req.path.split('/')[1], path: req.path.split('/').slice(2).join('/') }, next);
    });
    for (const [variant, modules] of [
      ['before', previous],
      ['after', current],
    ]) {
      const [file, tag, bookmark, router, notification] = modules;
      app.post(`/${variant}/file/queryFolder`, file.queryFolder);
      app.post(`/${variant}/bookmark/getTagSpace`, tag.getTagSpace);
      app.post(`/${variant}/bookmark/getBookmarkList`, bookmark.getBookmarkList);
      app.use(`/${variant}/file`, router.default);
      app.post(`/${variant}/notification/list`, notification.list);
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    origin = `http://127.0.0.1:${server.address().port}`;
  }, 120000);
  afterAll(async () => {
    if (output) writeFileSync(output, JSON.stringify(results, null, 2));
    await new Promise((r) => (server ? server.close(r) : r()));
    await state.db?.end();
    if (created) await admin.query('DROP DATABASE ' + schema);
    await admin?.end();
  }, 30000);
  async function call(variant, path, body = {}, owner = 'large', headers = {}) {
    const response = await fetch(origin + '/' + variant + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-fixture-owner': owner, ...headers },
      body: JSON.stringify(body),
    });
    return { httpStatus: response.status, body: await response.json() };
  }
  async function same(path, body = {}, owner = 'large', headers = {}) {
    const a = await call('before', path, body, owner, headers),
      b = await call('after', path, body, owner, headers);
    expect(b).toEqual(a);
    results.equalityCases++;
    return b.body;
  }
  it('完整 HTTP 响应：新旧协议、筛选、分页、空账号、跨账号关系和错误状态', async () => {
    for (const owner of ['small', 'large', 'empty']) {
      for (const body of [
        {},
        { treeVersion: 2 },
        { treeVersion: 2, filters: { name: '子目录 1' } },
        { treeVersion: 2, filters: { name: '不存在' } },
      ])
        await same(paths[0], body, owner);
      for (const body of [
        { id: `${owner}-tag-1` },
        { id: 'missing' },
        { id: 'other-tag-0' },
        { id: `${owner}-tag-1`, relatedLimit: 2 },
      ])
        await same(paths[1], body, owner);
      for (const body of [
        { pageSize: 10 },
        { pageSize: 10, currentPage: 2 },
        { pageSize: 10, currentPage: 99999 },
        { pageSize: 10, filters: { type: 'normal', tagId: `${owner}-tag-1` } },
        { pageSize: 10, filters: { type: 'search', value: '书签 1' } },
      ])
        await same(paths[2], body, owner);
      for (const body of [
        { pageSize: 10 },
        { pageSize: 10, currentPage: 2 },
        { pageSize: 10, currentPage: 99999 },
        { pageSize: 10, filters: { category: ['image'] } },
        { pageSize: 10, filters: { fileName: '文件 1' } },
        { pageSize: 10, filters: { tagId: `${owner}-tag-1` } },
      ])
        await same(paths[3], body, owner);
      for (const body of [
        {},
        { currentPage: 2, pageSize: 7 },
        { currentPage: 99999 },
        { type: 'growth' },
        { type: 'ai_routine' },
        { type: 'system_group' },
        { excludeCommunityChat: true },
        { notificationId: `${owner}-notice-00018`, pageSize: 7 },
        { notificationId: 'other-notice-00001' },
      ])
        await same(paths[4], body, owner);
    }
    await same(paths[2], {}, 'small');
    await same(paths[3], {}, 'small');
    await same(paths[1], { id: 'small-tag-1' }, 'large', { 'x-fixture-subject': 'small' });
    await same(paths[4], {}, 'large', { 'x-fixture-role': 'visitor' });
    const listing = await same(paths[0], { treeVersion: 2 }, 'large');
    expect(listing.status).toBe(200);
    expect((await same(paths[1], { id: 'large-tag-1' })).data.tag.counts.note).toBe(1);
    state.queries = [];
  }, 120000);
  it('写后立即读取、事务回滚与通知定位快照不变', async () => {
    await admin.beginTransaction();
    await admin.query("UPDATE bookmark SET del_flag=1 WHERE id='large-bookmark-1'");
    await admin.rollback();
    await same(paths[2], { pageSize: 10, filters: { type: 'normal', tagId: 'large-tag-1' } });
    await admin.query("UPDATE resource_inbox SET status='completed' WHERE id='small-bi-3'");
    expect(
      (await same(paths[2], { pageSize: 10 }, 'small')).data.items.find((x) => x.id === 'small-bookmark-3').isPending,
    ).toBe(false);
    await admin.query("UPDATE notification SET is_read=1 WHERE user_id='small'");
    expect((await same(paths[4], {}, 'small')).data.unreadTotal).toBe(0);
    await admin.query('UPDATE files SET del_flag=1 WHERE id=42');
    await same(paths[0], { treeVersion: 2 });
    await same(paths[3], { pageSize: 10 });
  }, 30000);
  it('辅助查询失败降级、预览失败和主查询失败的返回契约', async () => {
    for (const [path, match, status] of [
      [paths[2], 'FROM bookmark_snapshot', 200],
      [paths[2], 'FROM resource_inbox', 200],
      [paths[3], 'FROM resource_inbox', 200],
      [paths[3], 'FROM image_assets', 500],
      [paths[4], 'SELECT COUNT(*) AS total', 500],
    ]) {
      state.fault = (sql) => sql.includes(match);
      try {
        expect((await same(path, { pageSize: 10 })).status).toBe(status);
      } finally {
        state.fault = null;
      }
    }
    state.queries = [];
  }, 30000);
  it('交替预热与采样：真实 HTTP p50/p95、1/4/10 并发、相同 10 连接池', async () => {
    const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
    const n = Number(process.env.API_PERF_SAMPLES || 30);
    for (const owner of ['small', 'large'])
      for (let index = 0; index < paths.length; index++) {
        const path = paths[index],
          body =
            index === 0
              ? { treeVersion: 2 }
              : index === 1
                ? { id: `${owner}-tag-1` }
                : index === 4
                  ? { pageSize: 20 }
                  : { pageSize: 48 };
        const expected = await same(path, body, owner);
        expect(expected.status).toBe(200);
        for (let i = 0; i < 5; i++) {
          await call('before', path, body, owner);
          await call('after', path, body, owner);
        }
        for (const concurrency of [1, 4, 10]) {
          const timings = { before: [], after: [] },
            counts = { before: [], after: [] };
          for (let round = 0; round < Math.ceil(n / concurrency); round++)
            for (const variant of round % 2 ? ['after', 'before'] : ['before', 'after']) {
              state.queries = [];
              await Promise.all(
                Array.from({ length: concurrency }, async () => {
                  const started = performance.now();
                  const r = await call(variant, path, body, owner);
                  const elapsed = performance.now() - started;
                  expect(r.body).toEqual(expected);
                  timings[variant].push(elapsed);
                }),
              );
              counts[variant].push(state.queries.length / concurrency);
              if (owner === 'large' && concurrency === 1 && !results.querySamples[path + ' ' + variant])
                results.querySamples[path + ' ' + variant] = state.queries.map(({ sql, params }) => ({ sql, params }));
            }
          const stats = Object.fromEntries(
            Object.entries(timings).map(([k, v]) => [
              k,
              {
                samples: v.length,
                p50Ms: percentile(v, 0.5),
                p95Ms: percentile(v, 0.95),
                queriesPerRequest: counts[k][0],
              },
            ]),
          );
          const row = {
            path,
            owner,
            concurrency,
            ...stats,
            p50ReductionPercent: 100 * (1 - stats.after.p50Ms / stats.before.p50Ms),
            p95ReductionPercent: 100 * (1 - stats.after.p95Ms / stats.before.p95Ms),
          };
          results.benchmarks.push(row);
          console.log('BENCH', JSON.stringify(row));
        }
      }
  }, 240000);
});
