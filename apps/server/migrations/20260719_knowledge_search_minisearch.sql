-- 2026-07-19 本地 MiniSearch 分块检索上线后的知识库维护说明（MySQL 5.7 兼容）
-- 线上知识库幂等更新脚本；部署后按上线流程显式执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @knowledge_guide_id = 'd1a02d70-7366-1173-af23-11928d13c067';
SET @knowledge_guide_title = '知识库说明';
SET @knowledge_guide_content = '# 轻笺知识库维护说明

knowledge_base 是轻笺智域回答项目事实、用法和 FAQ 的权威来源。public 可供普通用户检索，internal 仅 root；“帮助中心 + public”可在 /help 展示并作为可点击来源，FAQ/系统行为通常只作回答依据。

## 检索机制
服务使用本地 MiniSearch BM25+，不调用第三方检索或向量 API。完整 HTML/Markdown 正文会按章节和段落切块；中文使用相邻二字词，英文使用单词。标题、章节标题、正文分级加权，并依次执行精确匹配、内置产品同义词和英文一次编辑距离的保守降级；低置信度结果会被过滤，同一篇知识只返回最相关片段一次。

检索不再只读取前 3000 字，也不再固定返回文章开头。每条交给 Agent 的是实际命中章节，最多 900 字；普通用户默认取前 5 篇。重要结论仍应写在对应章节开头，避免一篇文章混入多个无关主题。

## 缓存与回滚
公开知识和 Root 全量知识分别建立进程内索引，5 分钟 TTL 只作为安全兜底。通过统一知识库写服务或管理接口新增、修改、删除、批量改状态或分类后，索引会立即失效并在下一次检索时重建，不需要等待 5 分钟。异常时会自动回退旧匹配算法；紧急情况下可设置 KNOWLEDGE_SEARCH_ENGINE=legacy 主动回滚。

## 写作规则
一个主题一篇短文，标题覆盖真实问法和稳定同义词，如“积分怎么获得”“帮助中心地址”“待办提醒怎么设置”。先写直接答案，再写步骤和边界；网址写完整 https。新增前查重，功能变更同步旧文，避免多个文档互相冲突。用户余额、用量和私有数据必须再调用实时工具，不能只依赖知识库静态说明。

维护入口 /knowledgeBase；批量维护后必须用典型问法做公开与 Root 两种范围的检索回归。';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @knowledge_guide_id, @knowledge_guide_title, @knowledge_guide_content,
  '内部知识', 'internal', 'markdown', 42, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @knowledge_guide_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @knowledge_guide_id);

UPDATE knowledge_base
SET content = @knowledge_guide_content,
    category = '内部知识',
    status = 'internal',
    type = 'markdown',
    sort = 42,
    updated_by = NULL
WHERE id = @knowledge_guide_id OR title = @knowledge_guide_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @knowledge_guide_id OR title = @knowledge_guide_title;
