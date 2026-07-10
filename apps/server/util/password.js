import crypto from 'crypto';

const SCRYPT_KEYLEN = 64;
const SALT_LENGTH = 16;
const SEPARATOR = ':';

/**
 * 哈希密码（同步，约 100ms）
 * 返回格式: hexSalt:hexHash
 */
export function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN);
  return salt.toString('hex') + SEPARATOR + hash.toString('hex');
}

/**
 * 验证密码
 * @param {string} plainPassword 用户输入的明文
 * @param {string} storedPassword 数据库存的哈希（格式: salt:hash）或明文
 * @returns {boolean}
 */
export function verifyPassword(plainPassword, storedPassword) {
  if (!storedPassword || !plainPassword) return false;
  const parts = storedPassword.split(SEPARATOR);
  // 老密码是纯明文（不含分隔符）
  if (parts.length !== 2) {
    return storedPassword === plainPassword;
  }
  const [saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const hash = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN);
  return hash.toString('hex') === hashHex;
}

/**
 * 检查存储的密码是否已经是哈希格式
 */
export function isHashed(storedPassword) {
  if (!storedPassword) return false;
  return storedPassword.split(SEPARATOR).length === 2;
}

/**
 * 后端密码规则校验(前端规则可被绕过,后端为准)。各页 UI 均要求 6-16 位,
 * 这里取更宽松的安全下限(非空、6-64 位),绝不拒绝任何 UI 能提交的密码,只挡直连接口的空/超短/超长。
 * @param {string} plainPassword 待校验的明文密码
 * @param {string} [lang] 语言('en-US' 返回英文提示,其余返回中文),供注册/重置时把 msg 展示给用户
 * @returns {{ok: boolean, msg?: string}}
 */
export function validatePassword(plainPassword, lang) {
  const isEn = lang === 'en-US';
  if (!plainPassword || typeof plainPassword !== 'string')
    return { ok: false, msg: isEn ? 'Password cannot be empty' : '密码不能为空' };
  if (plainPassword.length < 6)
    return { ok: false, msg: isEn ? 'Password must be at least 6 characters' : '密码长度不能小于6位' };
  if (plainPassword.length > 64)
    return { ok: false, msg: isEn ? 'Password cannot exceed 64 characters' : '密码长度不能超过64位' };
  return { ok: true };
}
