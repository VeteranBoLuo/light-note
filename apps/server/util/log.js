import pool from '../db/index.js';
import { resultData, formatDateTime, insertData } from './common.js';

export async function logFunction(req, res, next) {
  try {
    if (req.originalUrl.includes('/login')) {
      // 登录成败交给登录接口处理，日志中间件只记录请求。
    }
    const userId = req.user?.id;
    // 管理员预览模式下不记录 API 日志
    if (req.isAdminPreview) {
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
    ].some((key) => req.originalUrl.includes(key));

    if (skipApi) {
      next();
      return;
    }
    const requestPayload = JSON.stringify(req.method === 'GET' ? req.query : req.body);
    // 等待响应结束
    res.on('finish', async () => {
      if (userId) {
        try {
          const system = JSON.stringify({
            browser: req.headers['browser'] ?? '未知',
            os: req.headers['os'] ?? '未知',
            fingerprint: req.headers['fingerprint'],
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
