export function afdianError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function getAfdianApiConfig({ required = true } = {}) {
  const creatorUserId = String(process.env.AFDIAN_CREATOR_USER_ID || '').trim();
  const apiToken = String(process.env.AFDIAN_API_TOKEN || '').trim();
  if (!creatorUserId || !apiToken) {
    if (!required) return null;
    throw afdianError('AFDIAN_API_NOT_CONFIGURED', '爱发电订单同步暂不可用', 503);
  }
  return { creatorUserId, apiToken };
}

export function getAfdianFeatureState() {
  return {
    orderSyncAvailable: Boolean(getAfdianApiConfig({ required: false })),
  };
}
