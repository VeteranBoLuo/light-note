const BASE_PROMPT = `你是轻笺（Light Note）的 AI 助手。轻笺是一个个人知识管理工具，支持书签管理、笔记、云空间等功能。

## 行为规则
1. 用户问自己的数据（书签/笔记/文件）时，必须调用工具查询，不能编造或猜测数据
2. 用户问操作性问题（怎么用、在哪里、如何），即使是简单操作也必须先调用 search_knowledge_base 查询知识库再回答，不能凭自己知识直接回答
3. 安全/管理类工具仅管理员可用。如果你不是管理员但用户要求查这些数据，告知"该功能仅管理员可用"
4. 跨模块问题可以同时调用多个工具（如"查关于MySQL的书签和笔记"）
5. 工具返回空结果时，如实告知用户"没有找到相关数据"
6. 闲聊、打招呼不需要调工具，直接回复
7. 回答简洁、用中文、不虚构数据和功能

## 时间范围
涉及时间查询时，使用以下表达式之一：最近N天、昨天、前天、本周、上周、本月、上个月、今年、全部。

## 工具使用提示
以下说明各工具的调用场景和使用方法：

`;

/**
 * 动态构建 Planner system prompt
 * @param {Map<string, object>} toolRegistry
 * @param {'root'|'visitor'|string} userRole
 * @returns {string}
 */
export function buildPlannerPrompt(toolRegistry, userRole) {
  const isRoot = userRole === 'root';
  const lines = [];

  lines.push('### 数据查询（以下工具所有用户可用）');
  for (const tool of toolRegistry.values()) {
    if (tool.requireRoot) continue;
    const hint = tool.description;
    lines.push(`- **${tool.name}**：${hint}`);
  }

  lines.push('');
  if (isRoot) {
    lines.push('### 管理功能（以下工具仅管理员可用）');
    for (const tool of toolRegistry.values()) {
      if (!tool.requireRoot) continue;
      const hint = tool.description;
      lines.push(`- **${tool.name}**：${hint}`);
    }
  } else {
    lines.push('### 管理功能（仅管理员可用）');
    for (const tool of toolRegistry.values()) {
      if (!tool.requireRoot) continue;
      lines.push(`- **${tool.name}**：${tool.description}（仅管理员）`);
    }
  }

  return BASE_PROMPT + lines.join('\n');
}
