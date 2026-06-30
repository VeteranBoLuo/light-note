# plannerHint 合并方案评审与修正版

## 结论

`plannerHint` 和 `description` 确实应该合并。

当前工具定义里，每个工具同时维护：

- `description`：传给 DeepSeek function calling 的 `tools[].function.description`
- `plannerHint`：通过 `buildPlannerPrompt` 写进 system prompt

这两者描述的是同一件事：工具用途、调用场景、参数边界。现在内容高度重复，长期会出现描述漂移，所以建议删除 `plannerHint`，把必要信息合并进 `description`。

但 `references/merge-plannerhint.md` 不能原样执行。它的方向是对的，但部分“改后 description”与当前代码真实行为不一致，需要先校正。

## 当前代码依据

`router_handle/agentHandle.js` 中：

```js
function getToolDefinitions() {
  const defs = [];
  for (const tool of toolRegistry.values()) {
    defs.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }
  return defs;
}
```

`util/agent/prompt.js` 中：

```js
const hint = tool.plannerHint || tool.description;
```

所以模型在 Planner 阶段同时看到 system prompt 里的 `plannerHint` 和 function calling 里的 `description`。保留两份说明没有明显收益，反而增加维护成本。

## 原方案中的主要问题

### 1. `query_notes` 不应写“返回内容片段”

原方案建议：

```text
查询结果包含笔记标题、创建时间和内容片段。
```

但当前 `query_notes.js` 的 SQL 只查询：

```sql
SELECT n.id, n.title, n.create_time
```

没有返回 `content` 或内容片段。因此 description 不应该承诺“内容片段”。

建议改为：

```text
查询用户的笔记。可按关键词（匹配标题和内容）、时间范围筛选，返回笔记标题和创建时间。管理员可通过 user 参数查询指定用户的笔记。
```

### 2. `query_files` 文件类型示例不准确

原方案写：

```text
文件类型（如 image/pdf/zip/doc）
```

但当前代码实际支持的 `typeMap` 是：

```js
{ image, document, video, audio, other }
```

参数描述里也是：

```text
image(图片)、document(文档)、video(视频)、audio(音频)、other(其他)
```

建议改为：

```text
查询用户云空间的文件。可按关键词（匹配文件名）、文件类型（image/document/video/audio/other）、时间范围筛选。
```

### 3. `get_token_usage` 不应写“可指定用户”

当前 `get_token_usage.js` 的 `parameters` 里虽然有 `user` 字段，但 `execute` 中没有使用它过滤 SQL。

也就是说，现在代码只按时间范围汇总全部用户，不支持按用户过滤。

原方案写：

```text
可按时间范围汇总，可选指定用户。
```

这会误导模型生成 `user` 参数，也会误导用户以为功能已实现。

建议二选一：

- 如果本次只做文案合并：description 写成“不支持按用户筛选”，并移除或暂时保留但不强调 `user` 参数。
- 如果允许补功能：给 `get_token_usage.execute` 增加用户过滤逻辑。

只做合并时，建议 description：

```text
查询 Token 消耗统计，返回请求次数、token 数和费用合计。可按时间范围汇总；当前不支持按指定用户筛选。
```

### 4. `query_api_logs` 不应写“可按用户筛选”

当前 `query_api_logs.js` 的 `parameters` 有 `user`，但 SQL 没有使用 `user` 过滤。

原 description 和 plannerHint 都写了“可按用户筛选”，这和代码不一致。

建议二选一：

- 只合并文案：删除“用户”筛选能力描述。
- 顺手补功能：在 SQL 中支持按用户 ID / 昵称 / 邮箱筛选。

只做合并时，建议 description：

```text
查询 API 请求日志。可按请求路径关键词、时间范围筛选，返回接口路径、状态码和请求时间。
```

### 5. `query_operation_logs` 不应写“可按用户筛选”

当前 `query_operation_logs.js` 的 `parameters` 有 `user`，但 SQL 没有使用 `user` 过滤。

原方案仍写“可按用户筛选”，不准确。

只做合并时，建议 description：

```text
查询用户操作日志。可按关键词、模块（bookmark/note/file/security）、时间范围筛选，返回操作模块、内容和时间。
```

### 6. `get_storage_usage` “总量”描述需要更精确

当前代码分别统计：

- 正常文件数量和大小
- 回收站文件数量和大小

`transform` 会在回收站有文件时展示合计，但 `summarize` 只概括正常文件。

原方案写：

```text
返回文件总数（含正常+回收站）和总占用空间。
```

这不算完全错，但容易让人误解为返回字段就是单一总量。

建议 description：

```text
查询当前用户的云空间存储用量，返回正常文件数量和占用空间，并在有回收站文件时附带回收站数量、大小及合计。不支持按时间筛选。
```

### 7. `search_knowledge_base` 的强制规则不要只留在 description

原方案说 `plannerHint` 中“必须优先调用”和“不能未查询就回答”更适合放 prompt 规则里，这个判断是对的。

当前 `BASE_PROMPT` 已经有规则：

```text
用户问操作性问题（怎么用、在哪里、如何），即使是简单操作也必须先调用 search_knowledge_base 查询知识库再回答，不能凭自己知识直接回答
```

所以 `search_knowledge_base.description` 不需要重复写强制规则，只要说明工具用途即可。

建议 description：

```text
搜索知识库，获取轻笺的使用说明、功能教程、常见问题解答和内部知识。用于回答“怎么用”“在哪里设置”“是什么功能”“如何操作”等操作性问题。
```

## 推荐改法

### 第一步：把必要的 `plannerHint` 信息并入 `description`

合并时只保留三类信息：

- 工具用途
- 真实支持的筛选参数
- 重要边界，例如“只查询不创建”“不处理标签关联”“至少提供一个恢复条件”

不要把没有实现的能力写进去。

### 第二步：删除所有工具对象里的 `plannerHint`

涉及文件：

```text
util/agent/tools/*.js
```

当前共 18 个工具都有 `plannerHint`：

```text
add_tag
create_note
get_active_users
get_security_events
get_security_summary
get_storage_usage
get_token_usage
query_api_logs
query_bookmarks
query_files
query_notes
query_operation_logs
query_tags
query_trash
query_users
restore_trash
search_knowledge_base
write_knowledge_base
```

### 第三步：修改 `buildPlannerPrompt`

把：

```js
const hint = tool.plannerHint || tool.description;
```

改为：

```js
const hint = tool.description;
```

非管理员分支现在本来就是直接用 `tool.description`，无需额外变化。

### 第四步：`index.js` 不需要改

工具注册仍然从 `util/agent/tools/index.js` 导出数组，不受影响。

## 建议的 description 修正版

### search_knowledge_base

```text
搜索知识库，获取轻笺的使用说明、功能教程、常见问题解答和内部知识。用于回答“怎么用”“在哪里设置”“是什么功能”“如何操作”等操作性问题。
```

### query_bookmarks

```text
查询用户的书签。可按关键词（匹配名称和 URL）、标签名、时间范围筛选。跨类型搜索时可同时调用 query_notes 和 query_files。
```

### query_notes

```text
查询用户的笔记。可按关键词（匹配标题和内容）、时间范围筛选，返回笔记标题和创建时间。管理员可通过 user 参数查询指定用户的笔记。
```

### query_files

```text
查询用户云空间的文件。可按关键词（匹配文件名）、文件类型（image/document/video/audio/other）、时间范围筛选。
```

### get_storage_usage

```text
查询当前用户的云空间存储用量，返回正常文件数量和占用空间，并在有回收站文件时附带回收站数量、大小及合计。不支持按时间筛选。
```

### get_security_events

```text
查询安全攻击事件记录。可按攻击类型、源 IP、处理状态（handled/unhandled）、时间范围筛选。
```

### get_security_summary

```text
获取安全概览，返回风险最高的 IP 和账号排行。不返回事件明细；查询具体事件请使用 get_security_events。
```

### query_users

```text
查询平台用户列表。可按关键词匹配用户昵称、邮箱或用户 ID。
```

### query_api_logs

```text
查询 API 请求日志。可按请求路径关键词、时间范围筛选，返回接口路径、状态码和请求时间。
```

备注：当前代码不支持按用户筛选。若要保留 user 参数描述，应先补 SQL 过滤逻辑。

### query_operation_logs

```text
查询用户操作日志。可按关键词、模块（bookmark/note/file/security）、时间范围筛选，返回操作模块、内容和时间。
```

备注：当前代码不支持按用户筛选。若要保留 user 参数描述，应先补 SQL 过滤逻辑。

### get_active_users

```text
查询最近活跃的用户排行，按 API 请求次数降序排列。支持按时间范围筛选。
```

### get_token_usage

```text
查询 Token 消耗统计，返回请求次数、token 数和费用合计。可按时间范围汇总；当前不支持按指定用户筛选。
```

备注：当前代码不支持按用户筛选。若要保留 user 参数描述，应先补 SQL 过滤逻辑。

### create_note

```text
创建一条新笔记。参数 title 为笔记标题，content 为正文内容。仅创建笔记本身，不处理标签关联。
```

### query_trash

```text
查询回收站中被删除的内容。可按资源类型（bookmark/note/file）、关键词、时间范围筛选。不传 type 则查询全部类型。
```

### restore_trash

```text
从回收站恢复已删除的内容。支持按 id 恢复单个、按 type 恢复某类内容、按 timeRange 恢复某时间段删除的内容；至少应提供一个筛选条件以避免误恢复。
```

注意：当前代码没有强制“至少一个筛选条件”，不传任何条件时会恢复全部回收站内容。建议顺手在 `execute` 中加保护。

### add_tag

```text
创建一个新标签。如果标签已存在则返回已有信息。只创建标签，不关联资源。
```

### query_tags

```text
查询用户的所有标签。可按关键词模糊匹配标签名称，返回每个标签关联的资源数量。仅查询，不创建或修改标签。
```

### write_knowledge_base

```text
新增或更新知识库条目。当用户要求“记录”“写一篇”“存到知识库”“新增知识”时使用。如果 title 匹配已有条目则更新，否则新建。
```

## 可选但建议一起修的代码问题

### 1. `restore_trash` 应防止无条件恢复全部

当前 `restore_trash.execute` 中：

```js
const types = type ? [type] : ['bookmark', 'note', 'file'];
```

如果没有传 `type`、`id`、`timeRange`，会恢复当前用户所有回收站内容。

建议增加保护：

```js
if (!type && !id && !args.timeRange) {
  return { error: 'FILTER_REQUIRED', message: '请指定要恢复的内容、类型或时间范围' };
}
```

并在 `transform` 里处理 `raw.error`。

### 2. 对未实现的 `user` 参数做取舍

以下工具声明了 `user` 参数，但当前执行逻辑没有用它过滤：

- `get_token_usage`
- `query_api_logs`
- `query_operation_logs`

建议不要只改 description。更好的做法是：

- 要么实现按用户过滤；
- 要么删除这些工具里的 `user` 参数，避免模型继续传无效参数。

## 最终推荐

这次改动可以分成两个 PR 或两个步骤：

1. **低风险清理**：合并 `plannerHint` 到 `description`，删除 `plannerHint`，修改 `prompt.js`。
2. **行为修复**：修复 `restore_trash` 无条件恢复风险，并处理三个未实现的 `user` 参数。

如果只做第 1 步，务必使用上面的修正版 description，不要照搬原 `merge-plannerhint.md`。
