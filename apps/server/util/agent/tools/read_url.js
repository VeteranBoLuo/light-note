import { fetchWebMeta } from '../../fetchWebMeta.js';

const REASON_MSG = {
  INVALID_URL: '网址格式无效',
  UNSUPPORTED_PROTOCOL: '仅支持 http/https 链接',
  BLOCKED_HOST: '拒绝访问内网/非法地址',
  NOT_HTML: '该链接不是网页(可能是文件、图片或需要登录)',
  FETCH_FAILED: '抓取失败,可能无法访问或超时',
  EMPTY_CONTENT: '未提取到有效正文',
};

export default {
  name: 'read_url',
  description:
    '读取一个网页链接的标题、描述与正文摘录,用于"读这个链接/总结这个网页/根据这个网址回答我"等请求。返回内容后请据实总结或回答,不要编造网页里没有的信息。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要读取的网页链接,必填' },
    },
    required: ['url'],
  },
  requireRoot: false,
  isWrite: false,
  async execute(args) {
    let url = String(args.url || '').trim();
    if (!url) return { error: 'URL_REQUIRED', message: '网址不能为空' };
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const meta = await fetchWebMeta(url);
    if (!meta.ok) return { error: meta.reason, message: REASON_MSG[meta.reason] || '读取失败' };
    return {
      url: meta.url,
      title: meta.title,
      description: meta.description,
      siteName: meta.siteName,
      text: meta.bodyText,
    };
  },
  transform(raw) {
    if (raw.error) return `读取失败:${raw.message}`;
    // 结构化正文喂给模型,由模型据实总结/回答
    return [
      `链接:${raw.url}`,
      `标题:${raw.title || '(无)'}`,
      raw.description ? `描述:${raw.description}` : '',
      raw.siteName ? `站点:${raw.siteName}` : '',
      `正文摘录:\n${raw.text || '(无)'}`,
    ]
      .filter(Boolean)
      .join('\n');
  },
  summarize(raw) {
    if (raw.error) return `读取链接失败:${raw.message}`;
    return `读取链接「${raw.title || raw.url}」`;
  },
};
