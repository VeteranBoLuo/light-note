import pool from '../db/index.js';

const helpCache = {}; // { 'public': [...], 'all': [...] }
const helpCacheTimers = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

function invalidateCache(key) {
  delete helpCache[key];
  if (helpCacheTimers[key]) {
    clearTimeout(helpCacheTimers[key]);
    delete helpCacheTimers[key];
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从文本中提取有意义的词条（中文按字/词拆分，英文按空格拆分）
 * 简单分词：对中文按单字+二字组合，对英文按单词
 */
function extractTokens(text) {
  const cleaned = text.replace(/[^\w\u4e00-\u9fff]/g, ' ').trim();
  if (!cleaned) return [];

  const tokens = [];

  // 匹配中文/英文/数字
  const chineseChars = cleaned.match(/[\u4e00-\u9fff]+/g) || [];
  const englishWords = cleaned.match(/[a-zA-Z0-9]+/g) || [];

  // 英文单词直接加入
  for (const word of englishWords) {
    if (word.length >= 2) tokens.push(word.toLowerCase());
  }

  // 中文：提取有意义的二字词（相邻字组合）
  for (const cn of chineseChars) {
    for (let i = 0; i < cn.length; i++) {
      // 单字（过滤常见停用字）
      const char = cn[i];
      if (!'的了是在有我有着不就这那和也与而但或及被把对'.includes(char)) {
        tokens.push(char);
      }
      // 二字词
      if (i < cn.length - 1) {
        tokens.push(cn.substring(i, i + 2));
      }
    }
    // 如果整句较短，整句作为一个 token
    if (cn.length <= 8 && cn.length >= 3) {
      tokens.push(cn);
    }
  }

  return [...new Set(tokens)]; // 去重
}

/**
 * 计算查询与文档的相关性得分
 * 规则：命中 title 权重高，命中 content 权重低，匹配词越多得分越高
 */
function calculateScore(queryTokens, title, content) {
  const titleText = title.toLowerCase();
  const contentText = content.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    // title 中匹配权重 10
    if (titleText.includes(token)) {
      score += 10;
    }
    // content 中匹配权重 3
    if (contentText.includes(token)) {
      score += 3;
    }
  }

  // 归一化：除以内容长度（避免长文档天然高分）
  const length = contentText.length || 1;
  return score / Math.sqrt(length);
}

/** 获取知识库数据（带缓存） */
 async function getHelpRows(onlyPublic) {
   const cacheKey = onlyPublic ? 'public' : 'all';
   if (helpCache[cacheKey]) return helpCache[cacheKey];

   const whereClause = onlyPublic ? " WHERE status = 'public'" : '';
   const [rows] = await pool.query(
     `SELECT id, title, SUBSTRING(content, 1, 3000) AS content FROM knowledge_base${whereClause} ORDER BY sort ASC, created_at ASC`,
   );

   helpCache[cacheKey] = rows;
   helpCacheTimers[cacheKey] = setTimeout(() => invalidateCache(cacheKey), CACHE_TTL);
   return rows;
 }

 /**
  * 检索与用户问题最相关的知识库条目
  *
  * @param {string} userId - 用户 ID（保留参数，暂未使用）
  * @param {string} query  - 用户问题
  * @param {number} topK   - 返回最相关的 N 条
  * @param {boolean} onlyPublic - 是否只返回公开条目
  * @returns {Promise<Array<{title: string, content: string, score: number}>>}
  */
 export async function retrieve(userId, query, topK = 3, onlyPublic = true) {
  const rows = await getHelpRows(onlyPublic);
  if (rows.length === 0) return [];

  const queryTokens = extractTokens(query);
  if (queryTokens.length === 0) return [];

  const scored = rows.map((row) => {
    const content = stripHtml(row.content || '');
    const title = row.title || '';
    return {
      title,
      content: content.slice(0, 800),
      score: calculateScore(queryTokens, title, content),
    };
  });

  // 过滤掉得分为 0 的，按分数排序
  const matched = scored.filter((s) => s.score > 0);
  if (matched.length === 0) return [];

  return matched.sort((a, b) => b.score - a.score).slice(0, topK);
}
