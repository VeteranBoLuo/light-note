const URL_PATTERN = /https?:\/\/\S+|www\.\S+/i;
const URL_READING_INTENT =
  /(?:总结|概括|读取|分析|看看|打开).{0,12}(?:网页|链接|网址)|(?:网页|链接|网址).{0,12}(?:总结|概括|读取|分析|看看|打开)|(?:summari[sz]e|read|analy[sz]e|open).{0,20}(?:webpage|page|url|link)/i;

/**
 * 必填输入缺失属于产品参数校验，不交给模型随机决定。
 * 这里不负责判断业务意图，只在意图文本已经明确、且服务端能确定缺少哪类输入时返回澄清。
 */
export function resolveAgentInputClarification({ message, contextTypes = [], locale = 'zh-CN' } = {}) {
  const text = String(message || '').trim();
  const contexts = new Set(
    (Array.isArray(contextTypes) ? contextTypes : []).map((item) =>
      String(item || '')
        .trim()
        .toLowerCase(),
    ),
  );
  if (
    text &&
    URL_READING_INTENT.test(text) &&
    !URL_PATTERN.test(text) &&
    !contexts.has('bookmark') &&
    !contexts.has('url') &&
    !contexts.has('web')
  ) {
    return String(locale || '')
      .toLowerCase()
      .startsWith('en')
      ? 'Please paste the webpage URL you want me to read or summarize.'
      : '请粘贴需要读取或总结的网页链接。';
  }
  return '';
}
