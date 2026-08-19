import { resultData, snakeCaseKeys, insertData, generateUUID, INTERNAL_ROLES } from '../util/common.js';
import { isLocalIp } from '../util/ipFilter.js';
import { isSelfTraffic, listLogExclude, addLogExclude, removeLogExclude } from '../util/logExclude.js';
import fsP from 'fs/promises';
import path from 'path';
import pool from '../db/index.js';
import { validateQueryParams } from '../util/request.js';
import { recordConversionEvent, normalizeConversionSource } from '../util/conversion.js';
import { buildOperationLogSystem } from '../util/apiLogSystem.js';
import { getDeepSeekBalance as queryDeepSeekBalance } from '../util/agent/providerBalance.js';
import { getDeepSeekDailyBalanceChange } from '../util/agent/providerBalanceSnapshot.js';
import { collectUsedImageNames } from '../util/noteImages.js';
import { deleteNoteImageThumbnail } from '../util/noteImageThumbnail.js';
import { resolveKnowledgeSourceTarget } from '../util/agent/sourceUtils.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { processBookmarkIcons, isBookmarkIconCheckRecent } from '../util/bookmarkIconService.js';
import { normalizeApiLogSystem } from '../util/apiLogSystem.js';
import {
  adminCursorScope,
  adminCursorTime,
  decodeAdminListCursor,
  encodeAdminListCursor,
  isAdminCursorRequest,
  normalizeAdminListLimit,
} from '../util/adminListCursor.js';
import { adminActionErrorResponse, beginAdminAction, finishAdminAction } from '../util/adminActionExecution.js';

// 记录游客转化事件(前端 CTA 点击等);允许游客调用,白名单事件防滥用
export const recordConversion = (req, res) => {
  // v1.1:新增 demo_enter/signup_open/signup_submit;cta_click 仅兼容旧客户端(新代码不再写入);
  // register/first_own_resource/signup_failed 仅后端记录,不接受客户端上报(防伪造激活/注册)
  const ALLOWED = [
    'page_view',
    'demo_enter',
    'signup_open',
    'signup_submit',
    'wall_hit',
    'share_view',
    'share_cta_click',
    'cta_click',
  ];
  const event = String(req.body?.event || '');
  if (!ALLOWED.includes(event)) {
    return res.send(resultData(null, 400, '不支持的事件'));
  }
  // 转化漏斗只统计游客:已登录用户的访问/点击不计入(他们不在游客转化路径上)
  if ((req.user?.role || 'visitor') !== 'visitor') {
    return res.send(resultData(null));
  }
  // 渠道归因类事件的 source 走白名单归一(signup_open/demo_enter/share_* 等);
  // wall_hit 的 source 是「撞墙操作」、page_view 是页面名,属另一维度,只截断不套渠道白名单
  const CHANNEL_EVENTS = new Set(['demo_enter', 'signup_open', 'signup_submit', 'share_view', 'share_cta_click']);
  const rawSource = req.body?.source || '';
  const context = CHANNEL_EVENTS.has(event) ? normalizeConversionSource(rawSource) : String(rawSource).slice(0, 255);
  recordConversionEvent(req, event, context);
  res.send(resultData(null));
};

// 转化漏斗看板数据(root 专属):各事件去重访客数 + 撞墙热点 + 分享/激活 + 按天趋势;支持时间窗
export const getConversionFunnel = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    // 时间窗(可选):startDate/endDate 为 'YYYY-MM-DD',用于「改一版看效果」的版本前后对比;不传则全期
    const { startDate, endDate } = req.body || {};
    const timeCond = [];
    const timeParams = [];
    if (startDate) {
      timeCond.push('create_time >= ?');
      timeParams.push(String(startDate) + ' 00:00:00');
    }
    if (endDate) {
      timeCond.push('create_time < DATE_ADD(?, INTERVAL 1 DAY)');
      timeParams.push(String(endDate));
    }
    const andTime = timeCond.length ? ' AND ' + timeCond.join(' AND ') : '';

    // 漏斗只算游客:page_view/demo_enter/wall_hit/signup_open/signup_submit/signup_failed/share_* 限 visitor;
    // register(转化那一刻 visitor_type 已转 user)靠 event='register' OR 补进来;按 fingerprint 去重(轻量近似漏斗,不建 session)
    const [rows] = await pool.query(
      `SELECT event, COUNT(DISTINCT fingerprint) AS visitors FROM conversion_events WHERE fingerprint <> '' AND (event = 'register' OR visitor_type = 'visitor')${andTime} GROUP BY event`,
      timeParams,
    );
    // 用显式 camelCase 标量字段返回,避免 resultData 的 camelCaseKeys 把 wall_hit/cta_click 等带下划线的 key 改名
    const visitorsOf = (ev) => {
      const r = rows.find((x) => x.event === ev);
      return r ? Number(r.visitors) : 0;
    };
    const [hotspots] = await pool.query(
      `SELECT context, COUNT(*) AS cnt FROM conversion_events WHERE event = 'wall_hit' AND context <> ''${andTime} GROUP BY context ORDER BY cnt DESC LIMIT 20`,
      timeParams,
    );
    const [ipRow] = await pool.query(
      `SELECT COUNT(DISTINCT ip) AS ips FROM conversion_events WHERE visitor_type = 'visitor' AND ip <> ''${andTime}`,
      timeParams,
    );
    // 激活里程碑(按注册 cohort 归因):只算「本期注册的用户」里做过 first_own_resource 的去重数,
    // 用 register 关联,排除历史用户/内部账号的自建事件混入,避免激活率虚高甚至超过 100%。
    // (v1.1 不做「注册后 24h 内」时间窗约束——那属完整 V2,达触发条件再加)
    const andTimeReg = timeCond.length
      ? ' AND ' + timeCond.map((c) => c.replace('create_time', 'r.create_time')).join(' AND ')
      : '';
    const [actRow] = await pool.query(
      `SELECT COUNT(DISTINCT r.user_id) AS activated
       FROM conversion_events r
       JOIN conversion_events f ON f.user_id = r.user_id AND f.event = 'first_own_resource'
       WHERE r.event = 'register' AND r.user_id IS NOT NULL${andTimeReg}`,
      timeParams,
    );
    // 无法归因:空 fingerprint 的游客事件数(不计入访客数,单独展示,提示采集质量)
    const [unattrRow] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM conversion_events WHERE fingerprint = '' AND visitor_type = 'visitor'${andTime}`,
      timeParams,
    );
    // 注册失败原因分布(标准原因码:email_exists / weak_password / server_error)
    const [failReasons] = await pool.query(
      `SELECT context AS reason, COUNT(*) AS cnt FROM conversion_events WHERE event = 'signup_failed' AND context <> ''${andTime} GROUP BY context ORDER BY cnt DESC`,
      timeParams,
    );
    // 按天趋势(访问 / 打开注册 / 注册成功),用 DATE_FORMAT 直接出字符串避免时区偏移
    const [trend] = await pool.query(
      `SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d,
         COUNT(DISTINCT CASE WHEN visitor_type = 'visitor' AND event = 'page_view' THEN fingerprint END) AS pv,
         COUNT(DISTINCT CASE WHEN visitor_type = 'visitor' AND event = 'signup_open' THEN fingerprint END) AS signupOpen,
         COUNT(DISTINCT CASE WHEN event = 'register' THEN fingerprint END) AS reg
       FROM conversion_events WHERE 1 = 1${andTime}
       GROUP BY d ORDER BY d`,
      timeParams,
    );
    // 路径拆分:「进入示例」和「打开注册」是并行入口,不是上下游——不少访客直接点注册、从没进过示例,
    // 所以 signup_open / register 的访客里必须区分「先看过示例」和「没看示例」两路,
    // 否则 signup_open÷demo_enter 会把两批毫不相干的人当成一条转化链(直接注册的人多时还会超 100%)。
    // 按 fingerprint 取各事件首次时间,以「示例是否发生在注册意图之前」判定归属:
    // 两路互斥且相加等于该事件总访客数,页面上可以直接验算。
    // 撞墙单独算(它与看示例会重叠,不能三分),只用于撞墙这条独立分支自身的转化率。
    const [pathRows] = await pool.query(
      `SELECT
         SUM(CASE WHEN signup_first IS NOT NULL AND demo_first IS NOT NULL AND demo_first < signup_first THEN 1 ELSE 0 END) AS demoThenSignupOpen,
         SUM(CASE WHEN signup_first IS NOT NULL AND (demo_first IS NULL OR demo_first >= signup_first) THEN 1 ELSE 0 END) AS directSignupOpen,
         SUM(CASE WHEN reg_first IS NOT NULL AND demo_first IS NOT NULL AND demo_first < reg_first THEN 1 ELSE 0 END) AS demoThenRegister,
         SUM(CASE WHEN reg_first IS NOT NULL AND (demo_first IS NULL OR demo_first >= reg_first) THEN 1 ELSE 0 END) AS directRegister,
         SUM(CASE WHEN signup_first IS NOT NULL AND wall_first IS NOT NULL AND wall_first < signup_first THEN 1 ELSE 0 END) AS wallThenSignupOpen
       FROM (
         SELECT fingerprint,
           MIN(CASE WHEN event = 'demo_enter' THEN create_time END) AS demo_first,
           MIN(CASE WHEN event = 'wall_hit' THEN create_time END) AS wall_first,
           MIN(CASE WHEN event = 'signup_open' THEN create_time END) AS signup_first,
           MIN(CASE WHEN event = 'register' THEN create_time END) AS reg_first
         FROM conversion_events
         WHERE fingerprint <> '' AND (event = 'register' OR visitor_type = 'visitor')
           AND event IN ('demo_enter', 'wall_hit', 'signup_open', 'register')${andTime}
         GROUP BY fingerprint
       ) p`,
      timeParams,
    );
    // 完整路径是诊断指标，不能代替各事件的真实总人数。例如已有 4 人注册，
    // 其中只有 2 人在本时间窗内被完整记录了四步，主卡仍应显示 4，另外标注完整路径 2。
    const timeFor = (alias) =>
      timeCond.length
        ? ' AND ' +
          timeCond.map((condition) => condition.replaceAll('create_time', `${alias}.create_time`)).join(' AND ')
        : '';
    // 通过有序自连接寻找「后于上一阶段」的任意有效事件；这样即使访客在本期
    // 早先打开过注册、后来重新访问并完成注册，也不会因「各事件最早时间」而被误删。
    const [orderedRows] = await pool.query(
      `SELECT
         COUNT(DISTINCT p.fingerprint) AS pageView,
         COUNT(DISTINCT s.fingerprint) AS signupOpen,
         COUNT(DISTINCT submit_event.fingerprint) AS signupSubmit,
         COUNT(DISTINCT register_event.fingerprint) AS registerSuccess
       FROM conversion_events p
       LEFT JOIN conversion_events s
         ON s.fingerprint = p.fingerprint AND s.event = 'signup_open' AND s.visitor_type = 'visitor'
        AND s.create_time > p.create_time${timeFor('s')}
       LEFT JOIN conversion_events submit_event
         ON submit_event.fingerprint = s.fingerprint AND submit_event.event = 'signup_submit'
        AND submit_event.visitor_type = 'visitor' AND submit_event.create_time > s.create_time${timeFor('submit_event')}
       LEFT JOIN conversion_events register_event
         ON register_event.fingerprint = submit_event.fingerprint AND register_event.event = 'register'
        AND register_event.create_time > submit_event.create_time${timeFor('register_event')}
       WHERE p.fingerprint <> '' AND p.event = 'page_view' AND p.visitor_type = 'visitor'${timeFor('p')}`,
      timeCond.length ? [...timeParams, ...timeParams, ...timeParams, ...timeParams] : [],
    );
    const pathOf = (key) => Number(pathRows[0]?.[key] || 0);
    const ordered = orderedRows[0] || {};
    const independentStageValues = [
      ['pageView', '访问', visitorsOf('page_view')],
      ['signupOpen', '打开注册', visitorsOf('signup_open')],
      ['signupSubmit', '提交注册', visitorsOf('signup_submit')],
      ['registerSuccess', '注册成功', visitorsOf('register')],
    ];
    const orderedStageValues = [
      ['pageView', '访问', Number(ordered.pageView || 0)],
      ['signupOpen', '打开注册', Number(ordered.signupOpen || 0)],
      ['signupSubmit', '提交注册', Number(ordered.signupSubmit || 0)],
      ['registerSuccess', '注册成功', Number(ordered.registerSuccess || 0)],
    ];
    const buildFunnel = (stageValues) =>
      stageValues.map(([key, label, count], index) => {
        const previous = index > 0 ? Number(stageValues[index - 1][2] || 0) : 0;
        return {
          key,
          label,
          count,
          fromPreviousRate: index === 0 ? null : previous > 0 ? Math.round((Number(count) / previous) * 1000) / 10 : 0,
          lost: index === 0 ? null : Math.max(0, previous - Number(count)),
        };
      });
    const mainFunnel = buildFunnel(independentStageValues);
    const orderedFunnel = buildFunnel(orderedStageValues);
    res.send(
      resultData({
        mainFunnel,
        orderedFunnel,
        pageViewVisitors: visitorsOf('page_view'),
        demoEnterVisitors: visitorsOf('demo_enter'),
        wallHitVisitors: visitorsOf('wall_hit'),
        signupOpenVisitors: visitorsOf('signup_open'),
        signupSubmitVisitors: visitorsOf('signup_submit'),
        registerVisitors: visitorsOf('register'),
        signupFailedVisitors: visitorsOf('signup_failed'),
        // 并行入口拆分:demoThen* + direct* 恒等于对应事件的总访客数
        demoThenSignupOpenVisitors: pathOf('demoThenSignupOpen'),
        directSignupOpenVisitors: pathOf('directSignupOpen'),
        demoThenRegisterVisitors: pathOf('demoThenRegister'),
        directRegisterVisitors: pathOf('directRegister'),
        wallThenSignupOpenVisitors: pathOf('wallThenSignupOpen'),
        ctaClickVisitors: visitorsOf('cta_click'), // legacy:旧客户端历史上报,新代码不再写入,仅供历史对比
        shareViewVisitors: visitorsOf('share_view'),
        shareCtaClickVisitors: visitorsOf('share_cta_click'),
        activatedUsers: Number(actRow[0]?.activated || 0),
        unattributedEvents: Number(unattrRow[0]?.cnt || 0),
        signupFailReasons: (failReasons || []).map((r) => ({ reason: r.reason, cnt: Number(r.cnt || 0) })),
        uniqueIps: Number(ipRow[0]?.ips || 0),
        hotspots,
        trend: (trend || []).map((t) => ({
          d: t.d,
          pv: Number(t.pv || 0),
          signupOpen: Number(t.signupOpen || 0),
          reg: Number(t.reg || 0),
        })),
      }),
    );
  } catch (e) {
    console.error('[ConversionFunnel] 查询失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '游客转化数据暂时不可用'));
  }
};

const ensureRootRole = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role !== 'root') {
      res.send(resultData(null, 403, '无权限操作'));
      return null;
    }
    const [userResult] = await pool.query('SELECT role,del_flag FROM user WHERE id = ? LIMIT 1', [userId]);
    if (userResult.length === 0 || userResult[0].role !== 'root' || Number(userResult[0].del_flag || 0) !== 0) {
      res.send(resultData(null, 403, '仅root用户可操作'));
      return null;
    }
    return userId;
  } catch (e) {
    console.error('[root-auth] 身份复核失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData(null, 500, '服务器内部错误'));
    return null;
  }
};

export const getDeepSeekBalance = async (req, res) => {
  const rootUserId = await ensureRootRole(req, res);
  if (!rootUserId) return;
  try {
    const balance = await queryDeepSeekBalance({ forceRefresh: req.body?.forceRefresh === true });
    // 余额快照表尚未迁移或瞬时不可用时，不能影响管理员读取当前供应商余额。
    let dailyBalanceChange = { isAvailable: false, reason: 'baseline_unavailable' };
    try {
      dailyBalanceChange = await getDeepSeekDailyBalanceChange(balance);
    } catch (snapshotError) {
      console.warn('[agent-balance] 今日余额变化读取失败 code=%s', stableAgentErrorCode(snapshotError));
    }
    return res.send(resultData({ ...balance, dailyBalanceChange }));
  } catch (error) {
    console.error('[agent-balance] DeepSeek 余额查询失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, 'DeepSeek 余额查询暂时不可用'));
  }
};

const OPINION_STATUS = {
  PENDING: 'pending',
  REPLIED: 'replied',
};

const emptyNoticeSummary = (role = 'visitor') => ({
  role,
  opinion: {
    pendingTotal: 0,
    unreadReplyTotal: 0,
    latestAt: null,
    latestReply: null,
  },
  security: {
    enabled: false,
    unhandledHighRiskCount: 0,
    unhandledCriticalCount: 0,
    latestAt: null,
  },
  hasNotice: false,
  noticeKey: '',
});

const buildNoticeKey = (summary) =>
  [
    summary.role,
    summary.opinion.pendingTotal,
    summary.opinion.unreadReplyTotal,
    summary.opinion.latestAt || '',
    summary.security.unhandledHighRiskCount,
    summary.security.unhandledCriticalCount,
    summary.security.latestAt || '',
  ].join('|');

export const getNoticeSummary = async (req, res) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role || 'visitor';
    if (!userId || role === 'visitor') {
      return res.send(resultData(emptyNoticeSummary(role)));
    }

    const summary = emptyNoticeSummary(role);
    if (role === 'root') {
      const [opinionRows] = await pool.query(
        `SELECT COUNT(*) AS pending_total, MAX(create_time) AS latest_at
         FROM opinion
         WHERE del_flag = 0 AND status = ?`,
        [OPINION_STATUS.PENDING],
      );
      const [securityRows] = await pool.query(
        `SELECT
           COUNT(*) AS unhandled_high_risk_count,
           SUM(severity = 'critical') AS unhandled_critical_count,
           MAX(created_at) AS latest_at
         FROM security_events
         WHERE handled_status = 'unhandled'
           AND severity IN ('high','critical')`,
      );
      summary.opinion.pendingTotal = Number(opinionRows[0]?.pending_total || 0);
      summary.opinion.latestAt = opinionRows[0]?.latest_at || null;
      summary.security.enabled = true;
      summary.security.unhandledHighRiskCount = Number(securityRows[0]?.unhandled_high_risk_count || 0);
      summary.security.unhandledCriticalCount = Number(securityRows[0]?.unhandled_critical_count || 0);
      summary.security.latestAt = securityRows[0]?.latest_at || null;
      summary.hasNotice = summary.opinion.pendingTotal > 0 || summary.security.unhandledHighRiskCount > 0;
      summary.noticeKey = buildNoticeKey(summary);
      return res.send(resultData(summary));
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS unread_reply_total, MAX(reply_time) AS latest_at
       FROM opinion
       WHERE user_id = ?
         AND del_flag = 0
         AND status = ?
         AND reply_viewed = 0`,
      [userId, OPINION_STATUS.REPLIED],
    );
    const [latestRows] = await pool.query(
      `SELECT id, type, content, reply_content, reply_time
       FROM opinion
       WHERE user_id = ?
         AND del_flag = 0
         AND status = ?
         AND reply_viewed = 0
       ORDER BY reply_time DESC, create_time DESC
       LIMIT 1`,
      [userId, OPINION_STATUS.REPLIED],
    );
    summary.opinion.unreadReplyTotal = Number(countRows[0]?.unread_reply_total || 0);
    summary.opinion.latestAt = countRows[0]?.latest_at || null;
    summary.opinion.latestReply = latestRows[0] || null;
    summary.hasNotice = summary.opinion.unreadReplyTotal > 0;
    summary.noticeKey = buildNoticeKey(summary);
    res.send(resultData(summary));
  } catch (e) {
    res.send(resultData(null, 500, '获取提醒汇总失败：' + e.message));
  }
};

const ensureSortColumn = async (connection, tableName) => {
  const [columnRows] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE 'sort'`);
  if (columnRows.length > 0) {
    return false;
  }
  try {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN sort INT NOT NULL DEFAULT 0`);
  } catch (e) {
    if (e?.code === 'ER_DUP_FIELDNAME') return false;
    throw e;
  }
  return true;
};

const reseedSortById = async (connection, tableName) => {
  await connection.query('SET @help_sort_seed := -1');
  await connection.query(
    `UPDATE \`${tableName}\`
     SET sort = (@help_sort_seed := @help_sort_seed + 1)
     ORDER BY id ASC`,
  );
};

// sort 列管理已移除（knowledge_base 自带 sort 列）

function normalizeAdminLogDate(value, endOfDay = false) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return null;
  return `${text} ${endOfDay ? '23:59:59' : '00:00:00'}`;
}

export const getApiLogs = async (req, res) => {
  // 全站 API 日志(含所有用户 IP/URL/请求体)——仅 root 运维可查,防越权信息泄露(前端已在 root 后台,后端须同门)
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const cursorMode = isAdminCursorRequest(req.body);
    const legacy = cursorMode ? null : validateQueryParams(req.body);
    const filters = snakeCaseKeys(req.body?.filters || legacy?.filters || {});
    const pageSize = cursorMode ? normalizeAdminListLimit(req.body?.limit) : legacy.pageSize;
    const currentPage = cursorMode ? 1 : legacy.currentPage;
    const skip = cursorMode ? 0 : pageSize * (currentPage - 1);
    const key = String(filters.key || '')
      .trim()
      .slice(0, 200);
    const { hide_internal: hideInternal = true } = filters;
    const rolePh = INTERNAL_ROLES.map(() => '?').join(', ');
    const method = String(filters.method || '').toUpperCase();
    const status = String(filters.status || '').toLowerCase();
    const requestId = String(filters.request_id || '')
      .trim()
      .slice(0, 64);
    const startDate = normalizeAdminLogDate(filters.start_date);
    const endDate = normalizeAdminLogDate(filters.end_date, true);
    const minDurationMs = Math.min(Math.max(Number(filters.min_duration_ms) || 0, 0), 600_000);
    // api_logs.del_flag / status_code 是历史 varchar 字段。这里必须按字符串比较；写成数字或 CAST
    // 会让 MySQL 对整列做隐式转换，放弃日志列表索引并扫描、排序整张大表。
    const conditions = ["a.del_flag = '0'"];
    const baseParams = [];
    // 空关键词时 LIKE '%%' 会让高频日志表退化为逐行 OR 判断，并阻断按时间索引快速取得首屏。
    // 只有用户真的输入关键词时才启用跨用户和接口的模糊搜索。
    if (key) {
      conditions.push(
        `(u.alias LIKE CONCAT('%', ?, '%') OR u.email LIKE CONCAT('%', ?, '%') OR a.ip LIKE CONCAT('%', ?, '%')
          OR a.url LIKE CONCAT('%', ?, '%') OR a.request_id LIKE CONCAT('%', ?, '%'))`,
      );
      baseParams.push(key, key, key, key, key);
    }
    // 隐藏内部账号(root/test);u.role 为 NULL(join 不到 user,如已删用户)按真实用户保留,避免误删日志
    if (hideInternal) {
      // 子查询只扫描很小的 user 表，主查询仍可沿 (del_flag, request_time, id) 取得最新日志；
      // 把角色条件留在 LEFT JOIN 结果上会让优化器更容易退化为全表扫描 + filesort。
      conditions.push(
        `a.user_id NOT IN (SELECT internal_user.id FROM user internal_user WHERE internal_user.role IN (${rolePh}))`,
      );
      baseParams.push(...INTERNAL_ROLES);
    }
    const hasMethodFilter = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (hasMethodFilter) {
      conditions.push('a.method = ?');
      baseParams.push(method);
    }
    const hasStatusFilter = ['success', '4xx', '5xx', 'errors'].includes(status);
    if (status === 'success') conditions.push("a.status_code BETWEEN '200' AND '399'");
    if (status === '4xx') conditions.push("a.status_code BETWEEN '400' AND '499'");
    if (status === '5xx') conditions.push("a.status_code BETWEEN '500' AND '599'");
    if (status === 'errors') conditions.push("a.status_code BETWEEN '400' AND '599'");
    if (requestId) {
      conditions.push('a.request_id = ?');
      baseParams.push(requestId);
    }
    if (startDate) {
      conditions.push('a.request_time >= ?');
      baseParams.push(startDate);
    }
    if (endDate) {
      conditions.push('a.request_time <= ?');
      baseParams.push(endDate);
    }
    if (minDurationMs > 0) {
      conditions.push('a.duration_ms >= ?');
      baseParams.push(minDurationMs);
    }
    const scope = adminCursorScope('api-logs', [
      key,
      hideInternal,
      method,
      status,
      requestId,
      startDate,
      endDate,
      minDurationMs,
    ]);
    const cursor = cursorMode ? decodeAdminListCursor(req.body?.cursor, scope) : null;
    const cursorFilter = cursor ? '(a.request_time < ? OR (a.request_time = ? AND a.id < ?))' : '';
    const cursorParams = cursor
      ? [new Date(adminCursorTime(cursor.value)), new Date(adminCursorTime(cursor.value)), cursor.id]
      : [];
    const listConditions = cursorFilter ? [...conditions, cursorFilter] : conditions;
    const whereClause = listConditions.join(' AND ');
    const take = cursorMode ? pageSize + 1 : pageSize;

    // 列表不读取 longtext 请求体；请求参数只在点开单条详情时按 ID 懒加载。
    // 首屏列表和总数互不依赖，并行执行，避免两段数据库耗时串行叠加。
    const listPromise = pool.query(
      `SELECT a.id, a.user_id, a.url, a.method, a.ip, a.system, a.request_time,
              a.status_code, a.request_id, a.duration_ms, u.alias, u.email
         FROM api_logs a
         LEFT JOIN user u ON a.user_id = u.id
        WHERE ${whereClause}
        ORDER BY a.request_time DESC, a.id DESC
        LIMIT ?${cursorMode ? '' : ' OFFSET ?'}`,
      [...baseParams, ...cursorParams, take, ...(cursorMode ? [] : [skip])],
    );
    const shouldCount = !cursorMode || !cursor;
    const hasBusinessFilters = Boolean(
      key || hasMethodFilter || hasStatusFilter || requestId || startDate || endDate || minDurationMs > 0,
    );
    let totalPromise = Promise.resolve(undefined);
    if (shouldCount && !hasBusinessFilters) {
      // 游标负责后续分页，total 只需首屏计算。默认首屏在同一个 SQL 快照中用两个窄索引计数
      // 相减，避免为了排除 root/test 对 11 万行日志逐行 LEFT JOIN user，同时保证差值口径一致。
      const defaultCountSql = hideInternal
        ? `SELECT
             (SELECT COUNT(*) FROM api_logs active_log FORCE INDEX (idx_api_logs_admin_list)
               WHERE active_log.del_flag = '0')
             -
             (SELECT COUNT(*)
                FROM api_logs internal_log FORCE INDEX (idx_api_logs_user_time)
                INNER JOIN user internal_user ON internal_log.user_id = internal_user.id
               WHERE internal_log.del_flag = '0' AND internal_user.role IN (${rolePh})) AS total`
        : `SELECT COUNT(*) AS total FROM api_logs active_log FORCE INDEX (idx_api_logs_admin_list)
            WHERE active_log.del_flag = '0'`;
      totalPromise = pool
        .query(defaultCountSql, hideInternal ? INTERNAL_ROLES : [])
        .then(([rows]) => Math.max(0, Number(rows[0]?.total || 0)));
    } else if (shouldCount) {
      // 只有关键词会读取 user 的 alias/email；其他筛选的总数无需关联用户表。
      const countFrom = key ? 'api_logs a LEFT JOIN user u ON a.user_id = u.id' : 'api_logs a';
      totalPromise = pool
        .query(`SELECT COUNT(*) AS total FROM ${countFrom} WHERE ${conditions.join(' AND ')}`, baseParams)
        .then(([rows]) => Number(rows[0]?.total || 0));
    }
    const [[result], total] = await Promise.all([listPromise, totalPromise]);

    const hasMore = cursorMode && result.length > pageSize;
    const page = cursorMode ? result.slice(0, pageSize) : result;

    page.forEach((row) => {
      if (row.system && typeof row.system === 'string') {
        try {
          row.system = JSON.parse(row.system);
        } catch (e) {}
      }
      row.system = normalizeApiLogSystem(row.system);
    });

    const last = page[page.length - 1];

    res.send(
      resultData({
        items: page,
        total,
        hasMore,
        nextCursor:
          cursorMode && hasMore && last
            ? encodeAdminListCursor(scope, { value: adminCursorTime(last.request_time), id: last.id })
            : null,
      }),
    );
  } catch (e) {
    const status = e?.code === 'ADMIN_LIST_CURSOR_INVALID' ? 400 : 500;
    console.error('[admin-list] API 日志查询失败 code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, status, status === 400 ? '查询游标无效' : '查询日志失败'));
  }
};

export const getApiLogDetail = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  const id = String(req.body?.id || '').trim();
  if (!id || id.length > 255) return res.send(resultData(null, 400, '缺少有效的 API 日志 ID'));
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.user_id, a.url, a.method, a.req, a.ip, a.system, a.request_time,
              a.status_code, a.request_id, a.duration_ms, u.alias, u.email
         FROM api_logs a
         LEFT JOIN user u ON a.user_id = u.id
        WHERE a.id = ? AND a.del_flag = '0'
        LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) return res.send(resultData(null, 404, 'API 日志不存在或已清理'));
    for (const field of ['req', 'system']) {
      if (row[field] && typeof row[field] === 'string') {
        try {
          row[field] = JSON.parse(row[field]);
        } catch (e) {}
      }
    }
    row.system = normalizeApiLogSystem(row.system);
    return res.send(resultData(row));
  } catch (error) {
    console.error('[admin-list] API 日志详情查询失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '查询日志详情失败'));
  }
};
async function clearSoftLogTable(req, res, { table, targetId }) {
  let actionContext = null;
  let connection = null;
  try {
    actionContext = await beginAdminAction(req, {
      action: 'logs.cleanup',
      targetId,
      expectedConfirmText: '确认清理日志',
      metadata: { cleanupMode: 'soft_all', table },
    });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query(`UPDATE ${table} SET del_flag = 1 WHERE del_flag = 0`);
    const receipt = await finishAdminAction(actionContext, {
      outcome: 'succeeded',
      metadata: { affectedRows: Number(result.affectedRows || 0) },
      db: connection,
    });
    await connection.commit();
    return res.send(
      resultData({
        updated: Number(result.affectedRows || 0),
        ...receipt,
      }),
    );
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // 保留原始错误。
      }
    }
    if (actionContext) {
      try {
        await finishAdminAction(actionContext, {
          outcome: 'failed',
          metadata: { errorCode: stableAgentErrorCode(error) },
        });
      } catch {
        // 原始错误仍用于响应；审计失败已由审计工具记录安全错误码。
      }
    }
    const response = adminActionErrorResponse(error, '日志清理失败');
    return res.send(resultData({ code: response.code }, response.status, response.message));
  } finally {
    connection?.release();
  }
}

// POST /common/clearApiLogs —— 后台软清理 API 日志；原因、确认与双阶段审计由服务端强制。
export const clearApiLogs = (req, res) => clearSoftLogTable(req, res, { table: 'api_logs', targetId: 'api_logs:all' });
// 用户操作日志
export const recordOperationLogs = (req, res) => {
  try {
    if (req.isAdminPreview && !req.isVisitorWorkspace) {
      return res.send(resultData(null, 403, '管理员用户预览为只读模式'));
    }
    if (req.isVisitorWorkspace && req.adminActor?.role !== 'root') {
      return res.send(resultData(null, 403, '游客维护工作区需要真实管理员身份'));
    }
    const userId = req.isVisitorWorkspace ? req.adminActor?.id : req.user?.id;
    const moduleName = String(req.body?.module || '').trim();
    const operationName = String(req.body?.operation || '').trim();
    if (!userId || !moduleName || !operationName) {
      return res.send(resultData(null, 400, '操作日志参数不完整'));
    }
    // 本地/回环请求(本地调试)不记操作日志
    // 游客内容维护属于管理员审计，即使是自己人设备也必须记录。
    if (!req.isVisitorWorkspace && isSelfTraffic(req)) return res.send(resultData(null));
    const log = {
      module: req.isVisitorWorkspace ? `游客内容维护/${moduleName}` : moduleName,
      operation: req.isVisitorWorkspace ? `${operationName}（目标游客：${req.user?.id || '未知'}）` : operationName,
      create_by: userId,
      ip: req.ip || '',
      // 与 api_logs 同一口径，后台能按「浏览器 / PWA / Android App」筛查问题操作。
      // 只留环境相关字段：这一列是 varchar(255)，不塞 fingerprint 之类的长值。
      system: JSON.stringify(buildOperationLogSystem(req)),
      del_flag: 0,
    };
    // operation_logs 为 latin1 表,operation/module 等列不支持 4 字节字符(emoji):
    // 写入前剥离星芒面字符,避免含 emoji 的操作(如撤回带 🎉 标题的通知)整条 500,
    // 进而被前端拦截器弹成「报错通知」(实际业务操作已成功)。
    const stripAstral = (v) => (typeof v === 'string' ? v.replace(/[\u{10000}-\u{10FFFF}]/gu, '') : v);
    Object.keys(log).forEach((k) => {
      log[k] = stripAstral(log[k]);
    });
    pool
      .query('INSERT INTO operation_logs SET ?', [insertData(log)])
      .then(() => {
        res.send(resultData(null));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};

// —— 日志白名单(自己人设备免记录 api/操作/转化):仅 root 可管理 ——
export const getLogExclude = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    res.send(resultData(await listLogExclude()));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const addLogExcludeFp = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const fingerprint = String(req.body?.fingerprint || '')
      .trim()
      .slice(0, 128);
    const deviceId = String(req.body?.deviceId || req.headers?.['x-log-device-id'] || '')
      .trim()
      .slice(0, 128);
    const note = String(req.body?.note || '')
      .trim()
      .slice(0, 255);
    if (!fingerprint) return res.send(resultData(null, 400, '缺少指纹'));
    await addLogExclude(fingerprint, deviceId, note);
    res.send(resultData(null));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const removeLogExcludeFp = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const fingerprint = String(req.body?.fingerprint || '').trim();
    if (!fingerprint) return res.send(resultData(null, 400, '缺少指纹'));
    await removeLogExclude(fingerprint);
    res.send(resultData(null));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

export const getOperationLogs = async (req, res) => {
  // 全站操作日志(含所有用户行为)——仅 root 运维可查,防越权信息泄露
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  try {
    const cursorMode = isAdminCursorRequest(req.body);
    const legacy = cursorMode ? null : validateQueryParams(req.body);
    const filters = snakeCaseKeys(req.body?.filters || legacy?.filters || {});
    const pageSize = cursorMode ? normalizeAdminListLimit(req.body?.limit) : legacy.pageSize;
    const currentPage = cursorMode ? 1 : legacy.currentPage;
    const skip = cursorMode ? 0 : pageSize * (currentPage - 1);
    const hideInternal = filters.hide_internal !== false;
    const rolePh = INTERNAL_ROLES.map(() => '?').join(', ');
    const key = String(filters.key || '')
      .trim()
      .slice(0, 200);
    const moduleName = String(filters.module || '')
      .trim()
      .slice(0, 100);
    const userId = String(filters.user_id || '')
      .trim()
      .slice(0, 255);
    const startDate = normalizeAdminLogDate(filters.start_date);
    const endDate = normalizeAdminLogDate(filters.end_date, true);
    const conditions = [
      `(u.alias LIKE CONCAT('%', ?, '%')
        OR u.email LIKE CONCAT('%', ?, '%')
        OR o.operation LIKE CONCAT('%', ?, '%')
        OR o.module LIKE CONCAT('%', ?, '%')
        OR o.ip LIKE CONCAT('%', ?, '%'))`,
      'o.del_flag = 0',
    ];
    const baseParams = [key, key, key, key, key];
    if (hideInternal) {
      conditions.push(`(u.role IS NULL OR u.role NOT IN (${rolePh}))`);
      baseParams.push(...INTERNAL_ROLES);
    }
    if (moduleName) {
      conditions.push('o.module = ?');
      baseParams.push(moduleName);
    }
    if (userId) {
      conditions.push('o.create_by = ?');
      baseParams.push(userId);
    }
    if (startDate) {
      conditions.push('o.create_time >= ?');
      baseParams.push(startDate);
    }
    if (endDate) {
      conditions.push('o.create_time <= ?');
      baseParams.push(endDate);
    }
    const scope = adminCursorScope('operation-logs', [key, hideInternal, moduleName, userId, startDate, endDate]);
    const cursor = cursorMode ? decodeAdminListCursor(req.body?.cursor, scope) : null;
    const cursorFilter = cursor ? '(o.create_time < ? OR (o.create_time = ? AND o.id < ?))' : '';
    const cursorParams = cursor
      ? [new Date(adminCursorTime(cursor.value)), new Date(adminCursorTime(cursor.value)), cursor.id]
      : [];
    const listConditions = cursorFilter ? [...conditions, cursorFilter] : conditions;
    const take = cursorMode ? pageSize + 1 : pageSize;
    const [rows] = await pool.query(
      `SELECT o.*, u.alias,u.email
FROM operation_logs o
LEFT JOIN user u ON o.create_by = u.id
WHERE ${listConditions.join(' AND ')}
ORDER BY o.create_time DESC, o.id DESC
LIMIT ?${cursorMode ? '' : ' OFFSET ?'};
`,
      [...baseParams, ...cursorParams, take, ...(cursorMode ? [] : [skip])],
    );
    const hasMore = cursorMode && rows.length > pageSize;
    const page = cursorMode ? rows.slice(0, pageSize) : rows;
    // 与 api 日志同样的处理:存的是 JSON 字符串,前端按对象读 system.os / system.runtime。
    // 迁移之前的历史行没有这一列的值,normalize 会把它补成「未知 + browser」，不会渲染成空白。
    page.forEach((row) => {
      if (row.system && typeof row.system === 'string') {
        try {
          row.system = JSON.parse(row.system);
        } catch (e) {}
      }
      row.system = normalizeApiLogSystem(row.system);
    });
    let total;
    if (!cursorMode || !cursor) {
      const [totalRes] = await pool.query(
        `SELECT COUNT(*) AS total FROM operation_logs o LEFT JOIN user u ON o.create_by = u.id WHERE ${conditions.join(' AND ')}`,
        baseParams,
      );
      total = Number(totalRes[0].total || 0);
    }
    const last = page[page.length - 1];
    return res.send(
      resultData({
        items: page,
        total,
        hasMore,
        nextCursor:
          cursorMode && hasMore && last
            ? encodeAdminListCursor(scope, { value: adminCursorTime(last.create_time), id: last.id })
            : null,
      }),
    );
  } catch (e) {
    const status = e?.code === 'ADMIN_LIST_CURSOR_INVALID' ? 400 : 500;
    console.error('[admin-list] 操作日志查询失败 code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, status, status === 400 ? '查询游标无效' : '查询日志失败'));
  }
};

// POST /common/clearOperationLogs —— 后台软清理操作日志。
export const clearOperationLogs = (req, res) =>
  clearSoftLogTable(req, res, { table: 'operation_logs', targetId: 'operation_logs:all' });

// ── 按 IP 清理日志(root 专属的后台清理模块用)──────────────────────────
// 三张带 ip 列的日志表;operation_logs 的 ip 列由 20260702 迁移补齐,历史行 ip 为 NULL
// key 显式用驼峰:resultData 会对返回 data 递归 camelCaseKeys,直接用驼峰避免蛇形被改名(见本文件顶部同类坑)
const IP_LOG_TABLES = [
  { table: 'api_logs', key: 'apiLogs' },
  { table: 'conversion_events', key: 'conversionEvents' },
  { table: 'operation_logs', key: 'operationLogs' },
];
// 构造按 IP 过滤的 WHERE:mode='local' 匹配本地/回环(等价 isLocalIp),否则按精确 IP
const buildIpLogWhere = (mode, ip) => {
  if (mode === 'local') {
    return {
      where: "(LOWER(ip)='::1' OR LOWER(ip)='localhost' OR ip LIKE '127.%' OR LOWER(ip) LIKE '::ffff:127.%')",
      params: [],
    };
  }
  return { where: 'ip = ?', params: [ip] };
};

// 统计某 IP(或本地回环)在各日志表的命中行数(清理前预览,不改数据)
export const getIpLogStats = async (req, res) => {
  const userId = await ensureRootRole(req, res);
  if (!userId) return;
  try {
    const mode = req.body?.mode === 'local' ? 'local' : 'exact';
    const ip = String(req.body?.ip || '').trim();
    if (mode === 'exact' && !ip) return res.send(resultData(null, 400, '请输入要查询的 IP'));
    const { where, params } = buildIpLogWhere(mode, ip);
    const stats = {};
    for (const { table, key } of IP_LOG_TABLES) {
      const [rows] = await pool.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params);
      stats[key] = rows[0].n;
    }
    res.send(resultData(stats));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

// 物理删除某 IP(或本地回环)在各日志表的全部记录(root 专属;转化漏斗表无 del_flag,统一用物理删除)
export const clearLogsByIp = async (req, res) => {
  let actionContext = null;
  let connection = null;
  try {
    const mode = req.body?.mode === 'local' ? 'local' : 'exact';
    const ip = String(req.body?.ip || '').trim();
    if (mode === 'exact' && !ip) return res.send(resultData(null, 400, '请输入要清理的 IP'));
    actionContext = await beginAdminAction(req, {
      action: 'logs.cleanup',
      targetId: mode === 'local' ? 'local-loopback' : 'exact-ip',
      expectedConfirmText: '确认清理日志',
      metadata: { cleanupMode: mode === 'local' ? 'physical_local' : 'physical_exact_ip' },
    });
    const { where, params } = buildIpLogWhere(mode, ip);
    const deleted = {};
    connection = await pool.getConnection();
    await connection.beginTransaction();
    for (const { table, key } of IP_LOG_TABLES) {
      const [result] = await connection.query(`DELETE FROM ${table} WHERE ${where}`, params);
      deleted[key] = result.affectedRows || 0;
    }
    const receipt = await finishAdminAction(actionContext, {
      outcome: 'succeeded',
      metadata: { deleted },
      db: connection,
    });
    await connection.commit();
    return res.send(resultData({ ...deleted, ...receipt }));
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // 保留原始错误。
      }
    }
    if (actionContext) {
      try {
        await finishAdminAction(actionContext, {
          outcome: 'failed',
          metadata: { errorCode: stableAgentErrorCode(error) },
        });
      } catch {
        // 审计工具已安全记录错误码。
      }
    }
    const response = adminActionErrorResponse(error, '日志清理失败');
    return res.send(resultData({ code: response.code }, response.status, response.message));
  } finally {
    connection?.release();
  }
};

/**
 * 性能统计：记录 analyzeImgUrl 每批处理的无正文统计指标
 * 只记 batchId/数量/延迟/结果分类，不记录 URL/标题/图标内容
 */
function logBatchStats(batchId, metrics) {
  const { bookmarkCount, uniqueOriginCount, successCount, noIconCount, totalDurationMs } = metrics;
  const safeMetrics = {
    batchId,
    bookmarkCount,
    uniqueOriginCount,
    successCount,
    noIconCount,
    totalDurationMs,
    ts: Date.now(),
  };
  console.log(JSON.stringify({ type: 'icon-batch-stats', ...safeMetrics }));
}

export const analyzeImgUrl = async (req, res) => {
  const canMaintainAdminBookmarks =
    req.adminContext?.mode === 'maintain' && req.adminCapability?.policy === 'content_write';
  const canMaintainVisitorBookmarks =
    canMaintainAdminBookmarks ||
    (req.isVisitorWorkspaceContentWrite && req.isVisitorWorkspace && req.adminActor?.role === 'root');
  if (req.isAdminPreview && !canMaintainAdminBookmarks && !canMaintainVisitorBookmarks) {
    return res.send(resultData(null, 403, '管理员用户预览为只读模式'));
  }
  // 图标抓取会落盘并更新 bookmark.icon_url，属于写操作。普通游客浏览时静默跳过，避免自动请求弹注册墙。
  if ((!req.user?.id || req.user.role === 'visitor') && !canMaintainVisitorBookmarks) {
    return res.send(resultData([]));
  }
  if (!Array.isArray(req.body)) {
    return res.send(resultData(null, 400, '请求参数格式错误'));
  }

  const requestModeById = new Map();
  req.body.slice(0, 50).forEach((item) => {
    const id = String(item?.id || '').trim();
    const refreshMode =
      item?.refreshMode === 'after_save'
        ? 'after_save'
        : item?.refreshMode === 'periodic' || item?.noCache
          ? 'periodic'
          : '';
    if (!id || !refreshMode) return;
    if (!requestModeById.has(id) || refreshMode === 'periodic') requestModeById.set(id, refreshMode);
  });
  const requestedIds = [...requestModeById.keys()];
  if (requestedIds.length === 0) {
    return res.send(resultData([]));
  }

  // ── 阶段 A：短查询 ──────────────────────────────────────
  // 使用 pool.query（短连接），查询完成立即释放
  const placeholders = requestedIds.map(() => '?').join(',');
  const [ownedBookmarks] = await pool.query(
    `SELECT id, url, icon_url, icon_checked_at
     FROM bookmark
     WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`,
    [req.user.id, ...requestedIds],
  );
  // 此时连接已自动释放回池

  // ── 分批：节流 vs 需抓取 ────────────────────────────────
  const throttledResults = [];
  const bookmarksToFetch = [];
  const checkedAt = new Date().toISOString();

  for (const bm of ownedBookmarks) {
    const refreshMode = requestModeById.get(String(bm.id));
    if (refreshMode === 'after_save' && isBookmarkIconCheckRecent(bm.icon_checked_at)) {
      throttledResults.push({
        id: bm.id,
        iconUrl: bm.icon_url || '',
        iconCheckedAt: bm.icon_checked_at || checkedAt,
        changed: false,
        throttled: true,
      });
    } else {
      bookmarksToFetch.push(bm);
    }
  }

  // ── 性能统计：批次追踪 ──────────────────────────────────
  const _batchId = generateUUID();
  const _batchStart = performance.now();
  const _uniqueOrigins = new Set();
  for (const bm of bookmarksToFetch) {
    try {
      const originUrl = new URL(bm.url.startsWith('http') ? bm.url : `https://${bm.url}`);
      _uniqueOrigins.add(originUrl.origin);
    } catch {
      /* ignore */
    }
  }

  // ── 阶段 B：网络抓取（不占数据库连接） ──────────────────
  const fetchResults = bookmarksToFetch.length > 0 ? await processBookmarkIcons(bookmarksToFetch, req.user.id) : [];

  // ── 性能统计 ────────────────────────────────────────────
  const _totalDuration = Math.round(performance.now() - _batchStart);
  const _successCount = fetchResults.filter((r) => !r.errorCode).length;
  const _noIconCount = fetchResults.length - _successCount;
  logBatchStats(_batchId, {
    bookmarkCount: ownedBookmarks.length,
    uniqueOriginCount: _uniqueOrigins.size,
    successCount: _successCount,
    noIconCount: _noIconCount,
    totalDurationMs: _totalDuration,
  });

  // ── 阶段 C：组装响应 ────────────────────────────────────
  // fetchResults 已经包含各条书签的最终状态
  // 需要确保返回字段与前端期望一致
  const allResults = [...throttledResults, ...fetchResults];
  res.send(resultData(allResults.filter(Boolean), 200, '图标检查完成'));
};

export const getImages = async (req, res) => {
  // 后台图库(列全站书签图标 + 笔记图片 + 笔记模板图片 + 服务器图片目录)——仅 root 可查
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '没有操作权限'));
  // 指定要读取的目录路径
  const directoryPath = '/www/wwwroot/images';

  try {
    // 读取目录中的所有文件和子目录。
    // 用异步版：readdirSync 会阻塞事件循环，图片目录条目多时一次后台图库加载
    // 会把整个单进程服务卡住(所有并发请求一起等)，而这里本来就在 async 上下文里。
    let files = [];
    try {
      files = await fsP.readdir(directoryPath);
    } catch (e) {
      if (e.code === 'ENOENT') {
        files = [];
      } else {
        throw e;
      }
    }

    // 过滤并处理文件名和后缀
    let fileList = files.map((file) => {
      const ext = path.extname(file); // 获取文件后缀
      const fileName = path.basename(file, ext); // 获取文件名（不带后缀）
      return {
        name: fileName,
        extension: ext.split('.')[1],
        fullFileName: file, // 如果需要完整的文件名（包括后缀）
      };
    });

    // 引用集合统一由 util/noteImages.js 汇总(书签图标 + note_images + 模板正文),
    // 精确按「文件名(不含扩展)」比对,避免子串误判(如 bookmark-5 命中 bookmark-50);
    // 「仅被模板引用」的图片必须算已使用,否则 Root 清理会导致模板裂图
    const usedNames = await collectUsedImageNames();

    if (req.body.name) {
      fileList = fileList.filter((file) => file.name.includes(req.body.name));
    }
    res.send(
      resultData({
        items: {
          usedImages: fileList.filter((file) => usedNames.has(file.name)),
          unUsedImages: fileList.filter((file) => !usedNames.has(file.name)),
        },
        total: fileList.length,
      }),
    );
  } catch (error) {
    console.error('读取目录时出错：', error);
    res.send(resultData(null, 500, '读取图片目录失败'));
  }
};

export const clearImages = async (req, res) => {
  const userId = await ensureRootRole(req, res);
  if (!userId) return;
  const directoryPath = '/www/wwwroot/images';
  const images = Array.isArray(req.body.images) ? req.body.images : [];
  if (!images.length) {
    return res.send(resultData(null, 400, '未指定要删除的图片'));
  }

  try {
    // 删除前服务端重建引用集合再次校验(不信任前端的"已失效"标记):
    // 图库列表与实际清理之间存在时间差,期间图片可能已被笔记/模板重新引用
    const usedNames = await collectUsedImageNames();
    const deleted = [];
    const skipped = [];
    const failed = [];
    for (const data of images) {
      // basename 防路径穿越,只允许删除图片目录内的文件
      const fullFileName = path.basename(String(data?.fullFileName || ''));
      if (!fullFileName) continue;
      const baseName = fullFileName.replace(/\.[^.]+$/, '');
      if (usedNames.has(baseName)) {
        skipped.push(fullFileName);
        continue;
      }
      try {
        await deleteNoteImageThumbnail(`https://boluo66.top/uploads/${fullFileName}`).catch((error) => {
          console.warn('[image-cleanup] thumbnail delete failed code=%s', stableAgentErrorCode(error));
        });
        await fsP.unlink(path.join(directoryPath, fullFileName));
        deleted.push(fullFileName);
      } catch (error) {
        // 文件已不存在视为删除达成(幂等),其余失败如实上报,不谎报成功
        if (error?.code === 'ENOENT') {
          deleted.push(fullFileName);
        } else {
          console.error(`删除文件失败: ${fullFileName}`, error);
          failed.push(fullFileName);
        }
      }
    }
    if (failed.length && !deleted.length && !skipped.length) {
      return res.status(500).send(resultData({ deleted, skipped, failed }, 500, '删除失败'));
    }
    const msgParts = [];
    if (deleted.length) msgParts.push(`已删除 ${deleted.length} 张`);
    if (skipped.length) msgParts.push(`${skipped.length} 张仍被引用已跳过`);
    if (failed.length) msgParts.push(`${failed.length} 张删除失败`);
    res.send(resultData({ deleted, skipped, failed }, 200, msgParts.join('；') || '删除成功'));
  } catch (error) {
    console.error('删除过程中出现错误:', error);
    res.status(500).send(resultData(null, 500, '删除失败'));
  }
};

export const getHelpConfig = async (req, res) => {
  try {
    const [result] = await pool.query(
      "SELECT id,title,content,sort FROM knowledge_base WHERE category = '帮助中心' AND status = 'public' ORDER BY sort ASC, created_at ASC",
    );
    res.send(resultData(result, 200));
  } catch (e) {
    // 公开接口:不把 SQL 错误细节返给游客,降级空数组 + 500
    console.error('[help] 获取帮助中心配置失败 code=%s', stableAgentErrorCode(e));
    res.send(resultData([], 500, '获取帮助中心内容失败'));
  }
};

// 仅为旧 AI 会话补齐可导航来源：普通用户只能解析帮助中心公开文章，不返回正文。
export const resolveHelpSources = async (req, res) => {
  try {
    if (!Array.isArray(req.body?.titles)) return res.send(resultData(null, 400, '来源标题格式无效'));
    const titles = [
      ...new Set(
        req.body.titles
          .map((title) =>
            String(title || '')
              .trim()
              .slice(0, 255),
          )
          .filter(Boolean)
          .slice(0, 20),
      ),
    ];
    if (!titles.length) return res.send(resultData([], 200));
    const placeholders = titles.map(() => '?').join(',');
    const publicOnly = req.user?.role !== 'root';
    const [rows] = await pool.query(
      `SELECT id, title, category, status FROM knowledge_base
       WHERE title IN (${placeholders})${publicOnly ? " AND status = 'public' AND category = '帮助中心'" : ''}`,
      titles,
    );
    const titleCounts = rows.reduce((counts, row) => {
      counts.set(row.title, (counts.get(row.title) || 0) + 1);
      return counts;
    }, new Map());
    res.send(
      resultData(
        rows
          .filter((row) => titleCounts.get(row.title) === 1)
          .map((row) => {
            const target = resolveKnowledgeSourceTarget(row, req.user?.role);
            if (!target) return null;
            return {
              id: String(row.id),
              title: row.title,
              category: row.category || '',
              status: row.status || 'internal',
              target,
            };
          })
          .filter(Boolean),
        200,
      ),
    );
  } catch (error) {
    console.error('[help] 旧来源解析失败:', error?.message || error);
    res.send(resultData(null, 500, '来源解析失败'));
  }
};

// 草稿管理相关 handler 已移除（迁移至 knowledge_base 表）

function percentile(values, ratio) {
  const nums = values
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!nums.length) return null;
  return nums[Math.min(nums.length - 1, Math.max(0, Math.ceil(nums.length * ratio) - 1))];
}

function parseAgentToolStatuses(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 兼容升级前仅保存逗号分隔工具名的历史日志。
    return String(value)
      .split(',')
      .filter(Boolean)
      .map((name) => ({ name, status: 'unknown' }));
  }
}

export const getAgentLogsSummary = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'root') {
      return res.send(resultData(null, 403, '仅管理员可查看'));
    }

    // 用 Node 本地时间计算今日范围（避免 MySQL 时区差异）
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // 隐藏内部账号(root/test):与列表口径一致,按 user_id join user 判角色
    const { hideInternal = true } = req.body || {};
    const roleClause = hideInternal
      ? ` AND (u.role IS NULL OR u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`
      : '';
    const roleParams = hideInternal ? INTERNAL_ROLES : [];

    const [[todayRow], [totalRow]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(a.total_tokens),0) as tokens FROM agent_logs a LEFT JOIN user u ON a.user_id = u.id WHERE a.created_at >= ? AND a.created_at < DATE_ADD(?, INTERVAL 1 DAY)${roleClause}`,
        [todayStr, todayStr, ...roleParams],
      ),
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(a.total_tokens),0) as tokens FROM agent_logs a LEFT JOIN user u ON a.user_id = u.id WHERE 1=1${roleClause}`,
        [...roleParams],
      ),
    ]);

    let metricRows = [];
    try {
      const [rows] = await pool.query(
        `SELECT a.status, a.duration_ms, a.first_token_ms, a.planner_ms, a.tool_ms,
                a.final_ms, a.task_type, a.tools_used
         FROM agent_logs a
         LEFT JOIN user u ON a.user_id = u.id
         WHERE a.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)${roleClause}
         ORDER BY a.created_at DESC
         LIMIT 5000`,
        [...roleParams],
      );
      metricRows = rows;
    } catch (error) {
      // 迁移前的旧表缺少追踪字段时仍返回基础统计，避免后台页面整体不可用。
      if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    }

    const toolRows = metricRows.filter((row) => row.tools_used);
    const toolErrors = toolRows.filter((row) =>
      parseAgentToolStatuses(row.tools_used).some((tool) => tool.status === 'error'),
    ).length;
    const errorCount = metricRows.filter((row) => row.status === 'error').length;
    const confirmationApproved = metricRows.filter(
      (row) => row.task_type === 'agent_confirmation' && row.status === 'success',
    ).length;
    const confirmationRejected = metricRows.filter(
      (row) => row.task_type === 'agent_confirmation' && row.status === 'confirmation_rejected',
    ).length;
    const ratio = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0);
    const average = (field) => {
      const values = metricRows
        .map((row) => row[field])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(Number.isFinite);
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };

    res.send(
      resultData({
        today: {
          count: todayRow[0].count,
          tokens: todayRow[0].tokens,
        },
        total: {
          count: totalRow[0].count,
          tokens: totalRow[0].tokens,
        },
        quality: {
          sampleCount: metricRows.length,
          errorRate: ratio(errorCount, metricRows.length),
          durationP50: percentile(
            metricRows.map((row) => row.duration_ms),
            0.5,
          ),
          durationP95: percentile(
            metricRows.map((row) => row.duration_ms),
            0.95,
          ),
          firstTokenP50: percentile(
            metricRows.map((row) => row.first_token_ms),
            0.5,
          ),
          firstTokenP95: percentile(
            metricRows.map((row) => row.first_token_ms),
            0.95,
          ),
          plannerAvg: average('planner_ms'),
          toolAvg: average('tool_ms'),
          finalAvg: average('final_ms'),
          toolHitRate: ratio(toolRows.length, metricRows.length),
          toolErrorRate: ratio(toolErrors, toolRows.length),
          confirmationRate: ratio(confirmationApproved, confirmationApproved + confirmationRejected),
          directTaskCount: metricRows.filter((row) => row.task_type === 'note_assist').length,
          agentTaskCount: metricRows.filter((row) => row.task_type === 'agent').length,
        },
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, '查询失败: ' + e.message));
  }
};

const ADMIN_TREND_PERIODS = new Set([7, 15, 30, 90]);
const ADMIN_RECENT_LIMIT = 20;
const ADMIN_RECENT_PERIODS = new Set(['recent', 'today']);
const ADMIN_RECENT_TYPES = new Set(['all', 'resource', 'user', 'bookmark', 'note', 'file']);
const ADMIN_TODAY_BASELINE_DAYS = 7;

function adminOverviewDateHelpers(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const partsOf = (date) => Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const formatDate = (date) => {
    const parts = partsOf(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const formatDateTime = (date = now) => {
    const parts = partsOf(date);
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  };
  const formatTime = (date = now) => {
    const parts = partsOf(date);
    return `${parts.hour}:${parts.minute}:${parts.second}`;
  };
  return { formatDate, formatDateTime, formatTime };
}

function buildAdminTodayBaseline(rows, dates, cutoffTime) {
  if (!Array.isArray(rows)) {
    return {
      available: false,
      timezone: 'Asia/Shanghai',
      mode: 'same_elapsed_time',
      cutoffTime: cutoffTime.slice(0, 5),
      sampleDays: dates.length,
      metrics: {},
    };
  }

  const daily = new Map(dates.map((date) => [date, { users: 0, bookmarks: 0, notes: 0, files: 0, todos: 0 }]));
  rows.forEach((row) => {
    const bucket = daily.get(String(row.d || ''));
    const kind = String(row.kind || '');
    if (bucket && Object.hasOwn(bucket, kind)) bucket[kind] = Number(row.c || 0);
  });

  const metric = (kind) => {
    const values = dates.map((date) => Number(daily.get(date)?.[kind] || 0));
    const sum = values.reduce((total, value) => total + value, 0);
    return {
      yesterday: values[values.length - 1] || 0,
      average7d: values.length ? Number((sum / values.length).toFixed(1)) : 0,
    };
  };
  const resourcesByDate = dates.map((date) => {
    const bucket = daily.get(date);
    return Number(bucket?.bookmarks || 0) + Number(bucket?.notes || 0) + Number(bucket?.files || 0);
  });
  const resourceSum = resourcesByDate.reduce((total, value) => total + value, 0);

  return {
    available: true,
    timezone: 'Asia/Shanghai',
    mode: 'same_elapsed_time',
    cutoffTime: cutoffTime.slice(0, 5),
    sampleDays: dates.length,
    metrics: {
      users: metric('users'),
      resources: {
        yesterday: resourcesByDate[resourcesByDate.length - 1] || 0,
        average7d: resourcesByDate.length ? Number((resourceSum / resourcesByDate.length).toFixed(1)) : 0,
      },
      bookmarks: metric('bookmarks'),
      notes: metric('notes'),
      files: metric('files'),
      todos: metric('todos'),
    },
  };
}

function buildAdminOverviewScope(hideInternal) {
  const irSql = INTERNAL_ROLES.map((role) => `'${role}'`).join(', ');
  const notIntRole = hideInternal ? ` AND role NOT IN (${irSql})` : '';
  const notIntUser = hideInternal ? ` AND user_id NOT IN (SELECT id FROM \`user\` WHERE role IN (${irSql}))` : '';
  const notIntCreateBy = hideInternal ? ` AND create_by NOT IN (SELECT id FROM \`user\` WHERE role IN (${irSql}))` : '';
  const activeBookmarkOwner = ` AND EXISTS (
    SELECT 1 FROM \`user\` bookmark_owner
    WHERE bookmark_owner.id = bookmark.user_id AND bookmark_owner.del_flag = 0
  )`;
  const notOnboardingBookmark = ` AND NOT EXISTS (
    SELECT 1 FROM onboarding_seed_resources osr
    WHERE osr.user_id = bookmark.user_id
      AND osr.resource_type = 'bookmark'
      AND osr.resource_id = bookmark.id
  )`;
  const notOnboardingNote = ` AND NOT EXISTS (
    SELECT 1 FROM onboarding_seed_resources osr
    WHERE osr.user_id = note.create_by
      AND osr.resource_type = 'note'
      AND osr.resource_id = note.id
  )`;
  const notOnboardingFile = ` AND NOT EXISTS (
    SELECT 1 FROM onboarding_seed_resources osr
    WHERE osr.user_id = files.create_by
      AND osr.resource_type = 'file'
      AND osr.resource_id = CAST(files.id AS CHAR)
  )`;
  return {
    notIntRole,
    notIntUser,
    notIntCreateBy,
    activeBookmarkOwner,
    notOnboardingBookmark,
    notOnboardingNote,
    notOnboardingFile,
  };
}

async function queryAdminOverviewTrend({ days, hideInternal, now = new Date() }) {
  const { formatDate } = adminOverviewDateHelpers(now);
  const scope = buildAdminOverviewScope(hideInternal);
  const dates = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    dates.push(formatDate(date));
  }
  const startDate = dates[0];
  const [userTrendRows, contentTrendRows, activeRows] = await Promise.all([
    pool.query(
      "SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM `user` WHERE del_flag = 0 AND role <> 'visitor' AND create_time >= ?" +
        scope.notIntRole +
        ' GROUP BY d',
      [startDate],
    ),
    pool.query(
      `SELECT d, kind, SUM(c) AS c FROM (
       SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'bookmark' AS kind, COUNT(*) AS c FROM bookmark WHERE del_flag = 0 AND create_time >= ?${scope.activeBookmarkOwner}${scope.notIntUser}${scope.notOnboardingBookmark} GROUP BY d
       UNION ALL SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'note' AS kind, COUNT(*) AS c FROM note WHERE del_flag = 0 AND create_time >= ?${scope.notIntCreateBy}${scope.notOnboardingNote} GROUP BY d
       UNION ALL SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'file' AS kind, COUNT(*) AS c FROM files WHERE del_flag = 0 AND create_time >= ?${scope.notIntCreateBy}${scope.notOnboardingFile} GROUP BY d
     ) t GROUP BY d, kind`,
      [startDate, startDate, startDate],
    ),
    pool
      .query(
        `SELECT COUNT(DISTINCT user_id) AS activeUsers
         FROM user_sessions WHERE role != 'visitor' AND last_active_time >= ?${scope.notIntRole}`,
        [startDate],
      )
      .catch(() => [[{ activeUsers: 0 }]]),
  ]);

  const userMap = Object.fromEntries((userTrendRows[0] || []).map((row) => [row.d, Number(row.c || 0)]));
  const contentMap = new Map();
  (contentTrendRows[0] || []).forEach((row) => {
    const bucket = contentMap.get(row.d) || { bookmark: 0, note: 0, file: 0 };
    if (row.kind in bucket) bucket[row.kind] = Number(row.c || 0);
    contentMap.set(row.d, bucket);
  });
  const daily = dates.map((date) => {
    const kinds = contentMap.get(date) || { bookmark: 0, note: 0, file: 0 };
    return {
      date,
      label: date.slice(5),
      users: userMap[date] || 0,
      bookmarks: kinds.bookmark,
      notes: kinds.note,
      files: kinds.file,
      contentTotal: kinds.bookmark + kinds.note + kinds.file,
    };
  });

  const granularity = days === 90 ? 'week' : 'day';
  const trend =
    granularity === 'day'
      ? daily
      : Array.from({ length: Math.ceil(daily.length / 7) }, (_, index) => {
          const rows = daily.slice(index * 7, index * 7 + 7);
          const sum = (key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
          const start = rows[0];
          const end = rows[rows.length - 1];
          return {
            date: start.date,
            bucketEnd: end.date,
            label: `${start.label}~${end.label}`,
            users: sum('users'),
            bookmarks: sum('bookmarks'),
            notes: sum('notes'),
            files: sum('files'),
            contentTotal: sum('contentTotal'),
          };
        });
  return {
    days,
    granularity,
    activeUsers: Number(activeRows[0]?.[0]?.activeUsers || 0),
    trend,
  };
}

export const getAdminOverviewTrend = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅管理员可查看'));
  const days = Number(req.body?.days || 7);
  if (!ADMIN_TREND_PERIODS.has(days)) return res.send(resultData(null, 400, '趋势周期不受支持'));
  try {
    const result = await queryAdminOverviewTrend({ days, hideInternal: req.body?.hideInternal !== false });
    return res.send(resultData(result));
  } catch (error) {
    console.error('[AdminOverviewTrend] 查询失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '获取趋势数据失败'));
  }
};

function recentTimestamp(value) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

// POST /common/getAdminOverviewRecent —— 最近新增资源与注册用户（仅 root）
// 独立于主看板查询：最近列表失败时不拖慢或阻断 KPI、趋势等核心统计。
export const getAdminOverviewRecent = async (req, res) => {
  const rootUserId = await ensureRootRole(req, res);
  if (!rootUserId) return;
  const period = req.body?.period == null ? 'recent' : String(req.body.period).trim();
  const type = req.body?.type == null ? 'all' : String(req.body.type).trim();
  if (!ADMIN_RECENT_PERIODS.has(period)) return res.send(resultData(null, 400, '最近新增时间范围不受支持'));
  if (!ADMIN_RECENT_TYPES.has(type)) return res.send(resultData(null, 400, '最近新增类型不受支持'));
  try {
    const hideInternal = req.body?.hideInternal !== false;
    const scope = buildAdminOverviewScope(hideInternal);
    const today = adminOverviewDateHelpers().formatDate(new Date());
    const dateFilter = (column) =>
      period === 'today'
        ? {
            sql: ` AND ${column} >= ? AND ${column} < DATE_ADD(?, INTERVAL 1 DAY)`,
            params: [today, today],
          }
        : { sql: '', params: [] };
    const include = (target) =>
      type === 'all' || type === target || (type === 'resource' && ['bookmark', 'note', 'file'].includes(target));
    const resourceOwnerRole = hideInternal
      ? ` AND resource_owner.role NOT IN (${INTERNAL_ROLES.map((role) => `'${role}'`).join(', ')})`
      : '';
    const bookmarkDate = dateFilter('bookmark.create_time');
    const noteDate = dateFilter('note.create_time');
    const fileDate = dateFilter('files.create_time');
    const userDate = dateFilter('recent_user.create_time');
    const [bookmarkRows, noteRows, fileRows, userRows] = await Promise.all([
      include('bookmark')
        ? pool.query(
            `SELECT bookmark.id, bookmark.name AS title, bookmark.create_time AS createdAt,
                resource_owner.id AS userId, resource_owner.alias AS userName,
                COALESCE(owner_remark.remark_name, '') AS userRemark
         FROM bookmark
         JOIN \`user\` resource_owner ON resource_owner.id = bookmark.user_id AND resource_owner.del_flag = 0
         LEFT JOIN admin_user_remarks owner_remark
           ON owner_remark.admin_user_id = ? AND owner_remark.target_user_id = resource_owner.id
         WHERE bookmark.del_flag = 0${bookmarkDate.sql}${resourceOwnerRole}${scope.notOnboardingBookmark}
         ORDER BY bookmark.create_time DESC, bookmark.id DESC
         LIMIT ${ADMIN_RECENT_LIMIT}`,
            [rootUserId, ...bookmarkDate.params],
          )
        : Promise.resolve([[]]),
      include('note')
        ? pool.query(
            `SELECT note.id, note.title, note.create_time AS createdAt,
                resource_owner.id AS userId, resource_owner.alias AS userName,
                COALESCE(owner_remark.remark_name, '') AS userRemark
         FROM note
         JOIN \`user\` resource_owner ON resource_owner.id = note.create_by AND resource_owner.del_flag = 0
         LEFT JOIN admin_user_remarks owner_remark
           ON owner_remark.admin_user_id = ? AND owner_remark.target_user_id = resource_owner.id
         WHERE note.del_flag = 0${noteDate.sql}${resourceOwnerRole}${scope.notOnboardingNote}
         ORDER BY note.create_time DESC, note.id DESC
         LIMIT ${ADMIN_RECENT_LIMIT}`,
            [rootUserId, ...noteDate.params],
          )
        : Promise.resolve([[]]),
      include('file')
        ? pool.query(
            `SELECT files.id, files.file_name AS title, files.create_time AS createdAt,
                resource_owner.id AS userId, resource_owner.alias AS userName,
                COALESCE(owner_remark.remark_name, '') AS userRemark
         FROM files
         JOIN \`user\` resource_owner ON resource_owner.id = files.create_by AND resource_owner.del_flag = 0
         LEFT JOIN admin_user_remarks owner_remark
           ON owner_remark.admin_user_id = ? AND owner_remark.target_user_id = resource_owner.id
         WHERE files.del_flag = 0${fileDate.sql}${resourceOwnerRole}${scope.notOnboardingFile}
         ORDER BY files.create_time DESC, files.id DESC
         LIMIT ${ADMIN_RECENT_LIMIT}`,
            [rootUserId, ...fileDate.params],
          )
        : Promise.resolve([[]]),
      include('user')
        ? pool.query(
            `SELECT recent_user.id, recent_user.alias AS name, recent_user.role,
                recent_user.create_time AS createdAt,
                COALESCE(user_remark.remark_name, '') AS userRemark
         FROM \`user\` recent_user
         LEFT JOIN admin_user_remarks user_remark
           ON user_remark.admin_user_id = ? AND user_remark.target_user_id = recent_user.id
         WHERE recent_user.del_flag = 0 AND recent_user.role <> 'visitor'${userDate.sql}${scope.notIntRole}
         ORDER BY recent_user.create_time DESC, recent_user.id DESC
         LIMIT ${ADMIN_RECENT_LIMIT}`,
            [rootUserId, ...userDate.params],
          )
        : Promise.resolve([[]]),
    ]);

    const withType = (rows, type) => (rows[0] || []).map((row) => ({ ...row, type }));
    const recentResources = [
      ...withType(bookmarkRows, 'bookmark'),
      ...withType(noteRows, 'note'),
      ...withType(fileRows, 'file'),
    ]
      .sort((left, right) => {
        const timeDiff = recentTimestamp(right.createdAt) - recentTimestamp(left.createdAt);
        return timeDiff || String(right.id).localeCompare(String(left.id));
      })
      .slice(0, ADMIN_RECENT_LIMIT);

    return res.send(
      resultData({
        recentResources,
        recentUsers: userRows[0] || [],
        filter: { period, type, timezone: 'Asia/Shanghai' },
        limit: ADMIN_RECENT_LIMIT,
      }),
    );
  } catch (error) {
    console.error('[AdminOverviewRecent] 查询失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '获取最近新增数据失败'));
  }
};

// POST /common/getAdminOverview —— 后台总览看板:用户/内容/存储/AI/活跃/系统/转化/待办 + 近7天趋势(仅 root)
// 口径统一:累计量与今日增量成对返回,前端统一「累计为主 + 今日 +N」呈现;高风险表(security/user_sessions/api_logs/agent_logs)各自兜底,缺表不拖垮整体
export const getAdminOverview = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅管理员可查看'));
  try {
    // 隐藏内部账号(root/test):默认开。user/user_sessions 直接按 role;内容/AI/反馈按创建者 id 子查询排除。
    // INTERNAL_ROLES 是代码常量(非用户输入),内联进 SQL 以免大量参数错位;游客转化/系统健康不受影响
    const hideInternal = req.body?.hideInternal !== false;
    const irSql = INTERNAL_ROLES.map((r) => `'${r}'`).join(', ');
    const notIntRole = hideInternal ? ` AND role NOT IN (${irSql})` : '';
    const notIntUser = hideInternal ? ` AND user_id NOT IN (SELECT id FROM \`user\` WHERE role IN (${irSql}))` : '';
    const notIntCreateBy = hideInternal
      ? ` AND create_by NOT IN (SELECT id FROM \`user\` WHERE role IN (${irSql}))`
      : '';
    // 用户逻辑删除后，历史书签仍会保留，以支持后续的数据清理；后台总览不应继续把它们算入有效内容。
    const activeBookmarkOwner = ` AND EXISTS (
      SELECT 1 FROM \`user\` bookmark_owner
      WHERE bookmark_owner.id = bookmark.user_id AND bookmark_owner.del_flag = 0
    )`;
    const notOnboardingBookmark = ` AND NOT EXISTS (
      SELECT 1 FROM onboarding_seed_resources osr
      WHERE osr.user_id = bookmark.user_id
        AND osr.resource_type = 'bookmark'
        AND osr.resource_id = bookmark.id
    )`;
    const notOnboardingNote = ` AND NOT EXISTS (
      SELECT 1 FROM onboarding_seed_resources osr
      WHERE osr.user_id = note.create_by
        AND osr.resource_type = 'note'
        AND osr.resource_id = note.id
    )`;
    const notOnboardingFile = ` AND NOT EXISTS (
      SELECT 1 FROM onboarding_seed_resources osr
      WHERE osr.user_id = files.create_by
        AND osr.resource_type = 'file'
        AND osr.resource_id = CAST(files.id AS CHAR)
    )`;

    // 业务看板统一按 Asia/Shanghai 自然日切分，不依赖部署机器或 MySQL 会话时区。
    const now = new Date();
    const { formatDate, formatDateTime, formatTime } = adminOverviewDateHelpers(now);
    const today = formatDate(now);
    const baselineDates = [];
    for (let i = ADMIN_TODAY_BASELINE_DAYS; i >= 1; i--) {
      baselineDates.push(formatDate(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
    }
    const baselineStart = baselineDates[0];
    const baselineCutoffTime = formatTime(now);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      days.push(formatDate(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
    }
    const weekAgo = days[0];

    // 新日志由 logFunction 写入 routeMatched，能精确区分“业务路由返回 4xx”和“未知路径 404”。
    // 历史日志没有该标记，按已注册的业务路由前缀兼容判断，避免上线当天统计口径断层。
    const businessApiPrefixPattern =
      '^/(user|notification|json|common|note|bookmark|opinion|file|chat|search|workbench|security|trash|knowledgeBase|growth|inbox|todo|tagIcon|featureRequest)(/|[?]|$)';
    const legacyRouteUnclassifiedSql = `(COALESCE(system, '') NOT LIKE '%"routeMatched":%')`;
    const routeMatchedSql = `(COALESCE(system, '') LIKE '%"routeMatched":true%' OR (${legacyRouteUnclassifiedSql} AND url REGEXP '${businessApiPrefixPattern}'))`;
    const routeUnmatchedSql = `(COALESCE(system, '') LIKE '%"routeMatched":false%' OR (${legacyRouteUnclassifiedSql} AND NOT (url REGEXP '${businessApiPrefixPattern}')))`;
    // 历史 404 无法知道 Express 是否命中路由；现有数据主要是扫描不存在的路径，因此归为无效访问。
    // 上线后有 routeMatched=true 的真实业务 404 仍会正确归入业务 4xx。
    const legacyUnknown404Sql = `(status_code = '404' AND ${legacyRouteUnclassifiedSql})`;
    const validApiRequestSql = `((${routeMatchedSql} AND NOT ${legacyUnknown404Sql}) OR status_code LIKE '5%')`;
    const business4xxSql = `(status_code LIKE '4%' AND ${routeMatchedSql} AND NOT ${legacyUnknown404Sql})`;
    const invalid4xxSql = `(status_code LIKE '4%' AND (${routeUnmatchedSql} OR ${legacyUnknown404Sql}))`;

    const [
      userAgg,
      resAgg,
      convAgg,
      opinionAgg,
      securityAgg,
      todoAgg,
      activeAgg,
      sysAgg,
      userTrendRows,
      contentTrendRows,
      sameTimeBaselineRows,
    ] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) AS total, COALESCE(SUM(create_time >= ?), 0) AS today FROM `user` WHERE del_flag = 0 AND role <> 'visitor'" +
          notIntRole,
        [today],
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM bookmark WHERE del_flag = 0${activeBookmarkOwner}${notIntUser}${notOnboardingBookmark}) AS bookmarkTotal,
           (SELECT COUNT(*) FROM note WHERE del_flag = 0${notIntCreateBy}${notOnboardingNote}) AS noteTotal,
           (SELECT COUNT(*) FROM files WHERE del_flag = 0${notIntCreateBy}${notOnboardingFile}) AS fileTotal,
           COALESCE((SELECT ROUND(SUM(file_size) / 1048576, 2) FROM files WHERE del_flag = 0${notIntCreateBy}${notOnboardingFile}), 0) AS storageMb,
           (SELECT COUNT(*) FROM bookmark WHERE del_flag = 0 AND create_time >= ?${activeBookmarkOwner}${notIntUser}${notOnboardingBookmark}) AS bookmarkToday,
           (SELECT COUNT(*) FROM note WHERE del_flag = 0 AND create_time >= ?${notIntCreateBy}${notOnboardingNote}) AS noteToday,
           (SELECT COUNT(*) FROM files WHERE del_flag = 0 AND create_time >= ?${notIntCreateBy}${notOnboardingFile}) AS fileToday,
           COALESCE((SELECT ROUND(SUM(file_size) / 1048576, 2) FROM files WHERE del_flag = 1${notIntCreateBy}${notOnboardingFile}), 0) AS trashMb,
           (SELECT COUNT(*) FROM files WHERE del_flag = 1${notIntCreateBy}${notOnboardingFile}) AS trashCount`,
        [today, today, today],
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT CASE WHEN event = 'page_view' THEN fingerprint END) AS visitors,
           COUNT(DISTINCT CASE WHEN event = 'register' THEN fingerprint END) AS registers
         FROM conversion_events`,
      ),
      pool.query('SELECT COUNT(*) AS pending FROM opinion WHERE del_flag = 0 AND status = ?' + notIntUser, [
        OPINION_STATUS.PENDING,
      ]),
      pool
        .query(
          "SELECT COUNT(*) AS unhandled FROM security_events WHERE handled_status = 'unhandled' AND severity IN ('high','critical')",
        )
        .catch(() => [[{ unhandled: 0 }]]),
      pool
        .query(
          `SELECT
               COUNT(*) AS total,
               COALESCE(SUM(create_time >= ?), 0) AS createdToday,
               COALESCE(SUM(status = 'pending'), 0) AS pending,
               COALESCE(SUM(status = 'pending' AND due_at >= NOW() AND due_at < DATE_ADD(?, INTERVAL 1 DAY)), 0) AS dueToday,
               COALESCE(SUM(status = 'pending' AND due_at < NOW()), 0) AS overdue,
               COALESCE(SUM(status = 'completed' AND completed_at >= ? AND completed_at < DATE_ADD(?, INTERVAL 1 DAY)), 0) AS completedToday
             FROM todo_items
             WHERE del_flag = 0${notIntUser}`,
          [today, today, today, today],
        )
        .catch(() => [[{ total: 0, createdToday: 0, pending: 0, dueToday: 0, overdue: 0, completedToday: 0 }]]),
      // 活跃用户(会话表 last_active_time;排除游客会话)
      pool
        .query(
          `SELECT
             COUNT(DISTINCT CASE WHEN last_active_time >= ? THEN user_id END) AS activeToday,
             COUNT(DISTINCT CASE WHEN last_active_time >= ? THEN user_id END) AS active7d
           FROM user_sessions WHERE role != 'visitor'${notIntRole}`,
          [today, weekAgo],
        )
        .catch(() => [[{ activeToday: 0, active7d: 0 }]]),
      // 系统健康：业务 4xx、未知路径 4xx 与服务端 5xx 分开，避免外部探测 404 被误解为功能故障。
      pool
        .query(
          `SELECT
             COALESCE(SUM(${validApiRequestSql}), 0) AS total,
             COALESCE(SUM(${business4xxSql}), 0) AS businessErrors,
             COALESCE(SUM(${invalid4xxSql}), 0) AS invalidRequests,
             COALESCE(SUM(status_code LIKE '5%'), 0) AS serverErrors
           FROM api_logs WHERE request_time >= ?`,
          [today],
        )
        .catch(() => [[{ total: 0, businessErrors: 0, invalidRequests: 0, serverErrors: 0 }]]),
      // 近7天新增用户按天
      pool
        .query(
          "SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM `user` WHERE del_flag = 0 AND role <> 'visitor' AND create_time >= ?" +
            notIntRole +
            ' GROUP BY d',
          [weekAgo],
        )
        .catch(() => [[]]),
      // 近7天新增内容(书签+笔记+文件合并)按天
      pool
        .query(
          // 保留 kind 维度:用户数与内容量量级差异大,前端需要分面板展示书签/笔记/文件构成
          `SELECT d, kind, SUM(c) AS c FROM (
             SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'bookmark' AS kind, COUNT(*) AS c FROM bookmark WHERE del_flag = 0 AND create_time >= ?${activeBookmarkOwner}${notIntUser}${notOnboardingBookmark} GROUP BY d
             UNION ALL SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'note' AS kind, COUNT(*) AS c FROM note WHERE del_flag = 0 AND create_time >= ?${notIntCreateBy}${notOnboardingNote} GROUP BY d
             UNION ALL SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'file' AS kind, COUNT(*) AS c FROM files WHERE del_flag = 0 AND create_time >= ?${notIntCreateBy}${notOnboardingFile} GROUP BY d
           ) t GROUP BY d, kind`,
          [weekAgo, weekAgo, weekAgo],
        )
        .catch(() => [[]]),
      // 今日卡片只补“截至当前时刻”的同期基线；一次 UNION 聚合覆盖全部指标，避免每张卡重复查询。
      // create_time 先走日期范围，再用 TIME 截取相同日内时刻，防止拿今日半天数据对比历史完整自然日。
      pool
        .query(
          `SELECT d, kind, SUM(c) AS c FROM (
             SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'users' AS kind, COUNT(*) AS c
             FROM \`user\`
             WHERE del_flag = 0 AND role <> 'visitor' AND create_time >= ? AND create_time < ? AND TIME(create_time) <= ?${notIntRole}
             GROUP BY d
             UNION ALL
             SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'bookmarks' AS kind, COUNT(*) AS c
             FROM bookmark
             WHERE del_flag = 0 AND create_time >= ? AND create_time < ? AND TIME(create_time) <= ?${activeBookmarkOwner}${notIntUser}${notOnboardingBookmark}
             GROUP BY d
             UNION ALL
             SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'notes' AS kind, COUNT(*) AS c
             FROM note
             WHERE del_flag = 0 AND create_time >= ? AND create_time < ? AND TIME(create_time) <= ?${notIntCreateBy}${notOnboardingNote}
             GROUP BY d
             UNION ALL
             SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'files' AS kind, COUNT(*) AS c
             FROM files
             WHERE del_flag = 0 AND create_time >= ? AND create_time < ? AND TIME(create_time) <= ?${notIntCreateBy}${notOnboardingFile}
             GROUP BY d
             UNION ALL
             SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, 'todos' AS kind, COUNT(*) AS c
             FROM todo_items
             WHERE del_flag = 0 AND create_time >= ? AND create_time < ? AND TIME(create_time) <= ?${notIntUser}
             GROUP BY d
           ) same_time_baseline
           GROUP BY d, kind`,
          [
            baselineStart,
            today,
            baselineCutoffTime,
            baselineStart,
            today,
            baselineCutoffTime,
            baselineStart,
            today,
            baselineCutoffTime,
            baselineStart,
            today,
            baselineCutoffTime,
            baselineStart,
            today,
            baselineCutoffTime,
          ],
        )
        .catch((error) => {
          console.error('[AdminOverview] 同期基线统计失败(忽略) code=%s', stableAgentErrorCode(error));
          return [null];
        }),
    ]);

    // AI 用量单独兜底(agent_logs 若某环境未建表,不拖垮整个看板)。
    // agent_logs 的 cost 是静态价表估算，不作为后台金额指标返回。
    let ai = { todayCount: 0, todayTokens: 0, totalCount: 0, totalTokens: 0 };
    try {
      const [[aiToday], [aiTotal]] = await Promise.all([
        pool.query(
          'SELECT COUNT(*) AS count, COALESCE(SUM(total_tokens),0) AS tokens FROM agent_logs WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)' +
            notIntUser,
          [today, today],
        ),
        pool.query(
          'SELECT COUNT(*) AS count, COALESCE(SUM(total_tokens),0) AS tokens FROM agent_logs WHERE 1=1' + notIntUser,
        ),
      ]);
      ai = {
        todayCount: Number(aiToday[0].count),
        todayTokens: Number(aiToday[0].tokens),
        totalCount: Number(aiTotal[0].count),
        totalTokens: Number(aiTotal[0].tokens),
      };
    } catch (aiErr) {
      console.error('[AdminOverview] AI 统计失败(忽略) code=%s', stableAgentErrorCode(aiErr));
    }

    // 趋势按天补零成 7 天序列(展示 MM-DD)
    const userMap = Object.fromEntries((userTrendRows[0] || []).map((x) => [x.d, Number(x.c)]));
    const contentKindMap = new Map();
    (contentTrendRows[0] || []).forEach((row) => {
      const bucket = contentKindMap.get(row.d) || { bookmark: 0, note: 0, file: 0 };
      if (row.kind in bucket) bucket[row.kind] = Number(row.c || 0);
      contentKindMap.set(row.d, bucket);
    });
    const trend = days.map((day) => {
      const kinds = contentKindMap.get(day) || { bookmark: 0, note: 0, file: 0 };
      const contentTotal = kinds.bookmark + kinds.note + kinds.file;
      return {
        date: day,
        label: day.slice(5),
        users: userMap[day] || 0,
        bookmarks: kinds.bookmark,
        notes: kinds.note,
        files: kinds.file,
        contentTotal,
        // 兼容旧前端一个版本,避免前后端部署错位时看板空白
        d: day.slice(5),
        content: contentTotal,
      };
    });

    const u = userAgg[0][0],
      r = resAgg[0][0],
      c = convAgg[0][0],
      o = opinionAgg[0][0],
      s = securityAgg[0][0],
      todo = todoAgg[0][0],
      a = activeAgg[0][0],
      sys = sysAgg[0][0];
    res.send(
      resultData({
        users: { total: Number(u.total || 0), today: Number(u.today || 0) },
        active: { today: Number(a.activeToday || 0), week: Number(a.active7d || 0) },
        resources: {
          bookmarkTotal: Number(r.bookmarkTotal || 0),
          noteTotal: Number(r.noteTotal || 0),
          fileTotal: Number(r.fileTotal || 0),
          bookmarkToday: Number(r.bookmarkToday || 0),
          noteToday: Number(r.noteToday || 0),
          fileToday: Number(r.fileToday || 0),
          storageMb: Number(r.storageMb || 0),
          trashMb: Number(r.trashMb || 0),
          trashCount: Number(r.trashCount || 0),
        },
        ai,
        conversion: { visitors: Number(c.visitors || 0), registers: Number(c.registers || 0) },
        system: {
          apiToday: Number(sys.total || 0),
          // 保留 apiErrorsToday 兼容旧前端，但只统计真正需要关注的业务 4xx + 服务端 5xx。
          apiErrorsToday: Number(sys.businessErrors || 0) + Number(sys.serverErrors || 0),
          apiBusinessErrorsToday: Number(sys.businessErrors || 0),
          apiInvalidRequestsToday: Number(sys.invalidRequests || 0),
          apiServerErrorsToday: Number(sys.serverErrors || 0),
        },
        pending: { opinion: Number(o.pending || 0), security: Number(s.unhandled || 0) },
        todos: {
          total: Number(todo.total || 0),
          createdToday: Number(todo.createdToday || 0),
          pending: Number(todo.pending || 0),
          dueToday: Number(todo.dueToday || 0),
          overdue: Number(todo.overdue || 0),
          completedToday: Number(todo.completedToday || 0),
        },
        trend,
        trendPeriod: { days: 7, granularity: 'day' },
        todayBaseline: buildAdminTodayBaseline(sameTimeBaselineRows?.[0], baselineDates, baselineCutoffTime),
        generatedAt: formatDateTime(now),
      }),
    );
  } catch (error) {
    console.error('[AdminOverview] 查询失败 code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '获取后台总览失败'));
  }
};

const AGENT_TASK_TYPE_LABELS = {
  agent: 'AI 助手',
  note_assist: '笔记助手',
  tag_icon_search: '标签选图',
  bookmark_summary: '书签摘要',
  bookmark_meta: '书签识别',
  organize_bookmark_meta: '书签整理',
  organize_note_tags: '笔记整理',
  follow_up: '系统追问',
  followup_suggestions: '追问建议',
  material_follow_up: '资料追问',
  note_draft: '笔记草稿',
  note_draft_intent: '草稿意图识别',
  note_draft_task: '草稿生成',
  organize: '智能整理',
  agent_semantic_policy: '语义规划',
  agent_action_prepare: '操作准备',
  agent_interaction: '交互选择',
  agent_confirmation: '操作确认',
  change_set_proposal: '变更建议',
};

function normalizeAgentLogRequest(row) {
  const { turn_contract_trace: rawTurnContractTrace, ...safeRow } = row || {};
  let turnContractTrace = null;
  if (rawTurnContractTrace && typeof rawTurnContractTrace === 'object') {
    turnContractTrace = rawTurnContractTrace;
  } else if (typeof rawTurnContractTrace === 'string' && rawTurnContractTrace.trim()) {
    try {
      turnContractTrace = JSON.parse(rawTurnContractTrace);
    } catch {
      turnContractTrace = null;
    }
  }
  const taskType = String(row.task_type || 'agent');
  const taskTypeLabel = AGENT_TASK_TYPE_LABELS[taskType] || taskType || 'AI 请求';
  const raw = String(row.question || '')
    .replace(/\s+/gu, ' ')
    .trim();
  const privacyPlaceholder = /^\[[^\]]*(?:AI\s*)?请求[，,]\s*正文不写入日志\]$/u.test(raw);
  const emptyPlaceholder = /^\[[^\]]*(?:AI\s*)?请求[，,]\s*用户未提交问题\]$/u.test(raw);
  const requestKind = privacyPlaceholder
    ? 'redacted'
    : taskType === 'note_assist'
      ? 'quick_action'
      : taskType === 'agent'
        ? 'user_question'
        : 'system_task';
  const source = privacyPlaceholder
    ? `${taskTypeLabel}（请求正文未记录）`
    : emptyPlaceholder
      ? `${taskTypeLabel}（用户未提交问题）`
      : raw || `${taskTypeLabel}（无请求摘要）`;
  const requestChars = source.length;
  const requestTruncated = requestChars > 500;
  const requestPreview = requestTruncated ? `${source.slice(0, 500)}…` : source;
  return {
    ...safeRow,
    turnContractTrace,
    // 兼容旧前端字段，但列表接口不再返回可能长达 12000 字的完整问题。
    question: requestPreview,
    requestPreview,
    requestChars,
    requestTruncated,
    requestKind,
    requestLabel: requestKind === 'user_question' ? '提问' : '请求摘要',
    taskTypeLabel,
  };
}

export const getAgentLogs = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'root') {
      return res.send(resultData(null, 403, '仅管理员可查看'));
    }

    const keyword = String(req.body?.keyword || '')
      .trim()
      .slice(0, 200);
    const hideInternal = req.body?.hideInternal !== false;
    const cursorMode = isAdminCursorRequest(req.body);
    const take = cursorMode
      ? normalizeAdminListLimit(req.body?.limit)
      : normalizeAdminListLimit(req.body?.pageSize || 20, 20);
    const currentPage = Math.max(Number(req.body?.currentPage || 1), 1);
    const offset = take * (currentPage - 1);

    let where = '1=1';
    const params = [];

    if (keyword) {
      where += ' AND (a.question LIKE ? OR a.user_alias LIKE ? OR a.tools_used LIKE ? OR a.request_id LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // 隐藏内部账号(root/test):按 user_id join user 判角色;join 不到(u.role NULL,如已删用户)按真实用户保留
    if (hideInternal) {
      where += ` AND (u.role IS NULL OR u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`;
      params.push(...INTERNAL_ROLES);
    }

    const scope = adminCursorScope('agent-logs', [keyword, hideInternal]);
    const cursor = cursorMode ? decodeAdminListCursor(req.body?.cursor, scope) : null;
    if (cursor) {
      where += ' AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))';
      const at = new Date(adminCursorTime(cursor.value));
      params.push(at, at, cursor.id);
    }

    const queryLimit = cursorMode ? take + 1 : take;

    const [rows] = await pool.query(
      `SELECT a.* FROM agent_logs a LEFT JOIN user u ON a.user_id = u.id WHERE ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ?${cursorMode ? '' : ' OFFSET ?'}`,
      [...params, queryLimit, ...(cursorMode ? [] : [offset])],
    );
    const hasMore = cursorMode && rows.length > take;
    const pageRows = cursorMode ? rows.slice(0, take) : rows;
    const page = pageRows.map(normalizeAgentLogRequest);
    let total;
    if (!cursorMode || !cursor) {
      const countParams = [];
      let countWhere = '1=1';
      if (keyword) {
        countWhere += ' AND (a.question LIKE ? OR a.user_alias LIKE ? OR a.tools_used LIKE ? OR a.request_id LIKE ?)';
        countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      if (hideInternal) {
        countWhere += ` AND (u.role IS NULL OR u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`;
        countParams.push(...INTERNAL_ROLES);
      }
      const [countRes] = await pool.query(
        `SELECT COUNT(*) as total FROM agent_logs a LEFT JOIN user u ON a.user_id = u.id WHERE ${countWhere}`,
        countParams,
      );
      total = Number(countRes[0].total || 0);
    }
    const last = pageRows[pageRows.length - 1];

    return res.send(
      resultData({
        items: page,
        total,
        hasMore,
        nextCursor:
          cursorMode && hasMore && last
            ? encodeAdminListCursor(scope, { value: adminCursorTime(last.created_at), id: last.id })
            : null,
        currentPage,
        pageSize: take,
      }),
    );
  } catch (e) {
    const status = e?.code === 'ADMIN_LIST_CURSOR_INVALID' ? 400 : 500;
    console.error('[admin-list] AI 调用日志查询失败 code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, status, status === 400 ? '查询游标无效' : '查询失败'));
  }
};

/**
 * 一条动作链路上的全部调用（root 专属）。
 *
 * 发卡、用户确认或驳回是彼此独立的请求，各有自己的 request_id；correlation_id 把它们绑在一起，
 * 后台才能回答「确认卡发出去了吗、用户点了没有、最后成功了吗」。链路记录条数天然很小(通常 2~4 条)，
 * 因此不做分页，只做固定上限保护。
 */
export const getAgentLogChain = async (req, res) => {
  try {
    if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅管理员可查看'));

    const correlationId = String(req.body?.correlationId || '').trim();
    if (!correlationId || correlationId.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(correlationId)) {
      return res.send(resultData(null, 400, '链路标识无效'));
    }

    const [rows] = await pool.query(
      `SELECT id, request_id, correlation_id, confirmation_id, task_type, status, outcome_kind, tools_used,
              answer_chars, answer_digest, delivered, error_msg, duration_ms, total_tokens, created_at
         FROM agent_logs
        WHERE correlation_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 20`,
      [correlationId],
    );

    return res.send(resultData({ items: rows, correlationId }));
  } catch (e) {
    // 老库还没跑迁移时按「无链路」返回，后台详情仍能展示其余信息，不整页报错。
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.send(resultData({ items: [], correlationId: String(req.body?.correlationId || '') }));
    }
    console.error('[admin-list] AI 调用链路查询失败 code=%s', stableAgentErrorCode(e));
    return res.send(resultData(null, 500, '查询失败'));
  }
};

// AI 回答反馈（root 专属）：只查询仍处于现有保留期内的会话。
// 不复制问题/回答正文，也不绕过会话删除策略；用户清空会话后外键级联删除反馈，本接口自然不可见。
export const getAiFeedback = async (req, res) => {
  try {
    if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅管理员可查看'));

    const {
      keyword = '',
      rating = '',
      resolved = '',
      triageStatus = '',
      pageSize = 20,
      currentPage = 1,
      hideInternal = true,
    } = req.body || {};
    const take = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const page = Math.max(Number(currentPage) || 1, 1);
    const offset = take * (page - 1);
    const where = [
      "c.status IN ('active', 'archived')",
      "(c.retention_mode <> 'temporary' OR (c.expire_at IS NOT NULL AND c.expire_at > CURRENT_TIMESTAMP))",
    ];
    const params = [];

    if (rating === 'helpful' || rating === 'unhelpful') {
      where.push('f.rating = ?');
      params.push(rating);
    }
    if (resolved === 'resolved') where.push('f.resolved = 1');
    if (resolved === 'pending') where.push('(f.resolved IS NULL OR f.resolved = 0)');
    if (['open', 'investigating', 'actioned', 'dismissed'].includes(triageStatus)) {
      where.push("COALESCE(t.status, 'open') = ?");
      params.push(triageStatus);
    }
    if (String(keyword).trim()) {
      const like = `%${String(keyword).trim().slice(0, 200)}%`;
      where.push(
        '(f.id LIKE ? OR f.request_id LIKE ? OR u.alias LIKE ? OR c.title LIKE ? OR q.content LIKE ? OR m.content LIKE ? OR f.reason LIKE ? OR f.comment LIKE ?)',
      );
      params.push(like, like, like, like, like, like, like, like);
    }
    if (hideInternal) {
      where.push(`(u.role IS NULL OR u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(', ')}))`);
      params.push(...INTERNAL_ROLES);
    }
    const whereSql = where.join(' AND ');
    const fromSql = `FROM ai_feedback f
      INNER JOIN ai_conversations c ON c.id = f.conversation_id
      INNER JOIN ai_messages m ON m.id = f.message_id AND m.conversation_id = c.id AND m.role = 'assistant'
      LEFT JOIN ai_messages q ON q.id = m.parent_message_id AND q.conversation_id = c.id AND q.role = 'user'
      LEFT JOIN user u ON u.id = f.actor_user_id
      LEFT JOIN admin_ai_feedback_triage t ON t.feedback_id = f.id`;

    const [[rows], [countRows], [summaryRows], [reasonRows]] = await Promise.all([
      pool.query(
        `SELECT f.id, f.conversation_id, f.message_id, f.request_id, f.rating, f.reason, f.resolved, f.comment,
                COALESCE(t.status, 'open') AS triage_status, COALESCE(t.priority, 'normal') AS triage_priority,
                COALESCE(t.note, '') AS triage_note, t.updated_by AS triage_updated_by,
                t.update_time AS triage_update_time,
                f.create_time, f.update_time, c.title AS conversation_title, u.alias AS user_alias,
                q.content AS question, m.content AS answer, m.model_meta_json
         ${fromSql} WHERE ${whereSql}
         ORDER BY f.update_time DESC, f.id DESC LIMIT ? OFFSET ?`,
        [...params, take, offset],
      ),
      pool.query(`SELECT COUNT(*) AS total ${fromSql} WHERE ${whereSql}`, params),
      pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(f.rating = 'helpful'), 0) AS helpful,
                COALESCE(SUM(f.rating = 'unhelpful'), 0) AS unhelpful,
                COALESCE(SUM(f.rating = 'unhelpful' AND COALESCE(t.status, 'open') IN ('open', 'investigating')), 0) AS pending,
                COALESCE(SUM(COALESCE(t.status, 'open') = 'open'), 0) AS triage_open,
                COALESCE(SUM(t.status = 'investigating'), 0) AS triage_investigating,
                COALESCE(SUM(t.status = 'actioned'), 0) AS triage_actioned,
                COALESCE(SUM(t.status = 'dismissed'), 0) AS triage_dismissed
         ${fromSql} WHERE ${whereSql}`,
        params,
      ),
      pool.query(
        `SELECT f.reason, COUNT(*) AS count ${fromSql}
         WHERE ${whereSql} AND f.rating = 'unhelpful' AND f.reason IS NOT NULL
         GROUP BY f.reason ORDER BY count DESC, f.reason ASC LIMIT 10`,
        params,
      ),
    ]);
    const summary = summaryRows[0] || {};
    return res.send(
      resultData({
        items: rows.map((row) => ({
          id: String(row.id),
          conversationId: String(row.conversation_id),
          messageId: String(row.message_id),
          requestId: row.request_id || null,
          rating: row.rating,
          reason: row.reason || null,
          resolved: row.resolved == null ? null : Boolean(row.resolved),
          triageStatus: row.triage_status || 'open',
          triagePriority: row.triage_priority || 'normal',
          triageNote: row.triage_note || '',
          triageUpdatedBy: row.triage_updated_by || null,
          triageUpdatedAt: row.triage_update_time || null,
          comment: row.comment || '',
          userAlias: row.user_alias || '',
          conversationTitle: row.conversation_title || '',
          question: row.question || '',
          answer: row.answer || '',
          modelMeta: row.model_meta_json || null,
          createdAt: row.create_time,
          updatedAt: row.update_time,
        })),
        total: Number(countRows[0]?.total || 0),
        currentPage: page,
        pageSize: take,
        summary: {
          total: Number(summary.total || 0),
          helpful: Number(summary.helpful || 0),
          unhelpful: Number(summary.unhelpful || 0),
          pending: Number(summary.pending || 0),
          triageOpen: Number(summary.triage_open || 0),
          triageInvestigating: Number(summary.triage_investigating || 0),
          triageActioned: Number(summary.triage_actioned || 0),
          triageDismissed: Number(summary.triage_dismissed || 0),
        },
        reasons: reasonRows.map((row) => ({ reason: row.reason, count: Number(row.count || 0) })),
      }),
    );
  } catch (error) {
    console.error('[admin-ai-feedback] query failed code=%s', stableAgentErrorCode(error));
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) {
      return res.send(resultData(null, 503, 'AI 反馈闭环尚未完成数据库迁移'));
    }
    return res.send(resultData(null, 500, '查询 AI 回答反馈失败'));
  }
};
