import crypto from 'node:crypto';
import redisClient from './redisClient.js';

/**
 * 前端生成件的一次性下载票据（笔记导出、待办日历 .ics）。
 *
 * 为什么需要这层中转:轻笺 Android App 的 WebView 没有 Web Share,`a[download]` 点
 * `blob:` 虽然会进原生 DownloadListener,但原生下载桥(WebViewSupport.download)第一行
 * 只认 http(s),blob 被挡掉后只弹一句「无法开始下载」(真机实测)。于是前端生成好的
 * 导出内容在 App 内根本落不了盘。把内容暂存到这里换一个
 * 短时 http 地址,App 就能复用既有的 `{type:'download'}` 桥交给系统 DownloadManager,
 * 不需要改原生、也不需要用户升级 APK。
 *
 * 内容本身不落库、不进 OBS:导出件是可再生的一次性产物,留存只会变成需要清理的垃圾和
 * 额外的泄露面。因此只在 Redis 停留数分钟,取走即删。
 */

/**
 * 票据有效期。DownloadManager 是立刻发起请求的,给到 3 分钟已足够覆盖弱网排队;
 * 再长只会让 Redis 里多躺着几 MB 的导出件(服务器内存紧张,MySQL 都还在 5.7)。
 */
const TICKET_TTL_SECONDS = 180;
const TICKET_KEY_PREFIX = 'note:export:ticket:';
/** 每用户「当前票据」指针,用于新票据挤掉旧票据,避免连点导出把 Redis 堆满。 */
const USER_POINTER_KEY_PREFIX = 'note:export:user:';

/**
 * 单个导出件的原始字节上限。
 * app.js 的 bodyParser 限 10MB,而 base64 会膨胀到 4/3,6MB 原始内容约 8MB 传输体积,
 * 留出的余量给 JSON 包装和其他字段。超限在 handler 层给明确文案,不能让用户吃 413 裸错。
 */
export const MAX_EXPORT_BYTES = 6 * 1024 * 1024;

/** 导出格式 → 落盘用的 MIME。下载响应实际不用它(统一 octet-stream),仅作校验白名单。 */
export const EXPORT_FORMATS = Object.freeze({
  md: 'text/markdown',
  html: 'text/html',
  pdf: 'application/pdf',
  zip: 'application/zip',
});

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function ticketKey(token) {
  // 存哈希而不是明文 token:Redis 快照/日志泄露时,拿到的东西不能直接当下载凭证用。
  return `${TICKET_KEY_PREFIX}${sha256(token)}`;
}

function userPointerKey(userId) {
  return `${USER_POINTER_KEY_PREFIX}${userId}`;
}

/** 票据 token 形态:base64url 无填充,与 githubOAuthState 的 token 口径保持一致。 */
export function isValidExportToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

/**
 * 创建一次性下载票据。
 * 同一用户只保留最新一张:导出按钮被连点或多篇笔记连续导出时,旧票据立即失效,
 * Redis 占用被钉在「单用户一份」而不是随点击次数线性增长。
 */
export async function createExportTicket({ userId, resourceId, format, fileName, content }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const payload = JSON.stringify({
    userId: String(userId),
    // 只是排查用的元数据,消费时不校验:笔记传 noteId,待办日历传 todoId
    resourceId: String(resourceId),
    format,
    fileName,
    contentBase64: content.toString('base64'),
    byteLength: content.length,
    createdAt: Date.now(),
  });

  const pointerKey = userPointerKey(userId);
  const previousDigest = await redisClient.get(pointerKey).catch(() => null);
  await redisClient.setEx(ticketKey(token), TICKET_TTL_SECONDS, payload);
  await redisClient.setEx(pointerKey, TICKET_TTL_SECONDS, sha256(token));
  if (previousDigest && previousDigest !== sha256(token)) {
    // 挤掉旧票据。失败不影响本次导出,旧票据最迟也会被 TTL 回收。
    await redisClient.del(`${TICKET_KEY_PREFIX}${previousDigest}`).catch(() => {});
  }

  return { token, expiresIn: TICKET_TTL_SECONDS };
}

/**
 * 原子消费票据。
 * 用 getDel 而不是 get + del:两步之间的窗口会让同一个 token 被下载两次。
 * 归属不符时按「不存在」处理,不区分「票据不存在」和「票据属于别人」,避免探测。
 */
export async function consumeExportTicket(token, userId) {
  if (!isValidExportToken(token)) return null;

  const raw = await redisClient.getDel(ticketKey(token));
  if (!raw) return null;

  let ticket;
  try {
    ticket = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!ticket || ticket.userId !== String(userId)) return null;

  const content = Buffer.from(ticket.contentBase64 || '', 'base64');
  if (!content.length) return null;

  await redisClient.del(userPointerKey(userId)).catch(() => {});

  return {
    resourceId: ticket.resourceId,
    format: ticket.format,
    fileName: ticket.fileName,
    content,
  };
}
