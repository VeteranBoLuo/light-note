# 合并 plannerHint → description 方案

## 背景

Agent 工具定义有两个字段描述工具的用途：

- **`description`** → 传给 DeepSeek function calling 的 `tools[].function.description`
- **`plannerHint`** → 放进 system prompt 文本，没设就用 `description` 兜底

实际上两者内容高度重复，`plannerHint` 基本只是 `description` + "当用户xxx时调用" 的前缀。

## 改动内容

### 1. 合并 description（每个工具）

把 `plannerHint` 中的独有信息合并进 `description`，保持 `description` 语义完整。

### 2. 删除 plannerHint

从每个工具对象中删掉 `plannerHint` 字段。

### 3. 修改 prompt.js

`buildPlannerPrompt` 中：
```js
// 改前
const hint = tool.plannerHint || tool.description;
// 改后  
const hint = tool.description;
```

### 4. index.js 无变化

工具注册流程不变。

## 具体改法（列出每个工具的 description 改前/改后）

---

### search_knowledge_base

**改前 desc**：搜索知识库，获取轻笺的使用说明、功能教程、常见问题解答、内部知识。当用户问"怎么用"、"什么是"、"如何"等操作性问题时调用。

**改后 desc**：同上。plannerHint 比 description 多了"必须优先调用"和关键词示例，这些更适合放 prompt 规则里，不需要放工具描述。

**plannerHint**：删。

---

### query_bookmarks

**改前 desc**：查询用户的书签。可按关键词、标签名、时间范围筛选。

**改后 desc**：查询用户的书签。可按关键词（匹配名称和URL）、标签名、时间范围筛选。跨类型搜索时建议同时调用 query_notes（笔记）和 query_files（文件）。

---

### query_notes

**改前 desc**：查询用户的笔记。可按关键词（匹配标题和内容）、时间范围筛选。

**改后 desc**：查询用户的笔记。可按关键词（匹配标题和内容）、时间范围筛选。查询结果包含笔记标题、创建时间和内容片段。管理员可通过 user 参数查他人笔记。

---

### query_files

**改前 desc**：查询用户云空间的文件。可按关键词（匹配文件名）、文件类型、时间范围筛选。

**改后 desc**：查询用户云空间的文件。可按关键词（匹配文件名）、文件类型（如 image/pdf/zip/doc）、时间范围筛选。

---

### get_storage_usage

**改前 desc**：查询当前用户的云空间存储用量，包括文件数量和总占用空间。

**改后 desc**：查询当前用户的云空间存储用量，返回文件总数（含正常+回收站）和总占用空间。仅返回当前总量，不支持按时间筛选。

---

### get_security_events

**改前 desc**：查询安全攻击事件记录。可按事件类型、IP、处理状态、时间范围筛选。

**改后 desc**：同上。plannerHint 仅多了"仅管理员可用"前缀——但权限应该在 execute 里通过 requireRoot 控制，不需要写在工具描述里。

---

### get_security_summary

**改前 desc**：获取安全概览，包括 IP 风险排行和账号风险排行。

**改后 desc**：获取安全概览，返回风险最高的 IP 和账号排行。仅返回聚合数据，要查具体事件明细请用 get_security_events。

---

### query_users

**改前 desc**：查询平台用户列表。可按关键词（昵称/邮箱）筛选。

**改后 desc**：同上。无额外信息可合并。

---

### query_api_logs

**改前 desc**：查询 API 请求日志。可按关键词、用户、时间范围筛选。

**改后 desc**：同上。无额外信息可合并。

---

### query_operation_logs

**改前 desc**：查询用户操作日志。可按关键词、模块、用户、时间范围筛选。

**改后 desc**：查询用户操作日志。可按关键词、模块（bookmark/note/file/security）、用户、时间范围筛选。

---

### get_active_users

**改前 desc**：查询最近活跃的用户排行。按 API 请求次数降序排列。

**改后 desc**：查询最近活跃的用户排行，按 API 请求次数降序排列。支持按时间范围筛选。

---

### get_token_usage

**改前 desc**：查询 Token 消耗统计。可按时间范围汇总，也可指定用户。

**改后 desc**：查询 Token 消耗统计，返回请求次数、token 数和费用合计。可按时间范围汇总，可选指定用户。

---

### create_note

**改前 desc**：创建一条新笔记。设定标题和内容后直接保存。

**改后 desc**：创建一条新笔记。设定 title（笔记标题）和 content（正文内容）后直接保存。仅创建笔记本身，不处理标签关联。

---

### query_trash

**改前 desc**：查询回收站中被删除的内容。支持筛选类型（书签/笔记/文件）和关键词搜索。

**改后 desc**：查询回收站中被删除的内容。可按资源类型（bookmark/note/file）、关键词、时间范围筛选。不传 type 则查全部类型。

---

### restore_trash

**改前 desc**：从回收站恢复已删除的内容。支持恢复单个、按类型恢复、按时间范围恢复。

**改后 desc**：从回收站恢复已删除的内容。支持三种恢复方式：按 id 恢复单个、按 type 恢复某类全部、按 timeRange 恢复某时间段删除的。至少需提供一个筛选条件。

---

### add_tag

**改前 desc**：创建一个新标签。如果标签已存在则返回已有信息。只创建标签，不关联资源。

**改后 desc**：同上。plannerHint 无额外信息。

---

### query_tags

**改前 desc**：查询用户的所有标签。可按关键词搜索标签名称。

**改后 desc**：查询用户的所有标签。可按关键词模糊匹配标签名称，返回每个标签关联的资源数量。仅查询，不创建或修改标签。

---

### write_knowledge_base

**改前 desc**：新增或更新知识库条目。仅限 root 用户使用。当用户要求"记录""写一篇""存到知识库""新增知识"时调用。如果 title 匹配已有条目则更新，否则新建。

**改后 desc**：同上。plannerHint 无额外信息，仅措辞差异。

---

## 总结

- 涉及文件：`util/agent/tools/*.js` 中 18 个工具文件 + `util/agent/prompt.js`
- 其中约 10 个工具的 description 需要补充 plannerHint 里的信息（主要是跨工具引用、参数说明、边界限制）
- 约 8 个工具的 description 基本已完整，仅删除 plannerHint 字段
- 无架构变化，不改 agentHandle.js、不改 index.js
