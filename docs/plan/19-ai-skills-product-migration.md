# 19｜轻笺 AI 产品形态重构：模块化 Skills 与统一用量内核

> 状态：本地实现与验收已完成，待可连接环境执行只读 Schema 门禁；提交、合并与发布仍需单独授权  
> 基线：`main@a01553f3e63c2e949566c6de5955c99e7d689190`  
> 更新：2026-08-23

## 1. 最终决策

轻笺不再把“万能通用聊天助手”作为一级产品。AI 改为嵌入笔记、书签、文件、待办、资源中心和帮助中心的模块化 Skill。

这不是给旧 Agent 再加一层模式，也不是复制多套 Agent。页面和用户动作负责确定任务，服务端 Skill Registry 负责确定范围、权限、模型策略和输出契约，模型只处理该 Skill 内仍然开放的语言理解与生成。

最终入口：

- 笔记：当前笔记、当前选区、明确选中的多篇笔记；
- 书签：网页信息解析、总结、比较和整理预览；
- 文件：当前文件或明确选中的少量文件；
- 待办：自然语言转结构化草稿，写入继续走预览与确认；
- 资源中心：跨模块私有资料的只读检索问答；
- 帮助中心：只读取公开帮助知识；
- 后台固定卡片：只解读已经由确定性接口返回的数据。

不再保留普通知识闲聊、写作闲聊或跨模块自由规划作为产品目标。旧会话只保留查看、导出和删除，不允许继续发送。

## 2. 根因与路径比较

### 2.1 直接修补旧 Agent

继续为“换一种说法不选工具、材料串线、时间范围继承、工具不支持”增加关键词、Prompt 和特殊分支，短期能修一个例子，但无法建立以下不变量：

- 当前页面已经确定的对象仍会被模型重新猜测；
- 全局历史同时承担语言承接和事实来源，资源范围会漂移；
- 55 项能力同时暴露，模型选择错误会沿规划链放大；
- 各业务可以绕过额度、日志或安全治理直接调用模型；
- 重试、修复、二次生成可能被分别扣费或完全不计费。

此路径不再采用。

### 2.2 从唯一事实源解决

采用以下系统不变量：

1. 页面选择 Skill，模型不选择业务模块；
2. 资源 ID 只是客户端候选，服务端按 owner 重读资源和版本；
3. thread 绑定 `skillId + version + actor + subject + scopeDigest`；
4. 对话历史只帮助理解省略，事实每轮重新读取；
5. 写 Skill 只能返回预览，现有业务 Service 决定真实写入；
6. 所有 Provider 调用必须处于一个 AI Execution 中；
7. 一次用户动作只占位一次、结算一次，内部所有模型调用累计；
8. 没有治理上下文的模型调用在 Gateway 层失败关闭；
9. 本地确定性解析与不调用模型的 OCR 不扣模型额度，但单独受计算资源限制；
10. 系统后台和 Root 模型调用也必须记入明确的系统/管理预算，不存在隐形免费调用。

## 3. 目标架构

```text
业务页面
  -> AI Skill API
     -> Skill Registry（任务、版本、权限、范围、输出契约）
     -> Context Resolver（owner、资源版本、scopeDigest）
     -> AI Execution（一次动作、一次额度占位/结算）
        -> AI Gateway（一个或多个 Provider Span）
     -> Output Validator / Evidence / Coverage
     -> Preview / Result / Receipt
```

共享内核保留并重组已有资产：Provider 策略、Gateway、Quota、日志、owner/role/subject、证据、Coverage、确认、幂等、Unknown 终态和恢复能力。

最终删除无消费方的通用 Intent Compiler、Capability Router、Execution Planner、Memory、Follow-up 和通用 Agent 写链路。

## 4. 统一 AI Execution 与额度口径

### 4.1 根执行

每次用户动作创建一个 `ai_execution`：

- `requestId` 幂等；
- 明确 actor、subject、surface、skill/task、billing policy；
- 第一次真实访问 Provider 前懒占位；纯缓存、确定性解析和本地处理不占模型额度；
- 内部每次同步、流式、修复和重试都是 `provider_span`；
- 结束时汇总所有 span 的 Provider usage，一次结算；
- 成功、失败、取消和额度拒绝都有稳定终态。

### 4.2 用量分层

分别记录：

- Provider 原始 prompt/completion/total tokens；
- Provider 与模型；
- 估算成本；
- 实际向用户额度结算的 tokens；
- 是否缓存命中、是否调用模型、是否因基础设施失败而保守结算。

第一版继续使用现有 token 额度，避免改变用户认知。内核保留未来转换为统一 credits 的位置，但不在本轮偷偷改变换算规则。

### 4.3 重试与失败

- 同一次请求内的结构修复、Provider 回退和有限重试归入同一 execution；
- 用户主动点击“重新生成”是新的 execution；
- Provider 已消耗但 usage 缺失时，按保守策略结算，不允许失败即免费；
- 配额存储不可用时失败关闭，不访问 Provider；
- 结算失败保留占位并记录待对账状态。

## 5. Skill 协议

请求固定包含：

```text
protocolVersion / requestId / skillId / skillVersion
input / scope.resourceRefs / threadId / client
```

响应固定包含：

```text
protocolVersion / requestId / skillId / skillVersion / status
threadId / scopeDigest / result / sources / coverage
availableActions / receipt / error
```

协议采用封闭世界：未知字段、未知 Skill、版本不符、越权资源、超范围资源和无效终态全部拒绝。

## 6. 会话策略

- 单次改写、解析、待办草稿：零历史；
- 当前笔记改写、批量总结、比较和草稿生成：零历史；
- 当前书签网页总结：最近 2 轮，换书签即新 thread；
- 文件问答：最近 5 轮，换文件即新 thread；
- 资源搜索：最近 2 轮仅用于理解追问，每轮重新检索；
- 帮助中心：最近 4 轮，只能继续检索公开帮助；
- 不同 Skill、不同资源和不同 subject 永不共享自然语言历史。

## 7. 迁移顺序

### 阶段 A：先建立不可绕过的治理

1. 共享 Skill 协议；
2. Feature Config；
3. AI Execution 上下文、用量聚合和终态；
4. Gateway 强制上下文；
5. 源码门禁禁止新增裸模型调用；
6. 迁移全部已有 AI 功能到统一执行。

### 阶段 B：Shared Skill Kernel

1. Registry、Context Resolver、Output Validator；
2. `/ai/skills/config`、`/ai/skills/execute`；
3. 先接已有笔记助手、书签解析和智能整理 Adapter；
4. Contract、scope、quota、provider error 测试。

### 阶段 C：只读低风险 Skills

1. 资源中心 `search.answer`；
2. 文件 `file.summarize/file.ask/file.compare`；
3. 帮助中心 `help.answer`。

### 阶段 D：结构化预览 Skills

1. `todo.parse_draft/todo.breakdown`；
2. `note.batch_summarize/note.batch_compare/note.create_from_sources`；
3. `bookmark.summarize_page/bookmark.compare_pages`。

### 阶段 E：产品入口迁移

1. 业务页面不再调用 `openAiAssistant`；
2. 桌面移除全局悬浮助手；
3. 移动底栏 AI 改为快速收集；
4. `/ai` 仅迁移到资源中心或旧会话只读页；
5. 禁止创建新通用 Conversation。

### 阶段 F：清理旧 Agent

调用点归零并完成回退观察后，删除通用 Planner/Compiler/Memory/Follow-up/写链路；可复用的来源卡、SSE、预览和确认组件迁入 Skill 目录。

## 8. 验收硬门禁

- 未确认写入、scope 越界、Help 读取私有数据、Search 执行写能力：均为 0；
- 失败不得冒充空结果，Coverage 不完整不得声称“全部/唯一”；
- 每个真实模型调用都属于 execution/provider span；
- 生产代码裸 Provider 调用和无治理 Gateway 调调用：均为 0；
- 一次用户动作只有一个额度 reservation 和一个 terminal settlement；
- 关闭任一 Skill 不影响原页面基础功能；
- PC/移动、浅色/深色、空/加载/成功/错误/额度不足/范围冲突均完成视觉验收；
- 真实模型验证只做小规模代表性用例，其余使用 fixture 与 mock，避免无意义消耗额度。

## 9. 本轮边界

本分支只实现代码与测试，不推送、不部署、不执行线上迁移。发布必须在用户明确说“上线”后按项目发布门禁完成。

## 10. 实施结果（2026-08-24）

### 10.1 已落地

- 共享封闭 Skill 协议、Feature Config、Registry、Context Resolver、Thread、Runtime、Output Validator；
- 笔记、书签、文件、待办、资源检索、帮助中心共 20 个范围明确的 Skills；
- 结构化、可读结果组件，来源、Coverage、错误、额度和写预览状态；
- 统一 AI Execution、Provider Span、懒额度占位、累计结算、系统预算与持久账本；
- Gateway 失败关闭与源码门禁，现有智能整理、快照、标签图标等成熟 AI 调用全部接入；
- `ai_lock` 提升为 Execution 级横切门禁，不再依赖业务 URL；
- 笔记、书签、文件、待办和搜索等模块入口迁移，移动端全局 AI 入口改为快速收集；
- 旧 `/ai` 改为只读档案，通用 Planner/Compiler/Memory/Follow-up/工具/写链和旧前端工作区删除；
- 账号注销、全量数据导出、隐私政策、设置、帮助、SEO 和业务知识同步到新口径。
- 前端统一校验 HTTP 业务信封与 Skill 封闭协议，服务端直接 AI 入口复用公开错误映射，失败不再伪装为空结果或泄露内部错误；
- 客户端 Thread 按资源范围隔离，Coverage 诊断只按稳定码本地化展示，不再跨资源复用历史或直接暴露资源 ID。
- 待办自然语言时间只允许模型逐字摘录日期/时间表达式，由服务端以请求 IANA 时区确定性解析；模型不再计算绝对时间。只给日期时统一落在本地当日 `23:59`，未表达时间时不会凭空补提醒；不支持、篡改或无法核验的表达式失败关闭。
- `todo.breakdown` 已接入新建/编辑待办表单，结果只作为当前表单清单预览，用户应用后仍须通过原待办保存动作落库；已有同名清单项保留完成状态和 ID。
- Skill Feature Config 由前端统一缓存并合并并发请求；配置服务暂不可用时只让 AI 入口前端降级、基础业务页面保持可用，真正执行仍由服务端 Registry 与 Feature Gate 失败关闭。
- 复用现有低敏产品事件表记录 Skill 服务端真实生命周期与前端打开、取消、应用事件；只允许 Skill、surface、资源类型、数量/长度/耗时桶、结果和错误族，不保存问题、正文、标题、URL 或资源 ID。非流式 Skill 不伪造 `first_token`。
- 模型访问源码门禁按模块导入能力和精确绑定检查，而非只匹配函数名；别名、命名空间、动态导入和旁路 `/chat/completions` 都会阻断。Registry 契约测试精确锁定当前 20 个 Skill 及角色、范围、模型、输出和无直写约束。

### 10.2 已完成的阶段性本地证据

- 服务端全量测试通过：252 个测试文件、1907 个测试；
- Web 全量测试通过：385 个测试文件、2486 个测试通过、2 个跳过；
- 共享 Skill 协议测试通过：1 个测试文件、3 个测试；
- Web 类型检查、生产构建、SEO 预渲染与产物校验通过；
- AI 模型访问源码门禁通过：Gateway 调用方 5 个、旧助手业务入口 0 个；
- `git diff --check`、改动 JavaScript 语法检查和旧资源上下文残留检查通过；
- 本轮新增 `todo.breakdown` 已在 PC/移动端、浅色/深色下完成视觉验收，覆盖默认、空/输入、加载、成功、显式应用、错误与 Feature Config 不可用状态；新鲜页面控制台无错误或警告；
- 通用 Skill 结果、来源、Coverage、额度与范围冲突由共享组件和全量自动化测试覆盖；
- 视觉验收使用本地 mock/fixture，不调用真实 Provider，不读取或修改真实用户数据；
- 逐条对照硬门禁完成本地静态、单元、集成和视觉证据收集。

### 10.3 发布环境仍需完成

- 在可连接目标数据库的环境执行 Schema 只读门禁；本机执行时在数据库连接阶段返回 `ECONNREFUSED`，未进入断言，也未执行任何迁移或写入；
- 用户明确授权上线后，再按项目发布流程执行迁移、提交、推送、部署和发布后健康检查；
- 本阶段不做真实 Provider 全工具回放，若发布验收需要，仅选取少量代表性 Skill 做受控验证。
