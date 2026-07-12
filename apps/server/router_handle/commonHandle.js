import { resultData, snakeCaseKeys, insertData, generateUUID, INTERNAL_ROLES } from '../util/common.js';
import { isLocalIp } from '../util/ipFilter.js';
import { isSelfTraffic, listLogExclude, addLogExclude, removeLogExclude } from '../util/logExclude.js';
import https from 'https';
import http from 'http';
import fs from 'fs';
import fsP from 'fs/promises';
import path from 'path';
import pool from '../db/index.js';
import { validateQueryParams } from '../util/request.js';
import { recordConversionEvent } from '../util/conversion.js';

// 记录游客转化事件(前端 CTA 点击等);允许游客调用,白名单事件防滥用
export const recordConversion = (req, res) => {
  const ALLOWED = ['cta_click', 'page_view', 'wall_hit', 'share_view', 'share_cta_click'];
  const event = String(req.body?.event || '');
  if (!ALLOWED.includes(event)) {
    return res.send(resultData(null, 400, '不支持的事件'));
  }
  // 转化漏斗只统计游客:已登录用户的访问/点击不计入(他们不在游客转化路径上)
  if ((req.user?.role || 'visitor') !== 'visitor') {
    return res.send(resultData(null));
  }
  recordConversionEvent(req, event, req.body?.source || '');
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

    // 漏斗只算游客:page_view/wall_hit/cta_click/share_* 限 visitor;register(转化那一刻)按 fingerprint 全算
    const [rows] = await pool.query(
      `SELECT event, COUNT(DISTINCT fingerprint) AS visitors FROM conversion_events WHERE (event = 'register' OR visitor_type = 'visitor')${andTime} GROUP BY event`,
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
    // 激活里程碑:首次自建资源的去重用户数(登录用户,按 user_id)
    const [actRow] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS activated FROM conversion_events WHERE event = 'first_own_resource' AND user_id IS NOT NULL${andTime}`,
      timeParams,
    );
    // 按天趋势(访问 / 点击注册 / 注册成功),用 DATE_FORMAT 直接出字符串避免时区偏移
    const [trend] = await pool.query(
      `SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d,
         COUNT(DISTINCT CASE WHEN visitor_type = 'visitor' AND event = 'page_view' THEN fingerprint END) AS pv,
         COUNT(DISTINCT CASE WHEN visitor_type = 'visitor' AND event = 'cta_click' THEN fingerprint END) AS cta,
         COUNT(DISTINCT CASE WHEN event = 'register' THEN fingerprint END) AS reg
       FROM conversion_events WHERE 1 = 1${andTime}
       GROUP BY d ORDER BY d`,
      timeParams,
    );
    res.send(
      resultData({
        pageViewVisitors: visitorsOf('page_view'),
        wallHitVisitors: visitorsOf('wall_hit'),
        ctaClickVisitors: visitorsOf('cta_click'),
        registerVisitors: visitorsOf('register'),
        shareViewVisitors: visitorsOf('share_view'),
        shareCtaClickVisitors: visitorsOf('share_cta_click'),
        activatedUsers: Number(actRow[0]?.activated || 0),
        uniqueIps: Number(ipRow[0]?.ips || 0),
        hotspots,
        trend: (trend || []).map((t) => ({ d: t.d, pv: Number(t.pv || 0), cta: Number(t.cta || 0), reg: Number(t.reg || 0) })),
      }),
    );
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
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
    if (userResult.length === 0 || userResult[0].role !== 'root') {
      res.send(resultData(null, 403, '仅root用户可操作'));
      return null;
    }
    return userId;
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
    return null;
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

export const getApiLogs = async (req, res) => {
  try {
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const skip = pageSize * (currentPage - 1);
    const { key, hide_internal: hideInternal = true } = filters;
    const rolePh = INTERNAL_ROLES.map(() => '?').join(', ');
    const roleParams = hideInternal ? INTERNAL_ROLES : [];

    const baseWhere = `(u.alias LIKE CONCAT('%', ?, '%') OR a.ip LIKE CONCAT('%', ?, '%') OR a.url LIKE CONCAT('%', ?, '%')) AND a.del_flag = 0`;
    // 隐藏内部账号(root/test);u.role 为 NULL(join 不到 user,如已删用户)按真实用户保留,避免误删日志
    const roleFilter = hideInternal ? ` AND (u.role IS NULL OR u.role NOT IN (${rolePh}))` : '';
    const whereClause = baseWhere + roleFilter;

    const [result] = await pool.query(
      `SELECT a.*, u.alias, u.email FROM api_logs a LEFT JOIN user u ON a.user_id = u.id WHERE ${whereClause} ORDER BY a.request_time DESC LIMIT ? OFFSET ?`,
      [key, key, key, ...roleParams, pageSize, skip],
    );

    result.forEach((row) => {
      ['req', 'system'].forEach((field) => {
        if (row[field] && typeof row[field] === 'string') {
          try {
            row[field] = JSON.parse(row[field]);
          } catch (e) {}
        }
      });
    });

    const [totalRes] = await pool.query(
      `SELECT COUNT(*) AS total FROM api_logs a LEFT JOIN user u ON a.user_id = u.id WHERE ${whereClause}`,
      [key, key, key, ...roleParams],
    );

    res.send(
      resultData({
        items: result,
        total: totalRes[0].total,
      }),
    );
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};
export const clearApiLogs = (req, res) => {
  if (req.user?.role !== 'root') {
    return res.send(resultData(null, 403, '没有操作权限'));
  }
  pool
    .query('UPDATE api_logs set del_flag=1')
    .then(() => {
      res.send(resultData(null));
    })
    .catch((err) => {
      res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
    });
};
// 用户操作日志
export const recordOperationLogs = (req, res) => {
  try {
    const userId = req.user?.id;
    // 本地/回环请求(本地调试)不记操作日志
    if (isSelfTraffic(req)) return res.send(resultData(null));
    // 服务端受控字段一律放在 ...req.body 之后,防止客户端 body 伪造 create_by / id / ip
    const log = {
      ...req.body,
      create_by: userId,
      ip: req.ip || '',
      del_flag: 0,
    };
    delete log.createBy; // 防客户端用驼峰键绕过覆盖(snakeCaseKeys 会与 create_by 合流)
    delete log.id; // 防客户端指定主键(交由 insertData 生成 UUID)
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
    const fingerprint = String(req.body?.fingerprint || '').trim().slice(0, 128);
    const note = String(req.body?.note || '').trim().slice(0, 255);
    if (!fingerprint) return res.send(resultData(null, 400, '缺少指纹'));
    await addLogExclude(fingerprint, note);
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

export const getOperationLogs = (req, res) => {
  try {
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const skip = pageSize * (currentPage - 1);
    const hideInternal = filters.hide_internal !== false;
    const rolePh = INTERNAL_ROLES.map(() => '?').join(', ');
    const roleParams = hideInternal ? INTERNAL_ROLES : [];
    const roleFilter = hideInternal ? ` AND (u.role IS NULL OR u.role NOT IN (${rolePh}))` : '';
    // 查询总数据条数
    pool
      .query(
        `SELECT o.*, u.alias,u.email
FROM operation_logs o
LEFT JOIN user u ON o.create_by = u.id
WHERE (u.alias LIKE CONCAT('%', ?, '%') 
OR o.operation LIKE CONCAT('%', ?, '%') 
OR o.module LIKE CONCAT('%', ?, '%')) 
AND o.del_flag = 0${roleFilter}
ORDER BY o.create_time DESC
LIMIT ? OFFSET ?;
`,
        [filters.key, filters.key, filters.key, ...roleParams, pageSize, skip],
      )
      .then(async ([result]) => {
        const totalSql = `SELECT COUNT(*) FROM operation_logs o left join user u on o.create_by=u.id WHERE 
(u.alias LIKE CONCAT('%', ?, '%') 
OR o.operation LIKE CONCAT('%', ?, '%') 
OR o.module LIKE CONCAT('%', ?, '%'))
AND o.del_flag=0${roleFilter}`;
        const [totalRes] = await pool.query(totalSql, [filters.key, filters.key, filters.key, ...roleParams]);
        res.send(
          resultData({
            items: result,
            total: totalRes[0]['COUNT(*)'],
          }),
        );
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};

export const clearOperationLogs = (req, res) => {
  if (req.user?.role !== 'root') {
    return res.send(resultData(null, 403, '没有操作权限'));
  }
  pool
    .query('UPDATE operation_logs set del_flag=1')
    .then(() => {
      res.send(resultData(null));
    })
    .catch((err) => {
      res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
    });
};

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
  const userId = await ensureRootRole(req, res);
  if (!userId) return;
  try {
    const mode = req.body?.mode === 'local' ? 'local' : 'exact';
    const ip = String(req.body?.ip || '').trim();
    if (mode === 'exact' && !ip) return res.send(resultData(null, 400, '请输入要清理的 IP'));
    const { where, params } = buildIpLogWhere(mode, ip);
    const deleted = {};
    for (const { table, key } of IP_LOG_TABLES) {
      const [result] = await pool.query(`DELETE FROM ${table} WHERE ${where}`, params);
      deleted[key] = result.affectedRows || 0;
    }
    res.send(resultData(deleted));
  } catch (e) {
    res.send(resultData(null, 500, '服务器内部错误: ' + e.message));
  }
};

// 定义支持的图片类型及其对应的扩展名
const imageMimeTypes = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

// 默认图片路径（可选）
const defaultImagePath = '/uploads/default-icon.png';

// 图标获取:统一走同机工具箱 favimg(hub :3480)。favimg 抓网页解析 <link icon> + 站点自身 favicon.ico,
// 直连失败(强反爬/超时)再兜底公网聚合源(favicone/yandex);内置 SSRF 防护/缓存。返回 {buffer, contentType} 或 null。
function fetchIconFromFavimg(url) {
  return new Promise((resolve) => {
    const chunks = [];
    const request = http.get(`http://127.0.0.1:3480/favimg/?url=${encodeURIComponent(url)}`, (response) => {
      const contentType = response.headers['content-type'] || '';
      if (response.statusCode !== 200 || !contentType.startsWith('image/')) {
        response.resume();
        return resolve(null);
      }
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.length ? { buffer, contentType } : null);
      });
    });
    request.on('error', () => resolve(null));
    request.setTimeout(12000, () => {
      request.destroy();
      resolve(null);
    });
  });
}

export const analyzeImgUrl = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const results = await Promise.all(
      req.body.map(async (bookmark) => {
        if (!bookmark.noCache) return null;
        // 抓不到 → 空 iconUrl,前端用内置地球图标(icon.nullImg)兜底;不再指向线上并不存在的 /uploads/default-icon.png(避免 404)
        const fallback = { id: bookmark.id, iconUrl: '' };
        // 统一走自研 favimg(覆盖面广:网页 link + 站点 favicon.ico + 聚合兜底,无第三方占位假图问题)
        const fetched = await fetchIconFromFavimg(bookmark.url);
        if (!fetched) return fallback;
        try {
          let fileExtension = 'png';
          const mimeType = Object.entries(imageMimeTypes).find(([key]) => fetched.contentType?.includes(key))?.[1];
          if (mimeType) fileExtension = mimeType;

          const fileName = `bookmark-${bookmark.id}.${fileExtension}`;
          const uploadDir = '/www/wwwroot/images';
          await fsP.mkdir(uploadDir, { recursive: true });
          // 先清掉该书签所有旧扩展名的图标,避免换扩展名后旧文件残留成孤儿
          await Promise.all(
            ['png', 'svg', 'jpeg', 'jpg', 'gif', 'ico', 'webp'].map((e) =>
              fsP.unlink(path.join(uploadDir, `bookmark-${bookmark.id}.${e}`)).catch(() => {}),
            ),
          );
          await fsP.writeFile(path.join(uploadDir, fileName), fetched.buffer);
          const imageUrl = `https://${req.get('host')}/uploads/${fileName}`;
          await connection.query('UPDATE bookmark SET icon_url=? WHERE id=?', [imageUrl, bookmark.id]);
          // 返回 {id, iconUrl},供前端把新图标回填到当前列表项(不必刷新页面)
          return { id: bookmark.id, iconUrl: imageUrl };
        } catch (err) {
          console.error('图标落盘失败:', err.message);
          return fallback;
        }
      }),
    );
    res.send(resultData(results.filter(Boolean), 200, '所有图标已更新成功'));
  } catch (err) {
    res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
  } finally {
    connection.release();
  }
};

export const getImages = async (req, res) => {
  const [bookmarkResult] = await pool.query('select icon_url from bookmark');
  const [noteResult] = await pool.query('select url from note_images');
  // 指定要读取的目录路径
  const directoryPath = '/www/wwwroot/images';

  try {
    // 读取目录中的所有文件和子目录
    let files = [];
    try {
      files = fs.readdirSync(directoryPath);
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

    const bookmarkImages = bookmarkResult.map((bookmark) => bookmark.icon_url);
    const noteImages = noteResult.map((note) => note.url);
    const images = bookmarkImages.concat(noteImages);

    // 从引用 URL 精确提取「文件名(不含扩展)」建 Set 精确比对——
    // 避免子串误判(如 bookmark-5 命中 bookmark-50),真正无引用的孤儿才算失效
    const usedNames = new Set();
    for (const url of images) {
      if (typeof url !== 'string' || !url) continue;
      const seg = url.split('?')[0].split('/').pop() || '';
      const base = seg.replace(/\.[^.]+$/, '');
      if (base) usedNames.add(base);
    }

    if (req.body.name) {
      fileList = fileList.filter((file) => file.name.includes(req.body.name));
    }
    res.send(
      resultData({
        items: {
          images: images,
          usedImages: fileList.filter((file) => usedNames.has(file.name)),
          unUsedImages: fileList.filter((file) => !usedNames.has(file.name)),
        },
        total: fileList.length,
      }),
    );
  } catch (error) {
    console.error('读取目录时出错：', error);
  }
};

export const clearImages = async (req, res) => {
  const userId = await ensureRootRole(req, res);
  if (!userId) return;
  const directoryPath = '/www/wwwroot/images';
  const images = req.body.images;

  // 定义删除文件的函数
  const deleteFile = async (filePath) => {
    try {
      await fsP.unlink(filePath);
      console.log(`文件删除成功: ${filePath}`);
    } catch (error) {
      console.error(`删除文件失败: ${filePath}`, error);
      throw error; // 抛出错误以便Promise.all捕获
    }
  };

  // 构造所有需要删除的文件路径
  const deletePromises = images.map(async (data) => {
    const filePath = path.join(directoryPath, data.fullFileName);
    return deleteFile(filePath);
  });

  try {
    // 等待所有删除操作完成
    await Promise.all(deletePromises);
    res.send(resultData(req.body, 200, '删除成功'));
  } catch (error) {
    // 如果有任何删除操作失败，返回错误响应
    console.error('删除过程中出现错误:', error);
    res.status(500).send(resultData(req.body, 500, '删除失败'));
  }
};

export const runSql = async (req, res) => {
  try {
    const userId = await ensureRootRole(req, res);
    if (!userId) return;

    // 拦截危险操作（DROP TABLE/DATABASE、TRUNCATE、ALTER TABLE、GRANT、REVOKE）
    const DANGEROUS = /\b(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE|ALTER\s+TABLE|GRANT|REVOKE)\b/i;
    if (DANGEROUS.test(req.body.sql)) {
      return res.send(resultData(null, 403, '危险操作已拦截。如需执行，请直连数据库。'));
    }

    const [result] = await pool.query(req.body.sql);
    res.send(resultData(result, 200));
  } catch (e) {
    res.send(resultData(e.message, 200));
  }
};

export const getHelpConfig = async (req, res) => {
  try {
    const [result] = await pool.query("SELECT id,title,content,sort FROM knowledge_base WHERE category = '帮助中心' AND status = 'public' ORDER BY sort ASC, created_at ASC");
    res.send(resultData(result, 200));
  } catch (e) {
    res.send(resultData(e.message, 200));
  }
};

// 草稿管理相关 handler 已移除（迁移至 knowledge_base 表）

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

    const [[todayRow], [totalRow]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(cost),0) as cost FROM agent_logs WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
        [todayStr, todayStr],
      ),
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(cost),0) as cost FROM agent_logs`,
      ),
    ]);

    console.log('[AgentLogsSummary] todayStr:', todayStr, 'todayRow:', JSON.stringify(todayRow), 'totalRow:', JSON.stringify(totalRow));

    res.send(resultData({
      today: {
        count: todayRow[0].count,
        tokens: todayRow[0].tokens,
        cost: Number(todayRow[0].cost).toFixed(4),
      },
      total: {
        count: totalRow[0].count,
        tokens: totalRow[0].tokens,
        cost: Number(totalRow[0].cost).toFixed(4),
      },
    }));
  } catch (e) {
    res.send(resultData(null, 500, '查询失败: ' + e.message));
  }
};

// POST /common/getAdminOverview —— 后台总览看板:用户/内容/存储/AI/活跃/系统/转化/待办 + 近7天趋势(仅 root)
// 口径统一:累计量与今日增量成对返回,前端统一「累计为主 + 今日 +N」呈现;高风险表(security/user_sessions/api_logs/agent_logs)各自兜底,缺表不拖垮整体
export const getAdminOverview = async (req, res) => {
  if (req.user?.role !== 'root') return res.send(resultData(null, 403, '仅管理员可查看'));
  try {
    // 用 Node 本地时间算今日与近7天序列(与 getAgentLogsSummary 一致,避免 MySQL 时区差异)
    const now = new Date();
    const pad = (nn) => String(nn).padStart(2, '0');
    const dstr = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const today = dstr(now);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(dstr(d));
    }
    const weekAgo = days[0];

    const [userAgg, resAgg, convAgg, opinionAgg, securityAgg, activeAgg, sysAgg, userTrendRows, contentTrendRows] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total, COALESCE(SUM(create_time >= ?), 0) AS today FROM `user` WHERE del_flag = 0', [today]),
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM bookmark WHERE del_flag = 0) AS bookmarkTotal,
           (SELECT COUNT(*) FROM note WHERE del_flag = 0) AS noteTotal,
           (SELECT COUNT(*) FROM files WHERE del_flag = 0) AS fileTotal,
           COALESCE((SELECT ROUND(SUM(file_size) / 1048576, 2) FROM files WHERE del_flag = 0), 0) AS storageMb,
           (SELECT COUNT(*) FROM bookmark WHERE del_flag = 0 AND create_time >= ?) AS bookmarkToday,
           (SELECT COUNT(*) FROM note WHERE del_flag = 0 AND create_time >= ?) AS noteToday,
           (SELECT COUNT(*) FROM files WHERE del_flag = 0 AND create_time >= ?) AS fileToday,
           COALESCE((SELECT ROUND(SUM(file_size) / 1048576, 2) FROM files WHERE del_flag = 1), 0) AS trashMb,
           (SELECT COUNT(*) FROM files WHERE del_flag = 1) AS trashCount`,
        [today, today, today],
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT CASE WHEN event = 'page_view' THEN fingerprint END) AS visitors,
           COUNT(DISTINCT CASE WHEN event = 'register' THEN fingerprint END) AS registers
         FROM conversion_events`,
      ),
      pool.query('SELECT COUNT(*) AS pending FROM opinion WHERE del_flag = 0 AND status = ?', [OPINION_STATUS.PENDING]),
      pool
        .query("SELECT COUNT(*) AS unhandled FROM security_events WHERE handled_status = 'unhandled' AND severity IN ('high','critical')")
        .catch(() => [[{ unhandled: 0 }]]),
      // 活跃用户(会话表 last_active_time;排除游客会话)
      pool
        .query(
          `SELECT
             COUNT(DISTINCT CASE WHEN last_active_time >= ? THEN user_id END) AS activeToday,
             COUNT(DISTINCT CASE WHEN last_active_time >= ? THEN user_id END) AS active7d
           FROM user_sessions WHERE role != 'visitor'`,
          [today, weekAgo],
        )
        .catch(() => [[{ activeToday: 0, active7d: 0 }]]),
      // 系统健康(今日 API 请求 / 错误;status_code 为 varchar,用 LIKE 判 4xx/5xx)
      pool
        .query(
          "SELECT COUNT(*) AS total, COALESCE(SUM(status_code LIKE '4%' OR status_code LIKE '5%'), 0) AS errors FROM api_logs WHERE request_time >= ?",
          [today],
        )
        .catch(() => [[{ total: 0, errors: 0 }]]),
      // 近7天新增用户按天
      pool
        .query(
          "SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM `user` WHERE del_flag = 0 AND create_time >= ? GROUP BY d",
          [weekAgo],
        )
        .catch(() => [[]]),
      // 近7天新增内容(书签+笔记+文件合并)按天
      pool
        .query(
          `SELECT d, SUM(c) AS c FROM (
             SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM bookmark WHERE del_flag = 0 AND create_time >= ? GROUP BY d
             UNION ALL SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM note WHERE del_flag = 0 AND create_time >= ? GROUP BY d
             UNION ALL SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c FROM files WHERE del_flag = 0 AND create_time >= ? GROUP BY d
           ) t GROUP BY d`,
          [weekAgo, weekAgo, weekAgo],
        )
        .catch(() => [[]]),
    ]);

    // AI 消耗单独兜底(agent_logs 若某环境未建表,不拖垮整个看板)
    let ai = { todayCount: 0, todayTokens: 0, todayCost: '0.0000', totalCount: 0, totalTokens: 0, totalCost: '0.0000' };
    try {
      const [[aiToday], [aiTotal]] = await Promise.all([
        pool.query(
          'SELECT COUNT(*) AS count, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(cost),0) AS cost FROM agent_logs WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)',
          [today, today],
        ),
        pool.query('SELECT COUNT(*) AS count, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(cost),0) AS cost FROM agent_logs'),
      ]);
      ai = {
        todayCount: Number(aiToday[0].count), todayTokens: Number(aiToday[0].tokens), todayCost: Number(aiToday[0].cost).toFixed(4),
        totalCount: Number(aiTotal[0].count), totalTokens: Number(aiTotal[0].tokens), totalCost: Number(aiTotal[0].cost).toFixed(4),
      };
    } catch (aiErr) {
      console.error('[AdminOverview] AI 统计失败(忽略):', aiErr.message);
    }

    // 趋势按天补零成 7 天序列(展示 MM-DD)
    const userMap = Object.fromEntries((userTrendRows[0] || []).map((x) => [x.d, Number(x.c)]));
    const contentMap = Object.fromEntries((contentTrendRows[0] || []).map((x) => [x.d, Number(x.c)]));
    const trend = days.map((d) => ({ d: d.slice(5), users: userMap[d] || 0, content: contentMap[d] || 0 }));

    const u = userAgg[0][0], r = resAgg[0][0], c = convAgg[0][0], o = opinionAgg[0][0], s = securityAgg[0][0], a = activeAgg[0][0], sys = sysAgg[0][0];
    res.send(
      resultData({
        users: { total: Number(u.total || 0), today: Number(u.today || 0) },
        active: { today: Number(a.activeToday || 0), week: Number(a.active7d || 0) },
        resources: {
          bookmarkTotal: Number(r.bookmarkTotal || 0), noteTotal: Number(r.noteTotal || 0), fileTotal: Number(r.fileTotal || 0),
          bookmarkToday: Number(r.bookmarkToday || 0), noteToday: Number(r.noteToday || 0), fileToday: Number(r.fileToday || 0),
          storageMb: Number(r.storageMb || 0), trashMb: Number(r.trashMb || 0), trashCount: Number(r.trashCount || 0),
        },
        ai,
        conversion: { visitors: Number(c.visitors || 0), registers: Number(c.registers || 0) },
        system: { apiToday: Number(sys.total || 0), apiErrorsToday: Number(sys.errors || 0) },
        pending: { opinion: Number(o.pending || 0), security: Number(s.unhandled || 0) },
        trend,
        generatedAt: `${today} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      }),
    );
  } catch (e) {
    console.error('获取后台总览失败:', e.message);
    res.send(resultData(null, 500, '获取后台总览失败: ' + e.message));
  }
};

export const getAgentLogs = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'root') {
      return res.send(resultData(null, 403, '仅管理员可查看'));
    }

    const { keyword, pageSize = 20, currentPage = 1 } = req.body || {};
    const take = Math.min(Math.max(pageSize || 20, 1), 100);
    const offset = take * (Math.max(currentPage || 1, 1) - 1);

    let where = '1=1';
    const params = [];

    if (keyword) {
      where += ' AND (question LIKE ? OR user_alias LIKE ? OR tools_used LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [[rows], [countRes]] = await Promise.all([
      pool.query(
        `SELECT * FROM agent_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, take, offset],
      ),
      pool.query(
        `SELECT COUNT(*) as total FROM agent_logs WHERE ${where}`,
        params,
      ),
    ]);

    res.send(resultData({
      items: rows,
      total: countRes[0].total,
      currentPage,
      pageSize: take,
    }));
  } catch (e) {
    res.send(resultData(null, 500, '查询失败: ' + e.message));
  }
};
