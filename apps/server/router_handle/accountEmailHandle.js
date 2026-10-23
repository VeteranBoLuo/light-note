import { resultData, L } from '../util/common.js';
import { clearAuthCookie } from '../util/auth.js';
import { hasLoginPassword } from '../util/loginPasswordState.js';
import { recordServerOperation } from '../util/operationLog.js';
import {
  getEmailChangeAccount,
  hasRecentGithubAuthentication,
  requestEmailChange,
  confirmEmailChange,
} from '../util/services/accountEmailChangeService.js';

function authenticated(req, res) {
  if (req.adminContext || req.isAdminPreview) {
    res.send(
      resultData(null, 403, L(req, '管理员预览不能更换邮箱', 'Email changes are unavailable in admin preview.')),
    );
    return false;
  }
  if (!req.user?.id || !req.user?.sessionId || !['user', 'test', 'root'].includes(req.user.role)) {
    res.send(resultData(null, 401, L(req, '请先登录', 'Please sign in first.')));
    return false;
  }
  return true;
}
const errors = {
  EMAIL_CHANGE_INVALID_EMAIL: ['请输入正常可接收邮件的邮箱', 'Enter an email address that can receive mail.'],
  EMAIL_CHANGE_SAME_EMAIL: ['请填写与当前不同的新邮箱', 'Enter a different email address.'],
  EMAIL_CHANGE_IDENTITY_REQUIRED: [
    '请验证当前密码，或重新通过已绑定的 GitHub 登录后重试',
    'Verify your current password, or sign in again with your linked GitHub account.',
  ],
  EMAIL_CHANGE_EMAIL_IN_USE: [
    '新邮箱已被其他账号使用，不能更换或合并账号',
    'The email is already used by another account. Accounts cannot be merged here.',
  ],
  EMAIL_CHANGE_RATE_LIMITED: ['操作过于频繁，请稍后再试', 'Too many requests. Please retry later.'],
  EMAIL_CHANGE_INVALID_CODE: [
    '验证码错误、已过期或尝试次数过多，请重新获取',
    'The code is incorrect, expired, or has exceeded its attempt limit. Request a new code.',
  ],
  EMAIL_CHANGE_ACCOUNT_CHANGED: [
    '账号信息已变化，请重新验证并获取验证码',
    'Your account changed. Verify again and request a new code.',
  ],
  EMAIL_CHANGE_BUSY: ['更换正在处理中，请稍后重试', 'The change is processing. Please retry shortly.'],
  EMAIL_CHANGE_ACCOUNT_UNAVAILABLE: ['账号当前不可用', 'This account is unavailable.'],
};
function respondError(req, res, error) {
  const text = errors[error?.code];
  if (!text)
    console.warn(
      '[account-email] request failed code=%s',
      /^[A-Z0-9_]+$/.test(error?.code) ? error.code : 'REQUEST_FAILED',
    );
  return res.send(
    resultData(
      { code: text ? error.code : 'EMAIL_CHANGE_FAILED' },
      text ? error.status : 500,
      L(req, ...(text || ['更换邮箱未完成，请稍后重试', 'Could not change your email. Please retry.'])),
    ),
  );
}
export async function status(req, res) {
  if (!authenticated(req, res)) return;
  try {
    const user = await getEmailChangeAccount(req.user.id);
    res.send(
      resultData({
        email: user.email,
        hasPassword: hasLoginPassword(user),
        githubBound: Boolean(user.github_id),
        recentGithub: await hasRecentGithubAuthentication(req.user.sessionId, user),
      }),
    );
  } catch (error) {
    respondError(req, res, error);
  }
}
export async function requestCode(req, res) {
  if (!authenticated(req, res)) return;
  try {
    res.send(
      resultData(
        await requestEmailChange({
          userId: req.user.id,
          sid: req.user.sessionId,
          email: req.body?.email,
          oldPassword: req.body?.oldPassword,
        }),
      ),
    );
  } catch (error) {
    respondError(req, res, error);
  }
}
export async function confirm(req, res) {
  if (!authenticated(req, res)) return;
  try {
    const result = await confirmEmailChange({
      userId: req.user.id,
      sid: req.user.sessionId,
      challenge: req.body?.challenge,
      code: req.body?.code,
    });
    clearAuthCookie(res);
    await recordServerOperation(req, {
      module: '账号安全',
      operation: '验证新邮箱并更换登录邮箱',
      userId: req.user.id,
    }).catch(() => console.warn('[account-email] audit failed'));
    res.send(resultData(result));
  } catch (error) {
    respondError(req, res, error);
  }
}
