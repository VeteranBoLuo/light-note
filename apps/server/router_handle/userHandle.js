import pool from '../db/index.js';
import { resultData, snakeCaseKeys, mergeExistingProperties, insertData, generateUUID } from '../util/common.js';
import { RESOURCE_TYPE, insertResourceTagRelations } from '../util/resourceTags.js';
import request from '../http/request.js';
import { fetchWithTimeout, validateQueryParams } from '../util/request.js';
import { verifyPassword, hashPassword } from '../util/password.js';
import nodeMail from '../util/nodemailer.js';
import { issueLoginSession, logoutCurrentSession, ensureNotVisitor } from '../util/auth.js';
import { removeUserSessions } from '../util/sessionStore.js';
import { getClientIp } from '../util/security/requestContext.js';
import { getIpReputation } from '../util/security/services/ipReputation.js';
let redisClient;
if (process.platform === 'linux') {
  redisClient = (await import('../util/redisClient.js')).default;
}

const isActiveIpBan = (ipReputation) => {
  const bannedUntil = ipReputation?.banned_until ? new Date(ipReputation.banned_until).getTime() : 0;
  return Number(ipReputation?.is_banned || 0) === 1 && bannedUntil > Date.now();
};

const queryUserInfoById = async (id) => {
  const [result] = await pool.query(
    `
      SELECT 
        u.*,
        COALESCE(b.bookmark_count, 0) AS bookmarkTotal,
        COALESCE(t.tag_count, 0) AS tagTotal,
        COALESCE(n.note_count, 0) AS noteTotal,
        COALESCE(o.opinion_count, 0) AS opinionTotal,
        COALESCE(op.pending_opinion_count, 0) AS pendingOpinionTotal,
        COALESCE(ou.unread_reply_count, 0) AS unreadOpinionReplyTotal,
        COALESCE(f.storage_used, 0) AS storageUsed
      FROM user u
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS bookmark_count
        FROM bookmark
        WHERE del_flag = 0
        GROUP BY user_id
      ) b ON u.id = b.user_id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS tag_count
        FROM tag
        WHERE del_flag = 0
        GROUP BY user_id
      ) t ON u.id = t.user_id
      LEFT JOIN (
        SELECT create_by, COUNT(*) AS note_count
        FROM note
        WHERE del_flag = 0
        GROUP BY create_by
      ) n ON u.id = n.create_by
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS opinion_count
        FROM opinion
        WHERE del_flag = 0
        GROUP BY user_id
      ) o ON u.id = o.user_id
      LEFT JOIN (
        SELECT COUNT(*) AS pending_opinion_count
        FROM opinion
        WHERE del_flag = 0 AND status = 'pending'
      ) op ON 1=1
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS unread_reply_count
        FROM opinion
        WHERE del_flag = 0 AND status = 'replied' AND reply_viewed = 0
        GROUP BY user_id
      ) ou ON u.id = ou.user_id
      LEFT JOIN (
        SELECT create_by, ROUND(SUM(file_size) / 1048576, 2) AS storage_used
        FROM files
        WHERE del_flag = 0
        GROUP BY create_by
      ) f ON u.id = f.create_by
      WHERE u.id = ?
    `,
    [id],
  );
  return result[0] || null;
};

const sanitizeUser = (user) => {
  if (!user) return user;
  const safeUser = { ...user };
  safeUser.password = safeUser.password ? '******' : '';
  return safeUser;
};

export const login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    const ipReputation = await getIpReputation(getClientIp(req));
    const isIpBanned = isActiveIpBan(ipReputation);
    const [result] = await pool.query('SELECT * FROM user WHERE email = ?', [email]);
    if (result.length === 0 || !verifyPassword(password, result[0].password)) {
      if (isIpBanned) {
        res.send(resultData(null, 403, 'IP 已处于封禁期，禁止登录'));
        return;
      }
      res.send(resultData(null, 401, '邮箱密码错误或已过期，请重新输入正确信息或者注册新账号'));
      return;
    }
    const isRootLogin = result[0].role === 'root';
    if (isIpBanned && !isRootLogin) {
      res.send(resultData(null, 403, 'IP 已处于封禁期，禁止登录'));
      return;
    }
    if (Number(result[0].del_flag) === 1 && !isRootLogin) {
      res.send(resultData(null, 423, '账号已被封禁，请登录其他账号或联系管理员'));
      return;
    }
    // 透明升级：老明文密码 → scrypt 哈希
    if (result[0].password_method === 'plain' && result[0].password) {
      const upgradedHash = hashPassword(result[0].password);
      pool.query("UPDATE user SET password = ?, password_method = 'scrypt' WHERE id = ?", [
        upgradedHash,
        result[0].id,
      ]).catch(() => {}); // 非关键操作，静默忽略
    }
    const sid = await issueLoginSession(req, res, result[0], Boolean(rememberMe));
    const userInfo = await queryUserInfoById(result[0].id);
    res.send(resultData({ ...sanitizeUser(userInfo), sid }));
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e.message));
  }
};

export const registerUser = async (req, res) => {
  try {
    // 检查邮箱是否已存在
    const [existingUser] = await pool.query('SELECT * FROM user WHERE email = ?', [req.body.email]);
    if (existingUser?.length > 0) {
      return res.send(resultData(null, 500, '账号已存在'));
    }

    // 准备用户数据
    const params = req.body;
    params.preferences = JSON.stringify({ theme: 'day', noteViewMode: 'card' });
    if (params.password) {
      params.password = hashPassword(params.password);
      params.password_method = 'scrypt';
    }

    // 插入新用户
    const userData = insertData(params);
    await pool.query('INSERT INTO user SET ?', [userData]);
    const userId = userData.id;

    // 创建示例数据（非关键操作，失败不影响注册）
    try {
      // 默认书签
      const bookmarkData = {
        name: 'iconify',
        userId: userId,
        url: 'https://icon-sets.iconify.design/',
        description: '全球最大的免费图标网站之一',
      };
      const bmData = insertData(bookmarkData);
      await pool.query('INSERT INTO bookmark SET ?', [bmData]);
      const bookmarkId = bmData.id;

      // 示例标签
      const tagData = {
        name: '示例标签',
        userId: userId,
        iconUrl:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMTYgMTYiPjxwYXRoIGZpbGw9IiM2YzgyZmYiIGQ9Ik02LjkyMyAxLjM3OGEzIDMgMCAwIDEgMi4xNTQgMGw0Ljk2MiAxLjkwOGExLjUgMS41IDAgMCAxIC45NjEgMS40djYuNjI2YTEuNSAxLjUgMCAwIDEtLjk2MSAxLjRsLTQuOTYyIDEuOTA5YTMgMyAwIDAgMS0yLjE1NCAwbC00Ljk2MS0xLjkwOWExLjUgMS41IDAgMCAxLS45NjItMS40VjQuNjg2YTEuNSAxLjUgMCAwIDEgLjk2Mi0xLjR6bTEuNzk1LjkzM2EyIDIgMCAwIDAtMS40MzYgMGwtMS4zODQuNTMzbDUuNTkgMi4xMTZsMS45NDgtLjgzNHpNMTQgNC45NzFMOC41IDcuMzN2Ni40MjhxLjExLS4wMjguMjE4LS4wN2w0Ljk2Mi0xLjkwOGEuNS41IDAgMCAwIC4zMi0uNDY3em0tNi41IDguNzg2VjcuMzNMMiA0Ljk3MnY2LjM0YS41LjUgMCAwIDAgLjMyLjQ2N2w0Ljk2MiAxLjkwOHEuMTA3LjA0Mi4yMTguMDdNMi41NjQgNC4xMjZMOCA2LjQ1NmwyLjE2NC0uOTI4bC01LjY2Ny0yLjE0NnoiLz48L3N2Zz4=',
        sort: 0,
      };
      const tgData = insertData(tagData);
      await pool.query('INSERT INTO tag SET ?', [tgData]);
      const tagId = tgData.id;

      await insertResourceTagRelations(pool, {
        tagIds: [tagId],
        resourceType: RESOURCE_TYPE.BOOKMARK,
        resourceId: bookmarkId,
        userId,
      });

      // 无标签书签
      const bookmarkData2 = {
        name: '示例书签',
        userId: userId,
        url: 'https://example.com',
        description: '这是一个示例书签，没有关联标签',
      };
      await pool.query('INSERT INTO bookmark SET ?', [insertData(bookmarkData2)]);

      // 无书签标签
      const tagData2 = {
        name: '示例标签2',
        userId: userId,
        iconUrl:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMTYgMTYiPjxwYXRoIGZpbGw9IiM2YzgyZmYiIGQ9Ik02LjkyMyAxLjM3OGEzIDMgMCAwIDEgMi4xNTQgMGw0Ljk2MiAxLjkwOGExLjUgMS41IDAgMCAxIC45NjEgMS40djYuNjI2YTEuNSAxLjUgMCAwIDEtLjk2MSAxLjRsLTQuOTYyIDEuOTA5YTMgMyAwIDAgMS0yLjE1NCAwbC00Ljk2MS0xLjkwOWExLjUgMS41IDAgMCAxLS45NjItMS40VjQuNjg2YTEuNSAxLjUgMCAwIDEgLjk2Mi0xLjR6bTEuNzk1LjkzM2EyIDIgMCAwIDAtMS40MzYgMGwtMS4zODQuNTMzbDUuNTkgMi4xMTZsMS45NDgtLjgzNHpNMTQgNC45NzFMOC41IDcuMzN2Ni40MjhxLjExLS4wMjguMjE4LS4wN2w0Ljk2Mi0xLjkwOGEuNS41IDAgMCAwIC4zMi0uNDY3em0tNi41IDguNzg2VjcuMzNMMiA0Ljk3MnY2LjM0YS41LjUgMCAwIDAgLjMyLjQ2N2w0Ljk2MiAxLjkwOHEuMTA3LjA0Mi4yMTguMDdNMi41NjQgNC4xMjZMOCA2LjQ1NmwyLjE2NC0uOTI4bC01LjY2Ny0yLjE0NnoiLz48L3N2Zz4=',
        sort: 1,
      };
      await pool.query('INSERT INTO tag SET ?', [insertData(tagData2)]);

      // 示例笔记
      const noteData = {
        title: '示例笔记',
        content: '<p>这是您的第一条笔记，欢迎使用轻笺！</p>',
        createBy: userId,
      };
      await pool.query('INSERT INTO note SET ?', [insertData(noteData)]);
    } catch (err) {
      console.error('创建示例数据失败，但不影响注册:', err.message);
    }

    // 记录日志（非关键，失败不影响注册）
    try {
      const system = JSON.stringify({
        browser: req.headers['browser'] ?? '未知',
        os: req.headers['os'] ?? '未知',
        fingerprint: req.headers['fingerprint'] ?? '未知',
      });
      const requestPayload = JSON.stringify(req.method === 'GET' ? req.query : req.body);
      const log = {
        userId: userId,
        method: req.method,
        url: req.originalUrl,
        req: requestPayload === '{}' ? '' : requestPayload,
        ip: getClientIp(req) || '未知',
        system: system,
        del_flag: 0,
      };
      await pool.query('INSERT INTO api_logs SET ?', [insertData(log)]);
    } catch (err) {
      console.error('注册日志更新错误:', err.message);
    }

    res.send(resultData(null, 200, '注册成功'));
  } catch (err) {
    console.error('注册过程中发生错误:', err);
    if (err.message.includes('邮箱') || err.message.includes('账号')) {
      res.send(resultData(null, 500, err.message));
    } else {
      res.send(resultData(null, 500, '服务器内部错误: ' + err.message));
    }
  }
};
export const getUserInfo = async (req, res) => {
  try {
    const requestedId = req.query?.id || req.query?.params?.id;
    const id = req.user?.role === 'root' && requestedId ? requestedId : req.user?.id;
    if (!id) {
      res.send(resultData(null, 401, '请先登录'));
      return;
    }
    const [userRes] = await pool.query('SELECT * FROM user WHERE id = ?', [id]);
    if (!userRes[0]) {
      res.send(resultData(null, 401, '用户不存在,请重新登录！'));
      return;
    }
    // 没有储存ip或者ip地址改变，则更新用户ip相关信息
    const clientIp = getClientIp(req);
    if (clientIp && (userRes[0].ip === null || userRes[0].ip !== clientIp)) {
      const { data } = await request.get(
        `https://restapi.amap.com/v3/ip?ip=${clientIp}&key=${process.env.AMAP_API_KEY}`,
      );
      const location = {
        city: data.city ?? '接口错误，获取失败',
        province: data.province ?? '接口错误，获取失败',
        rectangle: data.rectangle ?? '接口错误，获取失败',
      };
      try {
        await pool.query('update user set location=? , ip=? where id=?', [
          JSON.stringify(location),
          clientIp,
          id,
        ]);
      } catch (e) {
        console.error('地理信息配置失败:', e.message);
        // 不发送响应，继续执行获取用户信息
      }
    }
    const result = await queryUserInfoById(id);
    if (!result) {
      res.send(resultData(null, 401, '用户不存在,请重新登录！'));
      return;
    }
    if (Number(result.del_flag) === 1 && result.role !== 'root') {
      res.send(resultData(null, 423, '账号已被封禁，请登录其他账号或联系管理员'));
      return;
    }
    const safeUser = sanitizeUser(result);
    if (safeUser.role === 'visitor') {
      res.send(resultData(safeUser, 'visitor'));
    } else {
      res.send(resultData(safeUser));
    }
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e)); // 设置状态码为400
  }
};

export const me = getUserInfo;
export const getUserList = (req, res) => {
  try {
    if (req.user?.role !== 'root') {
      return res.send(resultData(null, 403, '没有操作权限'));
    }
    const { filters, pageSize, currentPage } = validateQueryParams(req.body);
    const key = filters.key;
    const skip = pageSize * (currentPage - 1);
    let sql = `
      SELECT 
        u.id,
        u.alias,
        u.email,
        u.phone_number,
        u.role,
        u.ip,
        u.create_time,
        u.del_flag,
        COALESCE(b.bookmark_count, 0) AS bookmarkTotal,
        COALESCE(t.tag_count, 0) AS tagTotal,
        COALESCE(n.note_count, 0) AS noteTotal,
        COALESCE(f.storage_used, 0) AS storageUsed,
        GREATEST(op.max_op_time, ap.max_api_time) AS lastActiveTime
      FROM user u
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS bookmark_count
        FROM bookmark
        WHERE del_flag = 0
        GROUP BY user_id
      ) b ON u.id = b.user_id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS tag_count
        FROM tag
        WHERE del_flag = 0
        GROUP BY user_id
      ) t ON u.id = t.user_id
      LEFT JOIN (
        SELECT create_by, COUNT(*) AS note_count
        FROM note
        WHERE del_flag = 0
        GROUP BY create_by
      ) n ON u.id = n.create_by
      LEFT JOIN (
        SELECT create_by, ROUND(SUM(file_size) / 1048576, 2) AS storage_used
        FROM files
        WHERE del_flag = 0
        GROUP BY create_by
      ) f ON u.id = f.create_by
      LEFT JOIN (
        SELECT create_by AS user_id, MAX(create_time) AS max_op_time
        FROM operation_logs
        WHERE del_flag = 0
        GROUP BY create_by
      ) op ON u.id = op.user_id
      LEFT JOIN (
        SELECT user_id, MAX(request_time) AS max_api_time
        FROM api_logs
        WHERE del_flag = 0
        GROUP BY user_id
      ) ap ON u.id = ap.user_id
      WHERE u.del_flag = 0 AND (u.alias LIKE CONCAT('%', ?, '%') OR u.email LIKE CONCAT('%', ?, '%'))
      ORDER BY u.create_time DESC
      LIMIT ? OFFSET ?
    `;
    pool
      .query(sql, [key, key, pageSize, skip])
      .then(async ([result]) => {
        const [totalRes] = await pool.query(
          "SELECT COUNT(*) FROM user WHERE del_flag=0 AND (alias LIKE CONCAT('%', ?, '%') OR email LIKE CONCAT('%', ?, '%'))",
          [key, key],
        );
        res.send(
          resultData({
            items: result,
            total: totalRes[0]['COUNT(*)'],
          }),
        );
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误' + err)); // 设置状态码为500
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常' + e)); // 设置状态码为400
  }
};

export const saveUserInfo = (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const targetId = req.body.id || req.user?.id;
    const isRoot = req.user?.role === 'root';
    const id = isRoot ? targetId : req.user?.id;
    if (!id || (!isRoot && req.body.id && req.body.id !== req.user?.id)) {
      return res.send(resultData(null, 403, '没有操作权限'));
    }
    // 定义允许更新的字段列表
    const selfAllowedFields = [
      'alias',
      'email',
      'phone_number',
      'location',
      'preferences',
      'head_picture',
    ];
    const rootAllowedFields = [
      ...selfAllowedFields,
      'password',
      'role',
      'ip',
      'del_flag',
      'github_id',
      'login_type',
    ];
    const allowedFields = isRoot ? rootAllowedFields : selfAllowedFields;
    // 过滤请求体，只保留允许的字段
    const filteredBody = snakeCaseKeys(mergeExistingProperties(req.body, [], ['id']));
    const finalBody = {};
    allowedFields.forEach((field) => {
      if (filteredBody[field] !== undefined) {
        finalBody[field] = filteredBody[field];
      }
    });
    pool
      .query('update user set ? where id=?', [finalBody, id])
      .then(([result]) => {
        res.send(resultData(result));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message)); // 设置状态码为500
      });
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e)); // 设置状态码为400
  }
};

export const deleteUserById = (req, res) => {
  try {
    if (req.user?.role !== 'root') {
      return res.send(resultData(null, 403, '没有操作权限'));
    }
    pool
      .query('update user set del_flag=1 where id=?', [req.query.id])
      .then(async ([result]) => {
        await removeUserSessions(req.query.id);
        res.send(resultData(result));
      })
      .catch((err) => res.send(resultData(null, 500, '服务器内部错误: ' + err.message)));
  } catch (e) {
    res.send(resultData(null, 400, '客户端请求异常：' + e)); // 设置状态码为400
  }
};

export const github = async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing authorization code' });

  try {
    // 1. 用 code 换取 GitHub Token
    const tokenData = await fetchGitHubToken(code);
    if (!tokenData.access_token) throw new Error('Failed to obtain access token');

    // 2. 获取基础用户信息和邮箱信息
    const [baseUser, email] = await Promise.all([
      getGitHubUser(tokenData.access_token),
      getGitHubEmail(tokenData.access_token), // 单独获取邮箱
    ]);
    const safeEmail = email || `${baseUser.login}@users.noreply.github.com`;
    // 合并用户对象
    const githubUser = { ...baseUser, email: safeEmail };

    // 3. 数据库操作（查找/创建用户）
    const user = await handleUserDatabaseOperation(githubUser);
    const sid = await issueLoginSession(req, res, user, true);

    res.send(
      resultData({
        ...({ sid }),
        user_info: {
          id: user.id,
          alias: user.alias,
          head_picture: user.head_picture,
          role: user.role ?? 'admin',
        },
        requires_email: !githubUser.email, // 标识是否需要补全邮箱
      }),
    );
  } catch (error) {
    console.error('GitHub Auth Error:', error);
    res.send(resultData(null, 500, 'GitHub认证失败：' + error));
  }
};

export const logout = async (req, res) => {
  try {
    await logoutCurrentSession(req, res);
    res.send(resultData(null, 200, '退出成功'));
  } catch (e) {
    res.send(resultData(null, 500, '退出登录失败：' + e.message));
  }
};

// --- 工具函数 ---
const fetchGitHubToken = async (code) => {
  const params = new URLSearchParams();
  params.append('client_id', process.env.GITHUB_CLIENT_ID); // 改用环境变量
  params.append('client_secret', process.env.GITHUB_CLIENT_SECRET);
  params.append('code', code);

  try {
    const response = await fetchWithTimeout(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: params,
      },
      8000, // 8秒超时
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GitHub token request failed: ${response.status} - ${errorBody}`);
    }
    return response.json();
  } catch (error) {
    console.error('fetchGitHubToken Error:', error.message);
    throw error;
  }
};

const getGitHubUser = async (accessToken) => {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'MyApp',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }
  return response.json();
};

// 新增：专门获取邮箱的API调用
const getGitHubEmail = async (accessToken, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        'https://api.github.com/user/emails',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
        5000, // 5秒超时
      );

      if (!response.ok) continue; // 重试

      const emails = await response.json();
      const primaryEmail = emails.find((e) => e.primary && e.verified);
      return primaryEmail?.email || null;
    } catch (error) {
      if (attempt === retries) {
        console.warn('Fallback to no-reply email after retries');
        return null; // 由调用方统一降级
      }
    }
  }
};

const handleUserDatabaseOperation = async (githubUser) => {
  // 邮箱降级策略：使用GitHub提供的备用邮箱格式
  const safeEmail = githubUser.email || `${githubUser.login}@users.noreply.github.com`;
  // 1. 优先使用github_id查询
  const [existingByGithub] = await pool.query(`SELECT * FROM user WHERE github_id = ? LIMIT 1`, [githubUser.id]);
  if (existingByGithub.length > 0) return existingByGithub[0];

  // 2. 使用邮箱查询现有账户
  const [existingByEmail] = await pool.query(`SELECT * FROM user WHERE email = ? LIMIT 1`, [safeEmail]);

  if (existingByEmail.length > 0) {
    // 绑定GitHub ID到现有账户
    await pool.query(`UPDATE user SET github_id = ?, login_type = 'github' WHERE id = ?`, [
      githubUser.id,
      existingByEmail[0].id,
    ]);

    // 返回更新后的完整用户数据
    const [updatedUser] = await pool.query(`SELECT * FROM user WHERE id = ? LIMIT 1`, [existingByEmail[0].id]);
    return updatedUser[0];
  }

  // 3. 创建新用户
  const githubUserId = generateUUID();
  const githubHashedPassword = hashPassword('123456');
  await pool.query(
    `INSERT INTO user
      (id, email, github_id, login_type, head_picture, password, password_method, alias)
     VALUES (?, ?, ?, 'github', ?, ?, 'scrypt', ?)`,
    [githubUserId, safeEmail, githubUser.id, githubUser.avatar_url, githubHashedPassword, githubUser.login],
  );
  const [result] = await pool.query(`SELECT * FROM user WHERE github_id = ? LIMIT 1`, [githubUser.id]);

  // 创建示例数据（非关键操作，失败不影响注册）
  try {
    const userId = result[0].id;

    // 默认书签
    const bookmarkData = {
      name: 'iconify',
      userId: userId,
      url: 'https://icon-sites.iconify.design/',
      description: '全球最大的免费图标网站之一',
    };
    const bmData = insertData(bookmarkData);
    await pool.query('INSERT INTO bookmark SET ?', [bmData]);
    const bookmarkId = bmData.id;

    // 示例标签
    const tagData = {
      name: '示例标签',
      userId: userId,
      iconUrl:
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMTYgMTYiPjxwYXRoIGZpbGw9IiM2YzgyZmYiIGQ9Ik02LjkyMyAxLjM3OGEzIDMgMCAwIDEgMi4xNTQgMGw0Ljk2MiAxLjkwOGExLjUgMS41IDAgMCAxIC45NjEgMS40djYuNjI2YTEuNSAxLjUgMCAwIDEtLjk2MSAxLjRsLTQuOTYyIDEuOTA5YTMgMyAwIDAgMS0yLjE1NCAwbC00Ljk2MS0xLjkwOWExLjUgMS41IDAgMCAxLS45NjItMS40VjQuNjg2YTEuNSAxLjUgMCAwIDEgLjk2Mi0xLjR6bTEuNzk1LjkzM2EyIDIgMCAwIDAtMS40MzYgMGwtMS4zODQuNTMzbDUuNTkgMi4xMTZsMS45NDgtLjgzNHpNMTQgNC45NzFMOC41IDcuMzN2Ni40MjhxLjExLS4wMjguMjE4LS4wN2w0Ljk2Mi0xLjkwOGEuNS41IDAgMCAwIC4zMi0uNDY3em0tNi41IDguNzg2VjcuMzNMMiA0Ljk3MnY2LjM0YS41LjUgMCAwIDAgLjMyLjQ2N2w0Ljk2MiAxLjkwOHEuMTA3LjA0Mi4yMTguMDdNMi41NjQgNC4xMjZMOCA2LjQ1NmwyLjE2NC0uOTI4bC01LjY2Ny0yLjE0NnoiLz48L3N2Zz4=',
      sort: 0,
    };
    const tgData = insertData(tagData);
    await pool.query('INSERT INTO tag SET ?', [tgData]);
    const tagId = tgData.id;

    await insertResourceTagRelations(pool, {
      tagIds: [tagId],
      resourceType: RESOURCE_TYPE.BOOKMARK,
      resourceId: bookmarkId,
      userId,
    });

    // 无标签书签
    const bookmarkData2 = {
      name: '示例书签',
      userId: userId,
      url: 'https://example.com',
      description: '这是一个示例书签，没有关联标签',
    };
    await pool.query('INSERT INTO bookmark SET ?', [insertData(bookmarkData2)]);

    // 无书签标签
    const tagData2 = {
      name: '示例标签2',
      userId: userId,
      iconUrl:
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMTYgMTYiPjxwYXRoIGZpbGw9IiM2YzgyZmYiIGQ9Ik02LjkyMyAxLjM3OGEzIDMgMCAwIDEgMi4xNTQgMGw0Ljk2MiAxLjkwOGExLjUgMS41IDAgMCAxIC45NjEgMS40djYuNjI2YTEuNSAxLjUgMCAwIDEtLjk2MSAxLjRsLTQuOTYyIDEuOTA5YTMgMyAwIDAgMS0yLjE1NCAwbC00Ljk2MS0xLjkwOWExLjUgMS41IDAgMCAxLS45NjItMS40VjQuNjg2YTEuNSAxLjUgMCAwIDEgLjk2Mi0xLjR6bTEuNzk1LjkzM2EyIDIgMCAwIDAtMS40MzYgMGwtMS4zODQuNTMzbDUuNTkgMi4xMTZsMS45NDgtLjgzNHpNMTQgNC45NzFMOC41IDcuMzN2Ni40MjhxLjExLS4wMjguMjE4LS4wN2w0Ljk2Mi0xLjkwOGEuNS41IDAgMCAwIC4zMi0uNDY3em0tNi41IDguNzg2VjcuMzNMMiA0Ljk3MnY2LjM0YS41LjUgMCAwIDAgLjMyLjQ2N2w0Ljk2MiAxLjkwOHEuMTA3LjA0Mi4yMTguMDdNMi41NjQgNC4xMjZMOCA2LjQ1NmwyLjE2NC0uOTI4bC01LjY2Ny0yLjE0NnoiLz48L3N2Zz4=',
      sort: 1,
    };
    await pool.query('INSERT INTO tag SET ?', [insertData(tagData2)]);

    // 示例笔记
    const noteData = {
      title: '示例笔记',
      content: '<p>这是您的第一条笔记，欢迎使用轻笺！</p>',
      createBy: userId,
    };
    await pool.query('INSERT INTO note SET ?', [insertData(noteData)]);
  } catch (err) {
    console.error('创建示例数据失败，但不影响注册:', err.message);
  }

  // 返回新插入的完整用户数据
  return result[0];
};

// 修改密码或者设置密码configPassword

export const configPassword = async (req, res) => {
  try {
    const id = req.user?.id; // 获取用户ID
    if (!id || req.user?.role === 'visitor') {
      return res.send(resultData(null, 401, '请先登录'));
    }
    const { password, type } = req.body;
    const [oldUser] = await pool.query(`SELECT * FROM user WHERE id = ? LIMIT 1`, [id]);
    if (type === 'update') {
      const { oldPassword } = req.body;
      if (!verifyPassword(oldPassword, oldUser[0].password)) {
        throw new Error('原密码错误');
      }
      if (verifyPassword(password, oldUser[0].password)) {
        throw new Error('新密码不能与原密码相同');
      }
    }
    const hashedPassword = hashPassword(password);
    pool
      .query('update user set password=?, password_method=? where id=?', [hashedPassword, 'scrypt', id])
      .then(async ([result]) => {
        await removeUserSessions(id);
        await logoutCurrentSession(req, res);
        res.send(resultData(result));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message)); // 设置状态码为500
      });
  } catch (e) {
    res.send(resultData(null, 400, e.message)); // 设置状态码为400
  }
};

// 发送验证码接口
export const sendEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6位数字验证码

    // 1. 存储验证码到Redis（5分钟过期）
    await redisClient.setEx(`email:code:${email}`, 300, code);

    // 2. 发送邮件
    const mailOptions = {
      from: '"轻笺"<1902013368@qq.com>',
      to: email,
      subject: '【轻笺】验证邮件',
      html: `
        <p>您好！</p>
        <p>您的验证码是：<strong style="color:orangered;">${code}</strong></p>
        <p>有效期5分钟，请勿泄露</p>
        <p>如果不是您本人操作，请无视此邮件</p>
      `,
    };

    await nodeMail.sendMail(mailOptions);
    res.send(resultData('验证码发送成功'));
  } catch (e) {
    console.error('邮件发送异常:', e);
    res.send(resultData(null, 500, '邮件发送失败:' + e.message)); // 设置状态码为400
  }
};

// 验证验证码接口
export const verifyCode = async (req, res) => {
  try {
    const { email, code, password } = req.body;

    // 1. 从Redis获取存储的验证码
    const storedCode = await redisClient.get(`email:code:${email}`);

    // 2. 验证逻辑
    if (!storedCode) {
      res.send(resultData(null, 400, '验证码已过期或未发送'));
      return;
    }
    if (storedCode !== code) {
      res.send(resultData(null, 400, '验证码错误'));
      return;
    }
    // 3. 验证成功后，删除已用验证码并且设置新密码
    await redisClient.del(`email:code:${email}`);
    const hashedPassword = hashPassword(password);
    pool
      .query('update user set password=?, password_method=? where email=?', [hashedPassword, 'scrypt', email])
      .then(() => {
        res.send(resultData('重置密码成功'));
      })
      .catch((err) => {
        res.send(resultData(null, 500, '服务器内部错误: ' + err.message)); // 设置状态码为500
      });
  } catch (e) {
    res.send(resultData(null, 500, '验证服务异常:' + e.message)); // 设置状态码为400
  }
};
