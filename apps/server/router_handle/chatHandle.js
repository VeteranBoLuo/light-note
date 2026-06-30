import axios from 'axios';
import { resultData } from '../util/common.js';
import { Transform } from 'stream';
import { Agent as HttpAgent } from 'http';
import { retrieve } from '../util/knowledgeService.js';

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

export const receiveMessage = async (req, res) => {
  req.setTimeout(0);

  // 在函数作用域顶部声明变量，确保catch块可以访问
  let stream = false;

  try {
    const {
      message,
      sessionId = '',
      useInternetSearch = false,
      enableThinking = false,
      enableTranslation = false,
      translationConfig = {},
    } = req.body;
    stream = req.body.stream ?? false; // 提取到外层作用域
    const APP_ID = process.env.DASHSCOPE_APP_ID 

    // 语言映射
    const langMap = {
      auto: '自动识别',
      zh: '中文',
      en: '英文',
      ja: '日文',
      ko: '韩文',
      fr: '法文',
      de: '德文',
      es: '西班牙文',
    };

    // 构建 prompt
    let prompt = message;
    if (enableTranslation) {
      const { source = 'auto', target = 'en' } = translationConfig;
      const sourceLang = source === 'auto' ? '' : langMap[source] || source;
      const targetLang = langMap[target] || target;
      const prefix = sourceLang ? `将以下${sourceLang}内容翻译成${targetLang}：` : `将以下内容翻译成${targetLang}：`;
      prompt = prefix + message;
    }

    // 非翻译模式下检索帮助中心数据作为参考
    if (!enableTranslation) {
      // 告知 AI 是否开启了联网搜索
      const webSearchHint = useInternetSearch
        ? '注意：本次对话已开启联网搜索能力，对于实时信息（天气、新闻、股价等）请在回答后主动联网查询获取最新数据。'
        : '注意：本次对话未开启联网搜索。如果用户询问实时信息（天气、新闻、股价等），请告知用户可以开启联网搜索功能来获取最新信息。';

      try {
        const knowledge = await retrieve(req.user.id, message, 3);
        if (knowledge.length > 0) {
          const context = knowledge
            .map((k) => `【${k.title}】\n${k.content}`)
            .join('\n\n---\n\n');
          prompt =
            `以下是与用户问题相关的内容可供参考：\n\n${context}\n\n---\n\n` +
            `请优先基于上述参考资料回答用户的问题。如果参考资料中不包含答案或用户问的是具体的访问地址、功能路径等信息，请直接说不知道或建议用户查阅帮助中心，不要自行编造。\n${webSearchHint}\n\n用户问题：${message}`;
        } else {
          prompt = `请根据你的知识回答用户的问题。注意：如果不知道确切答案（特别是具体的功能路径、访问地址等信息），请直接告诉用户你不确定，建议查阅帮助中心或联系管理员，不要自行编造。\n${webSearchHint}\n\n用户问题：${message}`;
        }
      } catch (err) {
        console.error('帮助中心检索失败，不影响正常回答:', err.message);
      }
    }

    if (stream) {
      // 🔧 优化响应头设置
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
        'Content-Encoding': 'identity', // 防止压缩缓冲
      });
      res.flushHeaders?.();
    }

    const requestData = {
      input: { prompt: prompt, session_id: sessionId },
      parameters: {
        incremental_output: true,
        model: 'qwen-plus', // 显式指定模型名称
        stream_interval: 100,
        max_tokens: 4096,
        enable_web_search: useInternetSearch,
        has_thoughts: enableThinking,
        enable_thinking: enableThinking,
      },
    };

    const config = {
      method: 'post',
      url: `https://dashscope.aliyuncs.com/api/v1/apps/${APP_ID}/completion`,
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': stream ? 'enable' : 'disable',
        Accept: 'text/event-stream', // 明确接受流式响应
      },
      data: requestData,
      responseType: stream ? 'stream' : 'json',
      timeout: 30000, // 设置30秒超时
      // 🔧 重要：禁用axios的响应转换
      transformResponse: [(data) => data],
      // 优化http客户端设置
      httpAgent: new HttpAgent({
        keepAlive: true,
        maxSockets: 1, // 限制连接数避免竞争
      }),
    };

    // 添加超时处理
    const response = await Promise.race([
      axios(config),
      new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时，请稍后重试')), 30000)),
    ]);

    if (stream) {
      const sseTransform = new SSETransform();

      // 管道式处理，避免数据堆积
      response.data.pipe(sseTransform);

      let lastFlushTime = Date.now();
      const FLUSH_INTERVAL = 50; // 50ms刷新间隔

      sseTransform.on('data', (chunk) => {
        const now = Date.now();

        // 立即写入基础数据
        res.write(chunk);

        // 控制flush频率，平衡实时性和性能
        if (now - lastFlushTime >= FLUSH_INTERVAL) {
          if (typeof res.flush === 'function') {
            res.flush();
          } else {
            res.socket?.cork(); // 收集数据
            process.nextTick(() => res.socket?.uncork()); // 下一Tick统一发送
          }
          lastFlushTime = now;
        }
      });

      sseTransform.on('end', () => {
        // 发送结束前强制flush
        if (typeof res.flush === 'function') res.flush();
        res.write('data: [DONE]\n\n');
        res.end();
      });

      sseTransform.on('error', (error) => {
        console.error('SSE转换错误:', error);
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
      const aiReply = extractTextFromProvider(response?.data);
      if (!aiReply) {
        return res.status(500).send(resultData(null, 500, 'AI 返回内容为空'));
      }
      res.send(resultData({ response: aiReply }));
    }
  } catch (error) {
    console.error('AI 请求错误:', error.message);
    if (stream) {
      try {
        // 发送格式化错误信息
        res.write(`data: ${JSON.stringify({ error: '服务异常', message: error.message })}\n\n`);
        res.end();
      } catch (e) {}
    } else {
      res.status(500).send(resultData(null, 500, 'AI 服务异常: ' + error.message));
    }
  }
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

    if (!process.env.DASHSCOPE_API_KEY) {
      return res.status(500).send(resultData(null, 500, '未配置 DASHSCOPE_API_KEY，请检查 .env 文件'));
    }

    // 验证URL格式
    const urlRegex = /^https?:\/\/.+/;
    if (!urlRegex.test(url)) {
      return res.send(resultData(null, 400, '请输入正确的书签地址'));
    }

    const APP_ID = process.env.DASHSCOPE_APP_ID || 'ff8422dbcc784e8ba170b8ed0408c19b';

    const prompt = [
      `请根据这个网址生成一个适合书签保存的名称和描述：${url}`,
      '输出 JSON 对象，格式必须是 {"name":"...","description":"..."}。',
      'name 要简洁自然，像用户自己会给书签起的标题，不超过 20 个字。',
      'description 用一句简短自然的中文概括网站内容或用途，不超过 50 个字。',
      '不要输出 markdown，不要输出代码块，不要输出多余解释。',
    ].join('');

    const requestData = {
      input: { prompt: prompt },
      parameters: {
        incremental_output: false,
        model: 'qwen-plus', // 显式指定模型名称
        max_tokens: 512,
        enable_web_search: true,
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
      },
      data: requestData,
      responseType: 'json',
      timeout: 30000,
    };

    const response = await axios(config);
    const rawText = String(response.data.output.text || '').trim();
    const cleanText = rawText.replace(/```json|```/g, '').trim();

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

    res.send(
      resultData({
        name: String(parsed.name || '').trim(),
        description: String(parsed.description || '').trim(),
      }),
    );
  } catch (error) {
    const statusCode = error?.response?.status;
    const providerMsg = error?.response?.data?.message || error?.response?.data?.code || error.message;
    console.error('生成书签元信息错误:', providerMsg);
    if (statusCode === 401) {
      return res
        .status(500)
        .send(resultData(null, 500, '生成名称和描述失败：DashScope 鉴权失败，请检查 DASHSCOPE_API_KEY 或应用权限配置'));
    }
    res.status(500).send(resultData(null, 500, '生成名称和描述失败: ' + providerMsg));
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
