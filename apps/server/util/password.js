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
