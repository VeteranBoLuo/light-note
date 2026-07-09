import axios from 'axios';
import { resultData } from '../util/common.js';
import pool from '../db/index.js';
import { Transform } from 'stream';
import { Agent as HttpAgent } from 'http';
import { fetchWebMeta } from '../util/fetchWebMeta.js';
import { requestDeepSeek } from '../util/agent/deepseekClient.js';

// 创建自定义转换流优化数据处理
class SSETransform extends Transform {
  constructor() {
    super({ objectMode: true });
    this.buffer = '';
  }

  _transform(chunk, encoding, callback) {
    const chunkStr = chunk.toString();
    this.buffer += chunkStr;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop(); // 保留未完成的行

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('data:')) {
        this.push(trimmedLine + '\n\n');
      }
    }

    callback();
  }
}

const extractTextFromProvider = (payload) => {
  if (!payload) return '';
  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch (error) {
      return String(payload).trim();
    }
  }
  return String(
    data?.output?.text ||
      data?.output?.choices?.[0]?.message?.content ||
      data?.text ||
      data?.content ||
      '',
  ).trim();
};

const extractSvg = (text) => {
  if (!text) return '';
  const cleaned = String(text).replace(/```svg|```/gi, '').trim();
  const match = cleaned.match(/<svg[\s\S]*<\/svg>/i);
  return match?.[0]?.trim() || '';
};

const encodeSvgToDataUrl = (svg) => {
  const normalized = String(svg || '').replace(/\r?\n|\r/g, '').trim();
  const encoded = Buffer.from(normalized, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
};

export const generateTagIcon = async (req, res) => {
  try {
    const tagName = String(req.body?.tagName || req.body?.name || '').trim();
    if (!tagName) {
      return res.status(400).send(resultData(null, 400, '缺少标签名称'));
    }

    if (!process.env.DASHSCOPE_API_KEY) {
      return res.status(500).send(resultData(null, 500, '未配置 DASHSCOPE_API_KEY，请检查 .env 文件'));
    }

    const APP_ID = process.env.DASHSCOPE_APP_ID || 'ff8422dbcc784e8ba170b8ed0408c19b';
    const prompt = [
      `请根据标签名称生成一个简洁的图标：${tagName}`,
      '仅输出一个完整的 SVG 字符串，不要输出 markdown，不要输出解释。',
      '图标适配 20px 左右显示，viewBox 固定为 0 0 24 24。',
      '只使用 1 到 2 种颜色，不要渐变，不要阴影，不要滤镜。',
      '不要包含脚本、foreignObject、外链资源。',
    ].join('');

    const requestData = {
      input: { prompt },
      parameters: {
        incremental_output: false,
        model: 'qwen-plus',
        max_tokens: 512,
        enable_web_search: false,
        has_thoughts: false,
        enable_thinking: false,
      },
    };

    const response = await axios({
      method: 'post',
      url: `https://dashscope.aliyuncs.com/api/v1/apps/${APP_ID}/completion`,
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      data: requestData,
      responseType: 'json',
      timeout: 30000,
    });

    const rawText = extractTextFromProvider(response?.data);
    const svg = extractSvg(rawText);
    if (!svg) {
      return res.status(500).send(resultData(null, 500, 'AI 返回结果解析失败'));
    }

    res.send(
      resultData({
        svg,
        iconUrl: encodeSvgToDataUrl(svg),
      }),
    );
  } catch (error) {
    const statusCode = error?.response?.status;
    const providerMsg = error?.response?.data?.message || error?.response?.data?.code || error.message;
    console.error('生成标签图标错误:', providerMsg);
    if (statusCode === 401) {
      return res.status(500).send(resultData(null, 500, '生成标签图标失败：DashScope 鉴权失败，请检查 DASHSCOPE_API_KEY 或应用权限配置'));
    }
    res.status(500).send(resultData(null, 500, '生成标签图标失败: ' + providerMsg));
  }
};

export const generateBookmarkMeta = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).send(resultData(null, 400, '缺少URL参数'));
    }

    // 验证URL格式
    const urlRegex = /^https?:\/\/.+/;
    if (!urlRegex.test(url)) {
      return res.send(resultData(null, 400, '请输入正确的书签地址'));
    }

    // 抓取网页真实内容：LLM(DeepSeek/千问)本身无联网能力,由后端抓取后再交给模型总结,
    // 避免模型仅凭域名瞎猜(抓取失败则降级为让模型基于网址谨慎推测)
    const meta = await fetchWebMeta(url);

    // 拉取用户已有标签,让 AI 从中推荐关联标签(不够再建议新标签)
    const metaUserId = req.user?.id;
    let userTags = [];
    if (metaUserId) {
      const [tagRows] = await pool.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [metaUserId]);
      userTags = tagRows;
    }
    const tagNameList = userTags.map((t) => t.name);

    const pageInfo = meta.ok
      ? [
          `网页标题：${meta.title || '（无）'}`,
          `网页描述：${meta.description || '（无）'}`,
          meta.siteName ? `站点名称：${meta.siteName}` : '',
          meta.keywords ? `关键词：${meta.keywords}` : '',
          meta.bodyText ? `正文摘录：${meta.bodyText}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '（未能读取到该网页的内容，请仅根据网址本身合理推测，不要编造具体功能或名称。）';

    const userPrompt = [
      '请为下面这个网页生成适合书签保存的名称、描述,并推荐关联标签。',
      '',
      `网址：${url}`,
      pageInfo,
      '',
      '要求：',
      '- name:简洁自然,像用户自己会给书签起的标题,不超过 20 个字。',
      '- description:用一句简短自然的中文概括网站内容或用途,不超过 50 个字。',
      `- 已有标签(JSON 数组):${JSON.stringify(
        tagNameList,
      )}。从"已有标签"里挑选与该网页最相关的标签放进 matchedTags(0-4 个,必须与列表中的文字完全一致);若都不合适,matchedTags 返回空数组,并在 newTags 里给出 1-3 个建议新增的简短标签名(2-6 个字)。`,
      '- 只输出 JSON 对象,格式必须是 {"name":"...","description":"...","matchedTags":["..."],"newTags":["..."]},不要输出 markdown、代码块或多余解释。',
    ].join('\n');

    const { content } = await requestDeepSeek([
      { role: 'system', content: '你是书签整理助手,只输出符合要求的 JSON,不输出任何多余内容。' },
      { role: 'user', content: userPrompt },
    ]);
    const cleanText = String(content || '')
      .replace(/```json|```/g, '')
      .trim();

    let parsed = null;
    try {
      parsed = JSON.parse(cleanText);
    } catch (error) {
      const match = cleanText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (!parsed || (!parsed.name && !parsed.description)) {
      return res.status(500).send(resultData(null, 500, 'AI 返回结果解析失败'));
    }

    // 把 AI 挑的已有标签名映射成标签 id(大小写/空格不敏感);newTags 为不在已有列表里的建议新标签
    const norm = (s) => String(s || '').trim().toLowerCase();
    const matchedNames = Array.isArray(parsed.matchedTags) ? parsed.matchedTags : [];
    const matchedTagIds = userTags
      .filter((t) => matchedNames.some((n) => norm(n) === norm(t.name)))
      .map((t) => t.id);
    const newTags = (Array.isArray(parsed.newTags) ? parsed.newTags : [])
      .map((s) => String(s || '').trim())
      .filter((n) => n && !userTags.some((t) => norm(t.name) === norm(n)))
      .slice(0, 3);
    res.send(
      resultData({
        name: String(parsed.name || '').trim(),
        description: String(parsed.description || '').trim(),
        matchedTagIds,
        newTags,
      }),
    );
  } catch (error) {
    const providerMsg = error?.message || String(error);
    console.error('生成书签元信息错误:', providerMsg); // 完整错误(可能含供应商原文 / API key 片段)只进服务器日志
    // 不把供应商原始报错透传前端(曾把 API key 尾号暴露到界面):鉴权/额度类给管理员可辨识的提示,其余归为通用失败
    const isAuthOrQuota =
      /auth|api[\s_-]*key|invalid|unauthor|401|403|余额|balance|insufficient|quota|欠费|expired|过期/i.test(providerMsg);
    const friendly = isAuthOrQuota
      ? 'AI 生成服务暂不可用(鉴权或额度异常),请联系管理员检查配置'
      : 'AI 生成失败,请稍后重试';
    res.status(500).send(resultData(null, 500, friendly));
  }
};

export const generateBookmarkDescription = generateBookmarkMeta;

/**
 * 笔记组手 —— AI 辅助编辑（润色、摘要、纠错、自定义处理等）
 * 与 receiveMessage 共享 DashScope 服务，不注入知识库上下文
 */
export const assistNote = async (req, res) => {
  req.setTimeout(0);

  let stream = false;

  try {
    const { message, sessionId = '' } = req.body;
    stream = req.body.stream ?? false;
    const APP_ID = process.env.DASHSCOPE_APP_ID;

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
        'Content-Encoding': 'identity',
      });
      res.flushHeaders?.();
    }

    const requestData = {
      input: { prompt: message, session_id: sessionId },
      parameters: {
        incremental_output: true,
        model: 'qwen-plus',
        stream_interval: 100,
        max_tokens: 4096,
        enable_web_search: false,
        has_thoughts: false,
        enable_thinking: false,
      },
    };

    const config = {
      method: 'post',
      url: `https://dashscope.aliyuncs.com/api/v1/apps/${APP_ID}/completion`,
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': stream ? 'enable' : 'disable',
        Accept: 'text/event-stream',
      },
      data: requestData,
      responseType: stream ? 'stream' : 'json',
      timeout: 30000,
      transformResponse: [(data) => data],
      httpAgent: new HttpAgent({
        keepAlive: true,
        maxSockets: 1,
      }),
    };

    const response = await Promise.race([
      axios(config),
      new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时，请稍后重试')), 30000)),
    ]);

    if (stream) {
      const sseTransform = new SSETransform();

      response.data.pipe(sseTransform);

      let lastFlushTime = Date.now();
      const FLUSH_INTERVAL = 50;

      sseTransform.on('data', (chunk) => {
        res.write(chunk);
        const now = Date.now();
        if (now - lastFlushTime >= FLUSH_INTERVAL) {
          if (typeof res.flush === 'function') {
            res.flush();
          } else {
            res.socket?.cork();
            process.nextTick(() => res.socket?.uncork());
          }
          lastFlushTime = now;
        }
      });

      sseTransform.on('end', () => {
        if (typeof res.flush === 'function') res.flush();
        res.write('data: [DONE]\n\n');
        res.end();
      });

      sseTransform.on('error', (error) => {
        console.error('笔记组手 SSE 转换错误:', error);
        try {
          res.write('data: {"error": "流处理异常"}\n\n');
          res.end();
        } catch (e) {}
      });

      req.on('close', () => {
        sseTransform.destroy();
        response.data.destroy();
      });
    } else {
      const rawText = (() => {
        const data = response?.data;
        if (!data) return '';
        let parsed = data;
        if (typeof data === 'string') {
          try { parsed = JSON.parse(data); } catch { return data.trim(); }
        }
        return String(parsed?.output?.text || parsed?.text || parsed?.content || '').trim();
      })();
      if (!rawText) {
        return res.status(500).send(resultData(null, 500, 'AI 返回内容为空'));
      }
      res.send(resultData({ response: rawText }));
    }
  } catch (error) {
    console.error('笔记组手请求错误:', error.message);
    if (stream) {
      try {
        res.write(`data: ${JSON.stringify({ error: '服务异常', message: error.message })}\n\n`);
        res.end();
      } catch (e) {}
    } else {
      res.status(500).send(resultData(null, 500, 'AI 服务异常: ' + error.message));
    }
  }
};
