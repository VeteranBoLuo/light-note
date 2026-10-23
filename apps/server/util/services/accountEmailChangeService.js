import crypto from 'node:crypto';
import pool from '../../db/index.js';
import redisClient from '../redisClient.js';
import { verifyPassword } from '../password.js';
import { hasLoginPassword } from '../loginPasswordState.js';
import { sendTrackedEmail, maskEmail } from '../emailDelivery.js';
import {
  accountEmailSnapshot,
  emailDigest,
  emailIdentity,
  parseAccountEmail,
  isGitHubPlaceholderEmail,
} from './accountEmailPolicy.js';

const TTL = 300;
const keyFor = (token) => `account:email-change:${emailDigest(token)}`;
const githubKey = (sid) => `account:recent-github:${emailDigest(sid)}`;
const fail = (code, status = 400) => {
  throw Object.assign(new Error(code), { code, status });
};
function assertActive(user) {
  if (!user || Number(user.del_flag || 0) !== 0 || !['user', 'test', 'root'].includes(user.role))
    fail('EMAIL_CHANGE_ACCOUNT_UNAVAILABLE', 403);
}

// 仅 GitHub 回调成功后写入；不能把“已关联 GitHub”或普通会话年龄当成 GitHub 验证证明。
export async function rememberRecentGithubAuthentication(sid, user, { redis = redisClient } = {}) {
  if (!sid || !user?.github_id) return;
  await redis.setEx(githubKey(sid), 600, JSON.stringify({ userId: user.id, snapshot: accountEmailSnapshot(user) }));
}
export async function hasRecentGithubAuthentication(sid, user, { redis = redisClient } = {}) {
  if (!sid || !user?.github_id) return false;
  try {
    const proof = JSON.parse((await redis.get(githubKey(sid))) || 'null');
    return proof?.userId === user.id && proof.snapshot === accountEmailSnapshot(user);
  } catch {
    return false;
  }
}

export async function getEmailChangeAccount(userId, { db = pool } = {}) {
  const [[user]] = await db.query('SELECT * FROM user WHERE id = ? LIMIT 1', [userId]);
  assertActive(user);
  return user;
}

const RELEASE = `-- email-change-release
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return 0 end
if ARGV[2] == '' then return redis.call('DEL', KEYS[1]) end
redis.call('SETEX', KEYS[1], ttl, ARGV[2])
return 1`;

export async function requestEmailChange(
  { userId, sid, email, oldPassword },
  { db = pool, redis = redisClient, send = sendTrackedEmail, verify = verifyPassword } = {},
) {
  const user = await getEmailChangeAccount(userId, { db });
  const parsed = parseAccountEmail(email);
  if (!sid || !parsed || isGitHubPlaceholderEmail(parsed.email)) fail('EMAIL_CHANGE_INVALID_EMAIL');
  if (emailIdentity(parsed.email) === emailIdentity(user.email)) fail('EMAIL_CHANGE_SAME_EMAIL');
  const passwordProved =
    typeof oldPassword === 'string' &&
    oldPassword.length > 0 &&
    oldPassword.length <= 64 &&
    hasLoginPassword(user) !== false &&
    (await verify(oldPassword, user.password));
  if (!passwordProved && !(await hasRecentGithubAuthentication(sid, user, { redis })))
    fail('EMAIL_CHANGE_IDENTITY_REQUIRED');
  const [[existing]] = await db.query('SELECT id FROM user WHERE email = ? LIMIT 1', [parsed.email]);
  if (existing) fail('EMAIL_CHANGE_EMAIL_IN_USE', 409);
  const cooldownKey = `account:email-change-cooldown:${emailDigest(user.id)}`;
  const token = crypto.randomBytes(32).toString('base64url');
  if (!(await redis.set(cooldownKey, token, { NX: true, EX: 60 }))) fail('EMAIL_CHANGE_RATE_LIMITED', 429);
  const code = crypto.randomInt(100000, 1000000).toString();
  const challenge = JSON.stringify({
    userId: user.id,
    sidDigest: emailDigest(sid),
    snapshot: accountEmailSnapshot(user),
    email: parsed.email,
    codeDigest: emailDigest(`${token}:${code}`),
    status: 'ready',
    attempts: 0,
  });
  const key = keyFor(token);
  try {
    // 发送期间尚不开放确认，SMTP 失败不会留下可用的验证码。
    await send({
      emailType: 'email_change',
      userId,
      recipient: parsed.email,
      subject: '【轻笺】更换邮箱验证',
      businessType: 'email_change',
      text: `您正在更换轻笺账号邮箱。验证码：${code}，5 分钟内有效。此验证码仅用于更换邮箱，请勿泄露。如非本人操作，请忽略。\nYou are changing your LightNote email. Code: ${code}. Valid for 5 minutes. Do not share it.`,
    });
    await redis.setEx(key, TTL, challenge);
  } catch (error) {
    await redis.eval(RELEASE, { keys: [cooldownKey], arguments: [token, ''] }).catch(() => {});
    throw error;
  }
  return { challenge: token, maskedEmail: maskEmail(parsed.email), expiresIn: TTL, resendAfter: 60 };
}

const CLAIM = `-- email-change-claim
local raw = redis.call('GET', KEYS[1])
if not raw then return 'INVALID' end
local item = cjson.decode(raw)
if item.userId ~= ARGV[1] or item.sidDigest ~= ARGV[2] then return 'INVALID' end
if item.status ~= 'ready' then return 'BUSY' end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return 'INVALID' end
if item.codeDigest ~= ARGV[3] then
  item.attempts = item.attempts + 1
  if item.attempts >= 5 then redis.call('DEL', KEYS[1])
  else redis.call('SETEX', KEYS[1], ttl, cjson.encode(item)) end
  return 'INVALID'
end
item.status = 'processing'
item.processingId = ARGV[4]
local claimed = cjson.encode(item)
redis.call('SETEX', KEYS[1], ttl, claimed)
return claimed`;

// 事务内再次复核身份快照，唯一邮箱索引裁决并发更换/注册；不迁移或合并任何账号。
export async function persistAccountEmailChange(challenge, { db = pool, sid } = {}) {
  const connection = await db.getConnection();
  let commitStarted = false,
    expectedSnapshot,
    result,
    failure;
  try {
    await connection.beginTransaction();
    const [[user]] = await connection.query('SELECT * FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [challenge.userId]);
    assertActive(user);
    if (accountEmailSnapshot(user) !== challenge.snapshot) fail('EMAIL_CHANGE_ACCOUNT_CHANGED', 409);
    // 不能仅依赖请求入口鉴权：验证码等待或确认请求在途时，会话可能已经被退出/撤销。
    if (!sid || emailDigest(sid) !== challenge.sidDigest) fail('EMAIL_CHANGE_IDENTITY_REQUIRED');
    const [[session]] = await connection.query(
      'SELECT sid FROM user_sessions WHERE sid = ? AND user_id = ? AND expires_at > NOW() LIMIT 1 FOR UPDATE',
      [sid, user.id],
    );
    if (!session) fail('EMAIL_CHANGE_IDENTITY_REQUIRED');
    await connection.query('UPDATE user SET email = ? WHERE id = ?', [challenge.email, user.id]);
    // 与邮箱变更同事务撤销数据库会话，事务外继续驱逐 Redis 缓存。
    const [sessions] = await connection.query('SELECT sid FROM user_sessions WHERE user_id = ? FOR UPDATE', [user.id]);
    await connection.query('DELETE FROM user_sessions WHERE user_id = ?', [user.id]);
    expectedSnapshot = accountEmailSnapshot({ ...user, email: challenge.email });
    result = { email: challenge.email, revokedSids: sessions.map((session) => session.sid) };
    commitStarted = true;
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    failure = error;
  } finally {
    connection.release();
  }
  // COMMIT 的回包可能丢失。释放原连接后用新的读取复核持久结果，避免连接池为 1 时自锁。
  if (commitStarted) {
    try {
      const current = await getEmailChangeAccount(challenge.userId, { db });
      if (accountEmailSnapshot(current) === expectedSnapshot) return result;
    } catch {
      /* 无法确认时保留原错误，不能猜测提交成功。 */
    }
  }
  if (failure.code === 'ER_DUP_ENTRY') fail('EMAIL_CHANGE_EMAIL_IN_USE', 409);
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(failure.code)) fail('EMAIL_CHANGE_BUSY', 409);
  throw failure;
}

export async function confirmEmailChange(
  { userId, sid, challenge: token, code },
  { db = pool, redis = redisClient } = {},
) {
  if (
    !sid ||
    typeof token !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    typeof code !== 'string' ||
    !/^\d{6}$/.test(code)
  )
    fail('EMAIL_CHANGE_INVALID_CODE');
  const key = keyFor(token);
  const raw = await redis.eval(CLAIM, {
    keys: [key],
    arguments: [String(userId), emailDigest(sid), emailDigest(`${token}:${code}`), crypto.randomUUID()],
  });
  if (!raw || raw === 'INVALID') fail('EMAIL_CHANGE_INVALID_CODE');
  if (raw === 'BUSY') fail('EMAIL_CHANGE_BUSY', 409);
  const claim = JSON.parse(raw);
  let result;
  try {
    result = await persistAccountEmailChange(claim, { db, sid });
  } catch (error) {
    const next = { ...claim, status: 'ready' };
    delete next.processingId;
    // 事务失败可重试，但不延长验证码寿命，也不覆盖并发票据。
    await redis.eval(RELEASE, { keys: [key], arguments: [raw, JSON.stringify(next)] }).catch(() => {});
    throw error;
  }
  // 提交后旁路失败不能把成功更换误报为失败；会话鉴权始终重验数据库撤销事实。
  const keys = [...result.revokedSids.map((value) => `session:${value}`), githubKey(sid), key];
  await redis.del(keys).catch(() => console.warn('[account-email-change] session cache cleanup failed'));
  return { email: result.email };
}
