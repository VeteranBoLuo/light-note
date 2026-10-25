import crypto from 'node:crypto';
import pool from '../../db/index.js';
import { GitHubOAuthError } from '../githubOAuth.js';

const fail = (code, message) => {
  throw new GitHubOAuthError(code, message, { stage: 'ACCOUNT_BIND', status: 409 });
};
export function githubBindingSnapshot(user) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        user.id,
        user.email,
        user.password,
        user.password_method ?? null,
        user.login_password_set ?? null,
        user.github_id || null,
        user.login_type ?? null,
        user.role,
        Number(user.del_flag || 0),
      ]),
    )
    .digest('hex');
}
function assertActive(user) {
  if (!user || Number(user.del_flag || 0) !== 0 || !['user', 'test', 'root'].includes(user.role))
    fail('GITHUB_OAUTH_ACCOUNT_UNAVAILABLE', '账号当前不可用，请使用其他账号登录');
}
export function githubBindingCandidate(user, githubUser) {
  assertActive(user);
  const githubId = String(githubUser.id);
  if (user.github_id && String(user.github_id) !== githubId)
    fail('GITHUB_OAUTH_EMAIL_CONFLICT', '此邮箱已绑定其他 GitHub 账号，请使用邮箱登录');
  if (
    githubUser.emailMissing ||
    !githubUser.email ||
    /@users\.noreply\.github\.com$/i.test(githubUser.email) ||
    String(user.email).toLowerCase() !== String(githubUser.email).toLowerCase()
  )
    fail('GITHUB_OAUTH_EMAIL_CONFLICT', 'GitHub 未提供可用于绑定的已验证邮箱');
  return {
    version: 2,
    userId: user.id,
    githubId,
    email: user.email,
    githubLogin: String(githubUser.login || '')
      .replace(/[^a-z0-9-]/gi, '')
      .slice(0, 80),
    snapshot: githubBindingSnapshot(user),
  };
}

// 唯一键裁决并发绑定；只添加登录关联，不修改密码、邮箱、资料、权益或现有会话。
export async function confirmGithubAccountBinding(binding, { db = pool, resumeOnly = false } = {}) {
  if (binding?.version !== 2 || !binding.userId || !/^\d{1,40}$/.test(binding.githubId) || !binding.snapshot)
    fail('GITHUB_OAUTH_STATE_INVALID', '绑定请求已失效，请重新授权');
  const connection = await db.getConnection();
  let expectedSnapshot,
    failure,
    commitStarted = false;
  try {
    await connection.beginTransaction();
    const [[user]] = await connection.query('SELECT * FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [binding.userId]);
    assertActive(user);
    // COMMIT 回包丢失、相同票据重试时，只接受其他凭据完全未变的同一关联。
    const alreadyBound = String(user.github_id || '') === binding.githubId;
    // 过期租约无法区分“尚未写入”和“曾写入后主动解绑”，因此只恢复仍存在的关联。
    if (resumeOnly && !alreadyBound) fail('GITHUB_OAUTH_ACCOUNT_CHANGED', '账号关联已变化，请重新授权并确认绑定');
    const snapshot = githubBindingSnapshot(alreadyBound ? { ...user, github_id: null } : user);
    if (snapshot !== binding.snapshot || user.email !== binding.email)
      fail('GITHUB_OAUTH_ACCOUNT_CHANGED', '账号信息已变化，请重新授权并确认绑定');
    if (!alreadyBound) {
      const [result] = await connection.query(
        "UPDATE user SET github_id = ? WHERE id = ? AND (github_id IS NULL OR github_id = '' OR github_id = ?)",
        [binding.githubId, user.id, binding.githubId],
      );
      if (result.affectedRows !== 1) fail('GITHUB_OAUTH_ACCOUNT_CHANGED', '账号关联已变化，请重新授权');
    }
    const updated = { ...user, github_id: binding.githubId };
    expectedSnapshot = githubBindingSnapshot(updated);
    commitStarted = true;
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback().catch(() => {});
    failure = error;
  } finally {
    connection.release();
  }
  if (commitStarted) {
    try {
      const [[current]] = await db.query('SELECT * FROM user WHERE id = ? LIMIT 1', [binding.userId]);
      if (current && githubBindingSnapshot(current) === expectedSnapshot) return current;
    } catch (error) {
      failure = error;
    }
    failure.bindingMayHaveCommitted = true;
  }
  if (failure.code === 'ER_DUP_ENTRY') fail('GITHUB_OAUTH_EMAIL_CONFLICT', '该 GitHub 已关联其他轻笺账号，请重新登录');
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(failure.code))
    fail('GITHUB_OAUTH_IN_PROGRESS', '绑定正在处理中，请稍后重试');
  throw failure;
}
