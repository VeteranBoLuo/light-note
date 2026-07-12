import pool from '../db/index.js';
import { resultData, snakeCaseKeys, mergeExistingProperties, insertData, generateUUID, L, reqLang } from '../util/common.js';
import { grantExp } from '../util/growth.js';
import request from '../http/request.js';
import { fetchWithTimeout, validateQueryParams } from '../util/request.js';
import { fetchGitHubTokenRacing } from '../util/githubOAuth.js';
import { createNotification } from '../util/notification.js';
import { verifyPassword, hashPassword, validatePassword } from '../util/password.js';
import nodeMail from '../util/nodemailer.js';
import crypto from 'crypto';
import { issueLoginSession, logoutCurrentSession, ensureNotVisitor, getRequestSid } from '../util/auth.js';
import { recordConversionEvent } from '../util/conversion.js';
import { removeUserSessions, createSession, listUserSessions, removeSession } from '../util/sessionStore.js';
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
      res.send(
        resultData(
          null,
          401,
          L(
            req,
            '邮箱密码错误或已过期，请重新输入正确信息或者注册新账号',
            'Incorrect or expired email or password. Please re-enter the correct details or register a new account.',
          ),
        ),
      );
      return;
    }
    const isRootLogin = result[0].role === 'root';
    if (isIpBanned && !isRootLogin) {
      res.send(resultData(null, 403, 'IP 已处于封禁期，禁止登录'));
      return;
    }
    if (Number(result[0].del_flag) === 1 && !isRootLogin) {
      // 被封账号「不登录」:不签发登录会话、不设 cookie(否则进 /home 等接口都会报封禁,等于登录了)。
      // 仅创建一个不落 cookie、30 分钟的短期令牌,供封禁页提交申诉时识别身份(前端只在 /user/appeal
      // 请求里用 X-Session-Id 带上)。该令牌命中任何业务接口都会被 accountBanMiddleware 拦成 423,
      // 只有 /user/appeal 白名单可用,所以拿到它也无法访问任何数据。
      const { sid: appealToken } = await createSession({
        userId: result[0].id,
        role: result[0].role || 'visitor',
        maxAgeMs: 30 * 60 * 1000,
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
      });
      res.send(resultData({ appealToken }, 423, L(req, '账号已被封禁，请登录其他账号或联系管理员', 'This account has been banned. Please sign in with another account or contact an administrator.')));
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
    res.send(resultData(null, 400, L(req, '客户端请求异常：', 'Bad request: ') + e.message));
  }
};

// 被封禁用户提交申诉(白名单接口 /user/appeal):服务端强制 type='封禁申诉',只取 content/phone 并限长,
// 复用 opinion(意见反馈)表 → 申诉即反馈的一类,root 在反馈历史里可见并回复。
// 不给通用反馈接口 recordOpinion 开白名单,避免被封用户获得任意写入口(越权)。
export const submitAppeal = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || req.user?.role === 'visitor') {
      return res.send(resultData(null, 403, L(req, '请先登录', 'Please sign in first.')));
    }
    const content = String(req.body?.content || '').trim().slice(0, 500);
    const phone = String(req.body?.phone || '').trim().slice(0, 50);
    if (!content) {
      return res.send(resultData(null, 400, L(req, '请填写申诉内容', 'Please enter your appeal details.')));
    }
    // 防刷:同一用户未处理(pending)的申诉不超过 5 条
    const [pendingRows] = await pool.query(
      "SELECT COUNT(*) AS c FROM opinion WHERE user_id = ? AND type = '封禁申诉' AND status = 'pending' AND del_flag = '0'",
      [userId],
    );
    if (Number(pendingRows[0]?.c || 0) >= 5) {
      return res.send(
        resultData(
          null,
          429,
          L(req, '已有多条申诉待处理，请耐心等待管理员回复', 'You already have several pending appeals. Please wait for an administrator to reply.'),
        ),
      );
    }
    const params = insertData({
      userId,
      type: '封禁申诉', // 服务端强制,作为「申诉」类型标记,与普通反馈区分
      content,
      phone,
      status: 'pending',
      replyViewed: 0,
    });
    await pool.query('INSERT INTO opinion SET ?', [params]);
    res.send(resultData(L(req, '申诉已提交，我们会尽快处理', 'Your appeal has been submitted. We will handle it as soon as possible.')));
  } catch (err) {
    res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + err.message));
  }
};

// 注册默认语言:按浏览器 Accept-Language 首选项判断(zh 开头→中文,其余→英文),让老外注册即英文、不必手动切
function detectLangFromReq(req) {
  const first = String(req.headers['accept-language'] || '').split(',')[0].trim().toLowerCase();
  return first.startsWith('zh') ? 'zh-CN' : 'en-US';
}

// 注册欢迎通知:全员群发通知只发给存量用户,后期注册的用户收不到历史通知,靠这条兜底给新用户一条起始通知
function buildWelcomeNotification(lang) {
  if (lang === 'en-US') {
    return {
      type: 'welcome',
      title: 'Welcome to Light Note 🎉',
      content:
        'Great to have you here! Save bookmarks, jot down notes, upload files, and tie them together with tags — with an AI assistant always on hand. Open the menu on the left and start with your very first item ~',
    };
  }
  return {
    type: 'welcome',
    title: '欢迎加入轻笺 🎉',
    content:
      '很高兴见到你!在这里可以收藏书签、记录笔记、上传文件,并用标签把它们串起来,还有 AI 助手随时帮忙。点开左侧菜单,从第一条资源开始整理吧~',
  };
}

export const registerUser = async (req, res) => {
  try {
    // 检查邮箱是否已存在
    const [existingUser] = await pool.query('SELECT * FROM user WHERE email = ?', [req.body.email]);
    if (existingUser?.length > 0) {
      return res.send(resultData(null, 500, L(req, '账号已存在', 'Account already exists.')));
    }
    // 后端密码校验(前端规则可绕过,后端为准):非空、6-64 位
    const pwdCheck = validatePassword(req.body.password, reqLang(req));
    if (!pwdCheck.ok) {
      return res.send(resultData(null, 400, pwdCheck.msg));
    }

    // 准备用户数据(字段白名单:绝不接受客户端传入的 role/del_flag/github_id 等,
    // 否则 POST {role:'root'} 就能自助注册成管理员越权提权)
    const params = {
      email: req.body.email,
      password: req.body.password,
      role: 'user', // 角色服务端强制写死,不信任客户端
    };
    // homePage 默认 'bookmark':新用户注册后(及以后登录)直落书签工作区,而非 DEFAULT_HOME_PAGE 的营销页 /landing
    params.preferences = JSON.stringify({ theme: 'day', noteViewMode: 'card', homePage: 'bookmark', lang: detectLangFromReq(req) });
    if (params.password) {
      params.password = hashPassword(params.password);
      params.password_method = 'scrypt';
    }

    // 插入新用户
    const userData = insertData(params);
    await pool.query('INSERT INTO user SET ?', [userData]);
    const userId = userData.id;

    // 欢迎通知(fire-and-forget:失败绝不影响注册主流程)
    createNotification(userId, buildWelcomeNotification(detectLangFromReq(req))).catch(() => {});

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

    // 注册即登录:签发会话,前端直接进应用(新用户从空状态开始,由前端空态引导上手)
    const userInfo = await queryUserInfoById(userId);
    const sid = await issueLoginSession(req, res, userInfo, Boolean(req.body.rememberMe));
    recordConversionEvent(req, 'register', '', { userId, visitorType: 'user' });
    res.send(resultData({ ...sanitizeUser(userInfo), sid }));
  } catch (err) {
    console.error('注册过程中发生错误:', err);
    if (err.message.includes('邮箱') || err.message.includes('账号')) {
      res.send(resultData(null, 500, err.message));
    } else {
      res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + err.message));
    }
  }
};
export const getUserInfo = async (req, res) => {
  try {
    const requestedId = req.query?.id || req.query?.params?.id;
    const id = req.user?.role === 'root' && requestedId ? requestedId : req.user?.id;
    if (!id) {
      res.send(resultData(null, 401, L(req, '请先登录', 'Please sign in first.')));
      return;
    }
    const [userRes] = await pool.query('SELECT * FROM user WHERE id = ?', [id]);
    if (!userRes[0]) {
      res.send(resultData(null, 401, L(req, '用户不存在,请重新登录！', 'User not found. Please sign in again.')));
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
      res.send(resultData(null, 401, L(req, '用户不存在,请重新登录！', 'User not found. Please sign in again.')));
      return;
    }
    if (Number(result.del_flag) === 1 && result.role !== 'root') {
      res.send(resultData(null, 423, L(req, '账号已被封禁，请登录其他账号或联系管理员', 'This account has been banned. Please sign in with another account or contact an administrator.')));
      return;
    }
    const safeUser = sanitizeUser(result);
    if (safeUser.role === 'visitor') {
      res.send(resultData(safeUser, 'visitor'));
    } else {
      res.send(resultData(safeUser));
    }
  } catch (e) {
    res.send(resultData(null, 400, L(req, '客户端请求异常', 'Bad request: ') + e)); // 设置状态码为400
  }
};

export const me = getUserInfo;
export const getUserList = (req, res) => {
  try {
    if (req.user?.role !== 'root') {
      return res.send(resultData(null, 403, L(req, '没有操作权限', 'You do not have permission to perform this action.')));
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
        res.send(resultData(null, 500, L(req, '服务器内部错误', 'Server error: ') + err)); // 设置状态码为500
      });
  } catch (e) {
    res.send(resultData(null, 400, L(req, '客户端请求异常', 'Bad request: ') + e)); // 设置状态码为400
  }
};

export const saveUserInfo = (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  try {
    const targetId = req.body.id || req.user?.id;
    const isRoot = req.user?.role === 'root';
    const id = isRoot ? targetId : req.user?.id;
    if (!id || (!isRoot && req.body.id && req.body.id !== req.user?.id)) {
      return res.send(resultData(null, 403, L(req, '没有操作权限', 'You do not have permission to perform this action.')));
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
      // 注:不含 password —— 编辑弹框直接改 password 会明文写库、绕过 scrypt,导致该用户登录失败。
      // 改密码请走 configPassword(scrypt 加密),不在此表单改。
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
        // 完善个人资料激励:本次更新涉及昵称或头像时一次性 +20(profile_done 幂等,只发一次)。
        // 响应之后 fire-and-forget,不阻塞、不影响保存结果。
        if (!isRoot && (finalBody.alias || finalBody.head_picture)) {
          grantExp(id, 'profile_done', { refId: 'profile', amount: 20, userRole: req.user?.role }).catch(() => {});
        }
      })
      .catch((err) => {
        res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + err.message)); // 设置状态码为500
      });
  } catch (e) {
    res.send(resultData(null, 400, L(req, '客户端请求异常：', 'Bad request: ') + e)); // 设置状态码为400
  }
};

export const deleteUserById = (req, res) => {
  try {
    if (req.user?.role !== 'root') {
      return res.send(resultData(null, 403, L(req, '没有操作权限', 'You do not have permission to perform this action.')));
    }
    pool
      .query('update user set del_flag=1 where id=?', [req.query.id])
      .then(async ([result]) => {
        await removeUserSessions(req.query.id);
        res.send(resultData(result));
      })
      .catch((err) => res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + err.message)));
  } catch (e) {
    res.send(resultData(null, 400, L(req, '客户端请求异常：', 'Bad request: ') + e)); // 设置状态码为400
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
    const user = await handleUserDatabaseOperation(githubUser, req);
    const sid = await issueLoginSession(req, res, user, true);

    res.send(
      resultData({
        ...({ sid }),
        user_info: {
          id: user.id,
          alias: user.alias,
          head_picture: user.head_picture,
          role: user.role ?? 'user',
        },
        requires_email: !githubUser.email, // 标识是否需要补全邮箱
      }),
    );
  } catch (error) {
    console.error('GitHub Auth Error:', error);
    res.send(resultData(null, 500, L(req, 'GitHub认证失败：', 'GitHub authentication failed: ') + error));
  }
};

export const logout = async (req, res) => {
  try {
    await logoutCurrentSession(req, res);
    res.send(resultData(null, 200, L(req, '退出成功', 'Signed out successfully.')));
  } catch (e) {
    res.send(resultData(null, 500, L(req, '退出登录失败：', 'Logout failed: ') + e.message));
  }
};

// 会话句柄:对外只暴露 sid 的 sha256 前 16 位,绝不把真 sid 交给页面(防 XSS 泄露会话)
const sessionHandle = (sid) => crypto.createHash('sha256').update(String(sid)).digest('hex').slice(0, 16);

// 登录设备/会话列表:展示 IP/设备/最近活跃 + 标记本机
export const getMySessions = async (req, res) => {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor') {
    return res.send(resultData(null, 401, L(req, '请先登录', 'Please sign in first.')));
  }
  try {
    const currentSid = getRequestSid(req);
    const rows = await listUserSessions(userId);
    const items = rows.map((r) => ({
      id: sessionHandle(r.sid),
      ip: r.ip || '',
      userAgent: r.user_agent || '',
      createTime: r.create_time,
      lastActiveTime: r.last_active_time,
      current: r.sid === currentSid,
    }));
    res.send(resultData(items));
  } catch (e) {
    res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + e.message));
  }
};

// 吊销会话:body.id=按句柄下线单台;body.others=true 下线除本机外所有。只在本人会话集合内匹配,天然限权。
export const revokeSession = async (req, res) => {
  const userId = req.user?.id;
  if (!userId || req.user?.role === 'visitor') {
    return res.send(resultData(null, 401, L(req, '请先登录', 'Please sign in first.')));
  }
  try {
    const { id, others } = req.body || {};
    const currentSid = getRequestSid(req);
    const rows = await listUserSessions(userId);
    let targets = [];
    if (others) {
      targets = rows.filter((r) => r.sid !== currentSid).map((r) => r.sid);
    } else {
      const match = rows.find((r) => sessionHandle(r.sid) === id);
      if (!match) return res.send(resultData(null, 400, L(req, '会话不存在', 'Session not found.')));
      if (match.sid === currentSid) return res.send(resultData(null, 400, L(req, '不能在此下线当前设备,请用退出登录', 'Use sign out for the current device.')));
      targets = [match.sid];
    }
    for (const sid of targets) await removeSession(sid);
    res.send(resultData({ revoked: targets.length }));
  } catch (e) {
    res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + e.message));
  }
};

// --- 工具函数 ---
// 国内服务器连 GitHub(github.com / api.github.com)经常抖动/超时。
// 对网络错误与超时重试(带小退避);HTTP 错误状态由 fetchWithTimeout 正常返回、不会进入重试。
const retry = async (fn, attempts = 3, label = '') => {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.warn(`[GitHub] ${label} 第 ${i + 1}/${attempts} 次失败: ${e.message}`);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
};

const fetchGitHubToken = async (code) => {
  const params = new URLSearchParams();
  params.append('client_id', process.env.GITHUB_CLIENT_ID); // 改用环境变量
  params.append('client_secret', process.env.GITHUB_CLIENT_SECRET);
  params.append('code', code);

  try {
    // 多 IP 竞速换 token:绕过 GFW 对 github.com 单个 DNS IP 的间歇性 TCP 封锁(详见 util/githubOAuth.js)。
    // 只要一组 github.com 官方 IP 里当下有任一可达即成功;api.github.com(取用户/邮箱)另走、通常正常。
    return await fetchGitHubTokenRacing(params.toString());
  } catch (error) {
    console.error('fetchGitHubToken Error:', error.message);
    throw error;
  }
};

const getGitHubUser = async (accessToken) => {
  const response = await retry(
    () =>
      fetchWithTimeout(
        'https://api.github.com/user',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'MyApp',
          },
        },
        8000, // 原来是裸 fetch,无超时会挂死
      ),
    3,
    'user',
  );

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

const handleUserDatabaseOperation = async (githubUser, req) => {
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
  // 与邮箱注册对齐:role 服务端写死 'user'(缺失会让新用户 role=null → 全站 403 无权限),并给默认 preferences
  const defaultPreferences = JSON.stringify({ theme: 'day', noteViewMode: 'card', homePage: 'bookmark', lang: detectLangFromReq(req) });
  await pool.query(
    `INSERT INTO user
      (id, email, github_id, login_type, head_picture, password, password_method, alias, role, preferences)
     VALUES (?, ?, ?, 'github', ?, ?, 'scrypt', ?, 'user', ?)`,
    [githubUserId, safeEmail, githubUser.id, githubUser.avatar_url, githubHashedPassword, githubUser.login, defaultPreferences],
  );
  const [result] = await pool.query(`SELECT * FROM user WHERE github_id = ? LIMIT 1`, [githubUser.id]);

  // 转化漏斗:GitHub 新注册也要记 register(邮箱注册在 registerUser 已记),否则漏斗「注册成功」恒为 0
  recordConversionEvent(req, 'register', '', { userId: githubUserId, visitorType: 'user' });

  // 欢迎通知(fire-and-forget):GitHub 新注册与邮箱注册对齐
  createNotification(githubUserId, buildWelcomeNotification(detectLangFromReq(req))).catch(() => {});

  // 返回新插入的完整用户数据
  return result[0];
};

// 修改密码或者设置密码configPassword

export const configPassword = async (req, res) => {
  try {
    const id = req.user?.id; // 获取用户ID
    if (!id || req.user?.role === 'visitor') {
      return res.send(resultData(null, 401, L(req, '请先登录', 'Please sign in first.')));
    }
    const { password, type } = req.body;
    const pwdCheck = validatePassword(password, reqLang(req));
    if (!pwdCheck.ok) {
      return res.send(resultData(null, 400, pwdCheck.msg));
    }
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
        res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + err.message)); // 设置状态码为500
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
    res.send(resultData(L(req, '验证码发送成功', 'Verification code sent.')));
  } catch (e) {
    // 原样把 SMTP 内部错误(如 QQ 535 Login fail)抛给用户既不友好也泄露实现;
    // 面向用户给稳定文案,真实错误只进服务端日志便于排查。
    console.error('邮件发送异常:', e?.message || e);
    res.send(resultData(null, 500, L(req, '验证码发送失败,请稍后重试', 'Failed to send the code. Please try again later.')));
  }
};

// 验证验证码接口
export const verifyCode = async (req, res) => {
  try {
    const { email, code, password } = req.body;
    const pwdCheck = validatePassword(password, reqLang(req));
    if (!pwdCheck.ok) {
      return res.send(resultData(null, 400, pwdCheck.msg));
    }

    // 1. 从Redis获取存储的验证码
    const storedCode = await redisClient.get(`email:code:${email}`);

    // 2. 验证逻辑
    if (!storedCode) {
      res.send(resultData(null, 400, L(req, '验证码已过期或未发送', 'The verification code has expired or was never sent.')));
      return;
    }
    if (storedCode !== code) {
      res.send(resultData(null, 400, L(req, '验证码错误', 'Incorrect verification code.')));
      return;
    }
    // 3. 验证成功后，删除已用验证码并且设置新密码
    await redisClient.del(`email:code:${email}`);
    const hashedPassword = hashPassword(password);
    pool
      .query('update user set password=?, password_method=? where email=?', [hashedPassword, 'scrypt', email])
      .then(() => {
        res.send(resultData(L(req, '重置密码成功', 'Password reset successfully.')));
      })
      .catch((err) => {
        res.send(resultData(null, 500, L(req, '服务器内部错误: ', 'Server error: ') + err.message)); // 设置状态码为500
      });
  } catch (e) {
    res.send(resultData(null, 500, L(req, '验证服务异常:', 'Verification service error: ') + e.message)); // 设置状态码为400
  }
};
