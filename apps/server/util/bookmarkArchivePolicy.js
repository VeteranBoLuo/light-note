export const ARCHIVE_RETRYABLE_REASONS = new Set([
  'FETCH_FAILED',
  'TIMEOUT',
  'DNS_FAILED',
  'RATE_LIMITED',
  'RENDER_TIMEOUT',
  'RENDERER_BUSY',
  'RENDERER_UNAVAILABLE',
]);
const messages = {
  QUEUE_FULL: '待处理存档较多，本次尚未排队，可稍后重试',
  EMPTY_CONTENT: '该页面没有足够的可读正文，可尝试保存具体文章页面',
  JS_REQUIRED: '页面依赖脚本加载，渲染后仍未获得足够正文',
  AUTH_REQUIRED: '该页面需要登录，服务器无法读取你的站点登录状态',
  ACCESS_CHALLENGE: '网站要求访问验证，请在浏览器中打开后查看',
  ACCESS_DENIED: '网站拒绝自动读取，请在浏览器中查看',
  NOT_FOUND: '该页面返回 404 或 410，请检查书签网址',
  TIMEOUT: '读取网页超时，可稍后重试',
  DNS_FAILED: '暂时无法解析网站地址，可稍后重试',
  TLS_FAILED: '网站证书验证失败，请检查原网站',
  RATE_LIMITED: '网站限制了请求频率，请稍后重试',
  CONTENT_TOO_LARGE: '网页超过安全读取大小限制，建议保存具体文章页面',
  NOT_HTML: '该链接是文件或图片，不能作为网页正文存档',
  BLOCKED_HOST: '该地址不允许由服务器读取',
  INVALID_URL: '书签网址格式无效',
  RENDERER_DISABLED: '网页渲染服务未启用，暂时无法读取此页面',
  RENDERER_INSECURE_IDENTITY: '网页渲染服务配置异常，暂时无法读取此页面',
  RENDER_OUTPUT_TOO_LARGE: '渲染页面超过安全读取大小限制，建议保存具体文章页面',
  RENDERER_FAILED: '网页渲染未完成，可稍后重试',
  RENDERER_UNAVAILABLE: '网页渲染服务暂不可用，可稍后重试',
  RENDERER_BUSY: '网页渲染任务较多，可稍后重试',
  RENDER_TIMEOUT: '网页渲染超时，可稍后重试',
  FETCH_FAILED: '暂时无法读取网页，可稍后重试',
  RESOURCE_CHANGED: '书签已被修改或删除，本次结果未保存',
  INTERRUPTED: '存档任务中断，请重试',
};
export function archiveFailure(reason) {
  const code = String(reason || 'FETCH_FAILED').toUpperCase();
  return {
    ok: false,
    reason: code,
    msg: messages[code] || '未能读取网页正文，请稍后重试',
    retryable: ARCHIVE_RETRYABLE_REASONS.has(code),
  };
}
