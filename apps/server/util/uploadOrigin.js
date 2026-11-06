export function uploadOrigin(env = process.env) {
  // 沙箱的主站地址固定为回环入口，不接受任意域名扩大本地文件读取范围。
  return env.LIGHTNOTE_LOCAL_TEST === '1' ? 'http://localhost:15173' : 'https://boluo66.top';
}

export function isManagedUploadOrigin(origin, env = process.env) {
  return managedUploadOrigins(env).includes(origin);
}

export function managedUploadOrigins(env = process.env) {
  return ['https://boluo66.top', 'http://boluo66.top', ...(env.LIGHTNOTE_LOCAL_TEST === '1' ? [uploadOrigin(env)] : [])];
}

export const managedUploadUrl = (fileName) => `${uploadOrigin()}/uploads/${fileName}`;
