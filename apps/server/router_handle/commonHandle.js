import { resultData, snakeCaseKeys, insertData, generateUUID } from '../util/common.js';
import https from 'https';
import fs from 'fs';
import fsP from 'fs/promises';
import path from 'path';
import pool from '../db/index.js';
import { validateQueryParams } from '../util/request.js';

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
    const { key, filter_root: filterRoot } = filters;
    const ROOT_ID = '453c9c95-9b2e-11ef-9d4d-84a93e80c16e';

    const baseWhere = `(u.alias LIKE CONCAT('%', ?, '%') OR a.ip LIKE CONCAT('%', ?, '%') OR a.url LIKE CONCAT('%', ?, '%')) AND a.del_flag = 0`;
    const rootFilter = filterRoot ? ` AND a.user_id != '${ROOT_ID}'` : '';
    const whereClause = baseWhere + rootFilter;

    const [result] = await pool.query(
      `SELECT a.*, u.alias, u.email FROM api_logs a LEFT JOIN user u ON a.user_id = u.id WHERE ${whereClause} ORDER BY a.request_time DESC LIMIT ? OFFSET ?`,
      [key, key, key, pageSize, skip],
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
      [key, key, key],
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
    const log = {
      createBy: userId,
      ...req.body,
      del_flag: 0,
    };
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

export const getOperationLogs = (req, res) => {
  try {
    const { filters, pageSize, currentPage } = req.body;
    const skip = pageSize * (currentPage - 1);
    // 查询总数据条数
    pool
      .query(
        `SELECT o.*, u.alias,u.email
FROM operation_logs o
LEFT JOIN user u ON o.create_by = u.id
WHERE (u.alias LIKE CONCAT('%', ?, '%') 
OR o.operation LIKE CONCAT('%', ?, '%') 
OR o.module LIKE CONCAT('%', ?, '%')) 
AND o.del_flag = 0 AND u.alias!='菠萝'
ORDER BY o.create_time DESC
LIMIT ? OFFSET ?;
`,
        [filters.key, filters.key, filters.key, pageSize, skip],
      )
      .then(async ([result]) => {
        const totalSql = `SELECT COUNT(*) FROM operation_logs o left join user u on o.create_by=u.id WHERE 
(u.alias LIKE CONCAT('%', ?, '%') 
OR o.operation LIKE CONCAT('%', ?, '%') 
OR o.module LIKE CONCAT('%', ?, '%'))
AND o.del_flag=0 AND u.alias!='菠萝'`;
        const [totalRes] = await pool.query(totalSql, [filters.key, filters.key, filters.key]);
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

// 定义支持的图片类型及其对应的扩展名
const imageMimeTypes = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
};

// 默认图片路径（可选）
const defaultImagePath = '/uploads/default-icon.png';

export const analyzeImgUrl = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const promises = req.body.map(async (bookmark) => {
      if (bookmark.noCache) {
        return new Promise((resolve, reject) => {
          const fileBuffer = [];
          const options = {
            hostname: 'ico.kucat.cn',
            path: '/get.php?url=' + encodeURIComponent(bookmark.url),
            method: 'GET',
            rejectUnauthorized: false,
          };
          https
            .get(options, (response) => {
              const contentType = response.headers['content-type'];
              response.on('data', (chunk) => {
                fileBuffer.push(chunk);
              });
              response.on('end', async () => {
                try {
                  const buffer = Buffer.concat(fileBuffer);
                  // 确定文件扩展名
                  let fileExtension = 'png';
                  const mimeType = Object.entries(imageMimeTypes).find(([key, value]) =>
                    contentType?.includes(key),
                  )?.[1];
                  if (mimeType) {
                    fileExtension = mimeType;
                  }

                  const fileName = `bookmark-${bookmark.id}.${fileExtension}`;
                  const uploadDir = '/www/wwwroot/images';

                  // 确保目录存在
                  await fsP.mkdir(uploadDir, { recursive: true });

                  // 写入文件
                  const imagePath = path.join(uploadDir, fileName);
                  await fsP.writeFile(imagePath, buffer);

                  // 生成URL
                  const imageUrl = `https://${req.get('host')}/uploads/${fileName}`;

                  // 更新数据库中的 icon_url 字段为生成的URL
                  const insertIconUrlSql = `UPDATE bookmark SET icon_url=? WHERE id=?`;
                  await connection.query(insertIconUrlSql, [imageUrl, bookmark.id]);

                  // 返回图片的 URL
                  resolve(imageUrl);
                } catch (err) {
                  console.error('处理过程中出错:', err);
                  // 返回默认图片的 URL
                  resolve(`${req.protocol}://${req.get('host')}${defaultImagePath}`);
                }
              });
            })
            .on('error', (err) => {
              console.error('Error downloading file:', err);
              // 返回默认图片的 URL
              reject(`${req.protocol}://${req.get('host')}${defaultImagePath}`);
            });
        });
      }
    });

    const results = await Promise.all(promises);
    res.send(resultData(results, 200, '所有图标已更新成功'));
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
    if (req.body.name) {
      fileList = fileList.filter((file) => {
        return file.name.includes(req.body.name);
      });
    }
    res.send(
      resultData({
        items: {
          images: images,
          usedImages: fileList.filter((file) => {
            return images.some((data) => {
              if (typeof data === 'string') {
                return data.includes(file.name);
              }
              return false;
            });
          }),
          unUsedImages: fileList.filter((file) => {
            return !images.some((data) => {
              if (typeof data === 'string') {
                return data.includes(file.name);
              }
              return false;
            });
          }),
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
