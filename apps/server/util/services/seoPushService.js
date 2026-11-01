import { formatDateTime } from '../dateTime.js';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import {
  getStaticSitemapUrls,
  HELP_CENTER_PATH,
  helpArticleUrl,
  loadSitemapEntries,
  SEO_SITE_ORIGIN,
} from '../seoSitemap.js';

/**
 * 搜索引擎主动提交：把站点地图里新增或更新的地址推给百度普通收录与 IndexNow（Bing 等）。
 *
 * - 只在生产运行时启动；每个引擎每个自然日最多跑一轮，推送记录存 config_json，不另建表。
 * - 百度按每日额度推送：先推一条读出剩余额度，再按额度补推。令牌只来自 BAIDU_PUSH_TOKEN，不写日志。
 * - IndexNow 密钥按协议公开在站点根目录（apps/web/public/<key>.txt），不是凭据。
 * - 百度记录已受理版本；IndexNow 首次建立当前版本快照，之后只通知真实新增、更新或删除。
 * - IndexNow 密钥待验证或请求失败保留原快照，下一自然日重试，不密集轮询。
 */

export const SEO_PUSH_STATE_CONFIG_NAME = 'seo_push_state';
export const INDEXNOW_KEY = '7c6e1769c2dbd6bb64265b0dd7f12659';

const BAIDU_PUSH_ENDPOINT = 'http://data.zz.baidu.com/urls';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow';
const INDEXNOW_MAX_URLS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
const START_DELAY_MS = 10 * 60_000;
const CHECK_INTERVAL_MS = 60 * 60_000;
const STATIC_SEO_URLS = new Set(getStaticSitemapUrls(SEO_SITE_ORIGIN, HELP_CENTER_PATH).map(({ loc }) => loc));

/** 启用的引擎：SEO_PUSH_ENABLED=false 全部停用；百度另需配置推送令牌。 */
export function seoPushEngines(env = process.env) {
  if (
    String(env.SEO_PUSH_ENABLED ?? '')
      .trim()
      .toLowerCase() === 'false'
  )
    return [];
  return String(env.BAIDU_PUSH_TOKEN || '').trim() ? ['baidu', 'indexnow'] : ['indexnow'];
}

/** 从没提交过的地址优先，其次是提交后又更新过的；同组内保持站点地图顺序。 */
export function selectPendingEntries(entries, pushed = {}) {
  const fresh = [];
  const changed = [];
  for (const entry of entries) {
    const previous = pushed[entry.loc];
    if (previous === entry.version) continue;
    (previous ? changed : fresh).push(entry);
  }
  return [...fresh, ...changed];
}

function seoPushErrorCode(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'SEO_PUSH_TIMEOUT';
  return 'SEO_PUSH_REQUEST_FAILED';
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postBaidu(urls, { token, fetcher }) {
  const endpoint = `${BAIDU_PUSH_ENDPOINT}?site=${encodeURIComponent(SEO_SITE_ORIGIN)}&token=${encodeURIComponent(token)}`;
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: urls.join('\n'),
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await readJson(response);
  if (!response.ok || !body || body.error) {
    if (/quota/i.test(String(body?.message || ''))) return { error: 'BAIDU_PUSH_OVER_QUOTA' };
    return { error: `BAIDU_PUSH_HTTP_${Number(body?.error) || response.status}` };
  }
  const rejectedLists = [body.not_same_site, body.not_valid];
  if (
    !Number.isInteger(body.success) ||
    body.success < 0 ||
    !Number.isInteger(body.remain) ||
    body.remain < 0 ||
    rejectedLists.some((list) => list !== undefined && !Array.isArray(list))
  )
    return { error: 'BAIDU_PUSH_INVALID_RESPONSE' };
  const rejectedUrls = rejectedLists.flatMap((list) => list || []);
  const rejected = new Set(rejectedUrls);
  const requested = new Set(urls);
  const accepted = urls.filter((url) => !rejected.has(url));
  if (
    rejected.size !== rejectedUrls.length ||
    rejectedUrls.some((url) => typeof url !== 'string' || !requested.has(url)) ||
    body.success !== accepted.length
  )
    return { error: 'BAIDU_PUSH_INVALID_RESPONSE' };
  return {
    accepted,
    rejected: urls.filter((url) => rejected.has(url)),
    remain: body.remain,
  };
}

/** 百度普通收录 API：额度按天且不可累计，先用一条探出剩余额度，避免整批超额被拒。 */
export async function pushToBaidu(urls, { token, fetcher = fetch } = {}) {
  if (!urls.length) return { accepted: [], rejected: [] };
  const first = await postBaidu(urls.slice(0, 1), { token, fetcher });
  if (first.error) return { accepted: [], rejected: [], error: first.error };
  const rest = urls.slice(1, 1 + Math.max(0, first.remain));
  if (!rest.length) return first;
  let second;
  try {
    second = await postBaidu(rest, { token, fetcher });
  } catch (error) {
    return { accepted: first.accepted, rejected: first.rejected, remain: 0, error: seoPushErrorCode(error) };
  }
  if (second.error) return { accepted: first.accepted, rejected: first.rejected, remain: 0, error: second.error };
  return {
    accepted: [...first.accepted, ...second.accepted],
    rejected: [...first.rejected, ...second.rejected],
    remain: second.remain,
  };
}

/** IndexNow：200 确认受理；202 密钥仍待校验，保留变更供下一自然日重试。 */
export async function pushToIndexNow(urls, { fetcher = fetch } = {}) {
  if (!urls.length) return { accepted: [], rejected: [] };
  const batch = urls.slice(0, INDEXNOW_MAX_URLS);
  const response = await fetcher(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(SEO_SITE_ORIGIN).host,
      key: INDEXNOW_KEY,
      keyLocation: `${SEO_SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList: batch,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 202) {
    return { accepted: [], rejected: [], error: 'INDEXNOW_KEY_VALIDATION_PENDING' };
  }
  if (response.status !== 200) {
    return { accepted: [], rejected: [], error: `INDEXNOW_HTTP_${response.status}` };
  }
  return { accepted: batch, rejected: [] };
}

/** 损坏记录只丢弃对应部分；IndexNow 缺少有效基线时安全重建历史快照。 */
export function parseSeoPushState(rawContent) {
  let parsed = null;
  try {
    parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
  } catch {
    parsed = null;
  }
  const engines = {};
  const records = parsed?.engines;
  if (!records || typeof records !== 'object' || Array.isArray(records)) return { engines };
  for (const [name, value] of Object.entries(records)) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !value.pushed ||
      typeof value.pushed !== 'object' ||
      Array.isArray(value.pushed)
    )
      continue;
    const pushed = Object.entries(value.pushed).filter(([, version]) => typeof version === 'string');
    engines[name] = {
      lastRunDate: typeof value.lastRunDate === 'string' ? value.lastRunDate : '',
      pushed: Object.fromEntries(pushed),
    };
  }
  return { engines };
}

async function loadSeoPushState(db) {
  const [rows] = await db.query('SELECT json_content FROM config_json WHERE name = ? AND del_flag = 0 LIMIT 1', [
    SEO_PUSH_STATE_CONFIG_NAME,
  ]);
  return parseSeoPushState(rows[0]?.json_content);
}

async function saveSeoPushState(db, state) {
  await db.query(
    `INSERT INTO config_json (name, json_content, del_flag) VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE json_content = VALUES(json_content), del_flag = 0`,
    [SEO_PUSH_STATE_CONFIG_NAME, JSON.stringify(state)],
  );
}

function isOwnedSeoUrl(value) {
  if (STATIC_SEO_URLS.has(value)) return true;
  try {
    const url = new URL(value);
    if (url.origin !== SEO_SITE_ORIGIN || url.username || url.password || url.search || url.hash || url.href !== value)
      return false;
    const prefix = `${HELP_CENTER_PATH}/`;
    if (!url.pathname.startsWith(prefix)) return false;
    const id = decodeURIComponent(url.pathname.slice(prefix.length));
    // 只接收由公共文章地址构造器生成的单层路径，拒绝解码后再次引入分隔符或控制字符。
    return !!id && !/[\/\\?#%\u0000-\u001f\u007f]/u.test(id) && helpArticleUrl(id) === value;
  } catch {
    return false;
  }
}

/** 执行一轮：今天已跑过的引擎跳过；返回每个引擎的低敏摘要。 */
export async function runSeoPush({ db, env = process.env, fetcher = fetch, now = new Date() } = {}) {
  const engines = seoPushEngines(env);
  if (!engines.length) return [];
  const today = formatDateTime(now).slice(0, 10);
  const state = await loadSeoPushState(db);
  const due = engines.filter((engine) => state.engines[engine]?.lastRunDate !== today);
  if (!due.length) return [];

  const entries = await loadSitemapEntries(db);
  const live = new Set(entries.map((entry) => entry.loc));
  const results = [];
  for (const engine of due) {
    // IndexNow 用来通知发生的变更，首次启用只建立历史基线，避免把所有旧 URL 当成新增。
    // 旧版已保存的引擎记录继续作为快照使用，无需迁移或重新推送全站。
    const initializeIndexNow = engine === 'indexnow' && !state.engines.indexnow;
    const previous = state.engines[engine]?.pushed || {};
    const pushed = Object.fromEntries(
      Object.entries(previous).filter(([loc]) => engine === 'indexnow' || live.has(loc)),
    );
    if (initializeIndexNow) {
      for (const entry of entries) pushed[entry.loc] = entry.version;
    }
    const removed =
      engine === 'indexnow'
        ? Object.keys(pushed)
            .filter((loc) => !live.has(loc) && isOwnedSeoUrl(loc))
            .map((loc) => ({ loc, removed: true }))
        : [];
    const pending = initializeIndexNow ? [] : [...selectPendingEntries(entries, pushed), ...removed];
    let outcome = { accepted: [], rejected: [] };
    if (pending.length) {
      const urls = pending.map((entry) => entry.loc);
      try {
        outcome =
          engine === 'baidu'
            ? await pushToBaidu(urls, { token: String(env.BAIDU_PUSH_TOKEN).trim(), fetcher })
            : await pushToIndexNow(urls, { fetcher });
      } catch (error) {
        outcome = { accepted: [], rejected: [], error: seoPushErrorCode(error) };
      }
    }
    // 被判定无效的地址同样记下版本，避免每天重复消耗额度；文章更新后会再次提交。
    const versionByLoc = new Map(pending.map((entry) => [entry.loc, entry.version]));
    for (const loc of [...outcome.accepted, ...outcome.rejected]) {
      if (live.has(loc)) pushed[loc] = versionByLoc.get(loc);
      else delete pushed[loc];
    }
    // 手工损坏、非公开路径或非规范 URL 不能作为删除通知外发，也不永久留在快照里。
    for (const loc of Object.keys(pushed)) {
      if (!live.has(loc) && !isOwnedSeoUrl(loc)) delete pushed[loc];
    }
    state.engines[engine] = { lastRunDate: today, pushed };
    results.push({
      engine,
      pending: pending.length,
      accepted: outcome.accepted.length,
      rejected: outcome.rejected.length,
      remain: outcome.remain ?? null,
      error: outcome.error || null,
    });
  }
  await saveSeoPushState(db, state);
  return results;
}

let schedulerStarted = false;

/** 生产运行时每小时检查一次，跨过自然日后各引擎再跑一轮；重启不会在同一天重复提交。 */
export function startSeoPushScheduler({ db, env = process.env } = {}) {
  if (schedulerStarted || !db || !notificationSchedulerEnabled(env) || !seoPushEngines(env).length) return false;
  schedulerStarted = true;
  let running = null;
  const tick = () => {
    if (running) return;
    running = runSeoPush({ db, env })
      .then((results) => {
        for (const result of results) {
          console.log(
            '[seo-push] engine=%s pending=%d accepted=%d rejected=%d remain=%s error=%s',
            result.engine,
            result.pending,
            result.accepted,
            result.rejected,
            result.remain ?? '-',
            result.error || '-',
          );
        }
      })
      .catch((error) => console.error('[seo-push] 推送失败 code=%s', seoPushErrorCode(error)))
      .finally(() => {
        running = null;
      });
  };
  const initial = setTimeout(tick, START_DELAY_MS);
  initial.unref?.();
  const interval = setInterval(tick, CHECK_INTERVAL_MS);
  interval.unref?.();
  return true;
}
