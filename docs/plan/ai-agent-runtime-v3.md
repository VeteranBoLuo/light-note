# Agent Runtime V3 渐进式落地基线

本文档记录轻笺智域 Agent Runtime V3 的目标架构、已落地边界、验证方式和灰度策略。V3 采用旁路迁移，不直接替换线上 V2/legacy；代码合入本身不会改变生产语义，只有目标模式与账号受众同时命中后才会进入 V3。

## 一、要解决的问题

现有问题的共同根因不是某一句 Prompt，而是“意图、上下文、材料、工具和结果状态”缺少统一、可验证的服务端协议：

- 同一意图换一种说法后可能漏选工具，或把已支持能力误报为不支持。
- 连续对话会把旧轮笔记、书签或时间范围错误带入新主题。
- “今天”“最近 7 天”“今天 16 点”等时间条件可能落到错误字段，甚至只做文本搜索。
- 用户已经选择资源，模型仍要求重复提供链接或名称。
- 一个复合请求中的部分目标可能被静默忽略。
- 写操作、确认卡、结果过期和重新生成缺少统一生命周期。

V3 的目标是把这些判断从散落的关键词和模型自由发挥中收回到确定性协议，而不是为每个截图继续增加特判。

## 二、架构原则

### 1. 单轮唯一语义源

每轮先由 Intent Compiler 生成一份不可变 `TurnSpec V3`。后续 Capability Router、Execution Planner、Validator 和 Runner 只消费该对象，不再各自重新猜测用户意图。

`TurnSpec` 明确记录：

- 独立目标、目标依赖和请求类型；
- capability ID，而不是工具名或自然语言关键词；
- 时间约束及其目标参数槽；
- 当前显式资源、上一轮结果引用或工作区检索策略；
- continuation、topic epoch、缺失参数和澄清问题；
- 输出契约和允许的事实来源。

### 2. 能力清单是产品事实

`runtime/v3/capabilityManifest.js` 是能力与真实工具之间的单一声明源，包含领域、读写效果、角色、依赖、风险、确认策略、输入类型、时间槽和结果类型。

模型只能选择 Manifest 中的 capability ID；Router 只做精确映射，不用关键词、正则、相似度或工具文件名做第二次语义猜测。新增工具时扩展声明和测试，不为某句问法增加分支。

### 3. 对话历史不作为事实来源

V3 不向模型发送原始历史消息，`rawHistoryMessageCount` 必须为 0。会话仅保留服务端生成的窄状态：

- `DiscourseState`：当前领域、上一能力、topic epoch 和可解析指代；
- `ResultSet`：本轮真实执行结果的稳定资源引用；
- `ArtifactState`：草稿、确认、执行、替换、失效和结果未知状态。

旧回答正文、旧工具参数和旧材料正文都不能自动进入新一轮。用户明确说“这些、刚才那条、继续基于上轮结果”时，只能通过类型兼容的 `ResultSet` 引用恢复；跨领域或歧义时必须重新查询或澄清。

候选能力裁剪发生在 Compiler 之前时，也只能依据 Manifest 声明的输入类型和 ResultSet 的结构化领域/引用类型判断。例如上一轮返回了经工具投影的书签或网页引用，下一轮省略 URL 要求继续总结时可以开放网页读取能力；仅凭标题、摘要、中文指代词或某个工具名不得开放，也不得把跨领域旧结果自动带入。

### 4. 权威参数由服务端绑定

模型负责表达语义，不负责复制安全敏感或易出错的参数。以下字段由服务端根据登录用户、当前选择、Manifest 和 TurnSpec 注入或覆盖：

- owner/root 权限和作用域；
- 笔记、书签、待办等资源 ID；
- 已选书签对应的真实 URL；
- 时间范围、日期、提醒时间等 temporal slots；
- 前置工具真实返回的依赖引用；
- 输出类型、确认策略和写入目标。

Planner 看不到这些可由服务端确定的自由参数，因此不能把旧值或臆测值带回计划。

### 5. 显式模块只做约束，不替代自然语言

前端提供“自动、笔记、书签、待办、文件、标签、综合内容、管理”等每轮模块选择。它只缩小本轮可用 capability 集合，发送后自动恢复“自动”；不保存为会话长期偏好，也不绕过权限、材料和确认边界。

因此普通用户仍可自然提问，遇到高频歧义时又能主动限定模块，而不是把产品退化成固定按钮集合。

## 三、当前实现链路

```text
最新用户消息 + 当前显式资源 + 窄会话投影 + 模块约束
                         │
                         ▼
                Intent Compiler V3
                         │ TurnSpec
                         ▼
          Capability Router（Manifest 精确路由）
                         │
                         ▼
       Execution Context（权限/资源/URL/时间绑定）
                         │
                         ▼
        Planner → Validator → 现有 Runner/确认协议
                         │
                         ▼
          ResultSet / ArtifactState / 安全 Trace
```

V3 复用现有工具实现、owner 校验、Tool Policy、确认令牌、幂等和 Runner，不重写业务 Service。这样既降低迁移面，也确保旧工具能力不会因为架构升级被整体替换。

## 四、运行模式与回退

目标模式为 `AI_AGENT_RUNTIME_MODE`：

- `legacy`：默认值，完整执行当前线上链路，不增加 V3 模型调用。
- `v3_shadow`：V3 只编译和记录脱敏差异，不执行 V3 计划，不改变用户结果。
- `v3_enforce`：TurnSpec V3 成为本轮唯一语义源。

账号受众由 `AI_AGENT_RUNTIME_V3_ROLLOUT` 独立声明：

- `none` 或缺失：任何账号都不进入 V3。
- `root`：只纳入认证后的真实 Root 操作账号。
- `all`：显式纳入全部请求。
- 严格 JSON：通过 `roles`、`actorIds`、`excludeActorIds`、`percentage` 和 `salt` 组合灰度。前三类纳入规则按 OR 匹配，排除项优先；百分比对真实 actor 做稳定分桶。

无效 JSON、未知字段、越界比例和缺失受众都失败关闭到 legacy。Root 代管普通账号时按 billing actor 判定，不能把 subject 账号意外带入灰度；未命中账号完全不运行 V3 Compiler，因此不会产生 shadow Token 成本。启用顺序必须是：合入代码但保持 `legacy` → Root/白名单 `v3_shadow` → 检查差异和成本 → Root/白名单 `v3_enforce` → 固定 salt 后逐步扩大百分比。任何异常直接切回 `legacy`，无需回滚数据库，也不依赖数据迁移。

## 五、验证矩阵

开发主门禁全部使用确定性测试，不消费真实 AI Token：

- Manifest 完整性：所有已注册工具都有明确状态，enabled 能力映射真实工具，角色和依赖合法。
- Compiler/TurnSpec：复合目标、时间约束、当前资源、跨域切换、缺失槽和低置信澄清。
- Router/Validator：精确 capability 路由、模块收窄、部分不支持披露、额外工具和额外写入失败关闭。
- 会话状态：同域引用、跨域隔离、歧义集合、topic epoch、草稿替换、确认完成/失效/结果未知。
- Handler：旧 7 天历史不能覆盖本轮“今天”，权威时间进入查询，结果集可核验。
- 前端：模块选择、发送后复位、历史消息展示和无材料时不显示多余来源标签。
- 全量 server 测试、web 测试、类型检查、生产构建和 `git diff --check`。

低成本清单命令：

```bash
pnpm --filter server smoke:ai-turn-v3
```

该命令默认只展示测试矩阵，模型调用数和业务工具执行数均为 0。只有首次启用/扩大 V3 灰度时，才在获得授权后显式运行最多两个 Compiler 用例：

```bash
pnpm --filter server smoke:ai-turn-v3 -- --live --case <case-id>
```

真实 Compiler 冒烟仍不连接或执行业务工具；完整 root 真实链路只属于发布灰度门禁，不作为日常开发回归。

最终 Root 门禁必须使用显式 Runtime 档位，避免 shell、`.env` 或进程管理器中的残留变量让测试跑错链：

```bash
pnpm --filter server smoke:ai-root-e2e -- --runtime v3
pnpm --filter server smoke:ai-root-e2e -- --runtime v3 --live --suite full --execute-writes --provider deepseek --approve-full-matrix
```

第一条是零模型、零数据库、零工具的覆盖检查；第二条只有在目标依赖环境、真实模型费用和夹具读写均获授权后才能运行。`--approve-full-matrix` 防止定点复测误触全量 Token 消耗；受影响链路可用 `--case` 最小化验证，但扩大至非 Root 灰度前必须跑过一次全矩阵。它不要求先把分支合入生产，但若 `.env` 指向线上依赖，就仍属于线上数据操作，不能以“本地命令”为由绕过授权。

## 六、上线门槛

- 默认模式仍为 `legacy`，部署不能隐式启用 V3。
- 目标模式和账号受众必须同时命中；非灰度账号的 V3 Compiler 调用数必须为 0。
- V3 trace 中 `rawHistoryMessageCount=0`、`legacyStageCount=0`。
- 不得出现范围外资源、跨领域旧 ResultSet、未确认写入、重复写入或额外写工具。
- 时间约束必须绑定到 Manifest 声明的正确槽，服务端权威值覆盖模型参数。
- 每个目标都有 completed、clarification、unsupported、failed 或 unknown 的可见终态，不能静默丢失。
- shadow 差异、延迟、模型调用数、澄清率和工具成功率达到发布基线后才能扩大 enforce。

## 七、独立分支落地状态（2026-08-21）

当前实现位于独立工作树和 `codex/agent-runtime-v3` 实验分支；即使该分支作为评审代码发布到远程，也不代表已经合入 `main` 或部署。该分支不是发布候选，默认 Runtime 仍为 legacy。已经完成：

- TurnSpec V3、Manifest 精确路由、服务端时间/资源绑定和不携带原始历史的执行链；
- `ResultSet / DiscourseState / ArtifactState` 的窄状态投影、跨领域隔离和类型兼容继承；
- 同领域待确认草稿的 refine / scope replacement / independent 语义，以及旧确认原子失效；
- 模块级单轮能力约束、无真实材料时隐藏多余检索提示；
- Root 真实门禁的 Runtime 证明、定点成本开关、正式 Service 夹具和自动清理。

本轮只对历史失败链做了一次真实 DeepSeek + Root Handler 定点验证：`query_notes` 成功；“最近 7 天生成草稿 → 改为今天且至少 2000 字 → 再生成至少 2500 字 → 确认最新版”成功；两张旧确认均失效、最终确认幂等、夹具清理成功。执行命令为 `pnpm --filter server smoke:ai-root-e2e -- --runtime v3 --live --execute-writes --provider deepseek --case query-notes --artifact-refinement-rounds 1 --format json`。该结果证明独立分支能连接当前真实依赖完成目标链路，不代表代码已经上线，也不能替代扩大到非 Root 灰度前的一次获授权全矩阵门禁。

## 八、后续演进边界

- 新能力优先扩展 Manifest、类型和测试，不在 Handler 中新增自然语言特判。
- 新的上下文继承需求优先扩展 ResultSet/DiscourseState schema，不恢复原始历史正文注入。
- 新的时间字段优先声明 temporal slot 和服务端绑定器，不让模型自由拼日期。
- 新写操作必须复用确认、owner、幂等和 unknown 终态，不能在 V3 内另建副作用通道。
- 只有 V3 enforce 稳定覆盖全部核心场景并完成生产观测后，才另开任务删除 legacy/V2；本阶段不做大爆炸式替换。
