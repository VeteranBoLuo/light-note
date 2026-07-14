import pool from '../db/index.js';
import { resultData, formatDateTime, insertData } from './common.js';
import { isSelfTraffic } from './logExclude.js';

export async function logFunction(req, res, next) {
  try {
    // 管理员上下文由 admin_context_audit 统一记录 actor/subject/policy，避免混入普通用户 API 日志。
    if (req.adminContext) {
      next();
      return;
    }
    if (req.originalUrl.includes('/login')) {
      // 登录成败交给登录接口处理，日志中间件只记录请求。
    }
    const isVisitorWorkspaceWrite = Boolean(req.isVisitorWorkspaceContentWrite);
    const userId = isVisitorWorkspaceWrite ? req.adminActor?.id : req.user?.id;
    // 普通管理员预览与游客工作区只读请求不记日志；游客展示内容的实际写入必须保留审计。
    if (req.isAdminPreview && !isVisitorWorkspaceWrite) {
      next();
      return;
    }
    // 跳过不记录的接口
    const skipApi = [
      'Logs',
      'getUserInfo',
      'getUserList',
      'analyzeImgUrl',
      'getRelatedTag',
      'getOpinionNotice',
      'noticeSummary',
      'aiQuota',
      '/me',
      'unreadCount', // 通知未读数:铃铛角标每 120s 轮询,高频且无操作审计价值,不记 API 日志
    ].some((key) => req.originalUrl.includes(key));

    if (skipApi && !isVisitorWorkspaceWrite) {
      next();
      return;
    }
    // 本地/回环 IP,或「自己人」设备(指纹白名单)——不记 API 日志
    if (!isVisitorWorkspaceWrite && isSelfTraffic(req)) {
      next();
      return;
    }
    const rawRequestPayload = req.method === 'GET' ? req.query : req.body;
    const requestPayload = JSON.stringify(
      isVisitorWorkspaceWrite
        ? {
            payload: rawRequestPayload,
            visitorWorkspaceTargetUserId: req.user?.id || '',
          }
        : rawRequestPayload,
    );
    // 等待响应结束
    res.on('finish', async () => {
      if (userId) {
        try {
          const system = JSON.stringify({
            browser: req.headers['browser'] ?? '未知',
            os: req.headers['os'] ?? '未知',
            fingerprint: req.headers['fingerprint'],
            ...(isVisitorWorkspaceWrite
              ? {
                  adminPreview: true,
                  targetUserId: req.user?.id || '',
                }
              : {}),
          });
          // 构造日志对象
          const log = {
            userId: userId,
            method: req.method,
            url: req.originalUrl,
            req: requestPayload === '{}' ? '' : requestPayload,
            status_code: res.statusCode,
            ip: req.ip || '',
            system: system,
            del_flag: 0,
          };
          // 将日志保存到数据库
          const query = 'INSERT INTO api_logs SET ?';
          pool.query(query, [insertData(log)]).catch((err) => {
            console.error(formatDateTime(new Date()) + '日志更新sql错误: ' + err.message);
          });
        } catch (err1) {
          console.error(formatDateTime(new Date()) + '日志更新错误：', err1);
        }
      }
    });
    next();
  } catch (e) {
    res.send(resultData(null, 500, e.message)); // 设置状态码为500
  }
}
