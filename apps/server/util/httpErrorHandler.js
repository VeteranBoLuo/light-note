import { L } from './common.js';

// Express 默认错误页在 NODE_ENV 不是 production 时会回显堆栈和服务器路径。
// 这里兜住路由没接住的异常（Body 解析失败、Express 5 自动转发的 async 拒绝等），统一返回低敏 JSON。
function httpStatusOf(error) {
  const status = Number(error?.status || error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

// body-parser 的 type、Node/MySQL 的 code 都是稳定标识；裸异常只记类名，不记 message。
function stableCode(error) {
  const raw = String(error?.type || error?.code || error?.name || '');
  return /^[A-Za-z][\w.:-]{0,63}$/u.test(raw) ? raw : 'UNKNOWN';
}

// 5xx 多半是代码缺陷，只保留第一帧位置便于定位，不带错误原文。
function firstStackFrame(error) {
  const frame = String(error?.stack || '')
    .split('\n')
    .find((line) => line.trim().startsWith('at '));
  return frame ? frame.trim().slice(0, 200) : '-';
}

export function httpErrorHandler(error, req, res, next) {
  // 流式响应已开始写出时无法再改状态码，交给 Express 断开连接。
  if (res.headersSent) return next(error);
  const status = httpStatusOf(error);
  console.error(
    '[http] 未处理异常 status=%d code=%s requestId=%s where=%s',
    status,
    stableCode(error),
    req.requestId || '-',
    status >= 500 ? firstStackFrame(error) : '-',
  );
  // 5xx 留空 msg，前端按当前语言显示“服务繁忙”。
  const msg =
    status === 413
      ? L(req, '提交内容过大', 'Request body is too large')
      : status < 500
        ? L(req, '请求格式或参数不正确', 'Invalid request')
        : '';
  return res.status(status).json({ status, msg, data: null });
}
