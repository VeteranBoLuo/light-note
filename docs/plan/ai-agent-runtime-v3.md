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

### 3. 语义历史与事实证据分层

V3 不信任客户端 `history`，也不把历史当成当前私有事实。为了不破坏普通知识问答、产品帮助追问和“这个/刚才那个”类语义承接，服务端从有归属校验的云端消息构建有界 `recentDialogue`；无云端会话时才回退到服务端 session turns。

模型阶段使用不同预算：Compiler 最多 4 轮 / 1600 字符，普通 Dialogue Composer 最多 10 轮 / 8000 字符，Grounded Composer 最多 4 轮 / 2400 字符；Planner 和 Tool 固定为 0。`rawHistoryMessageCount=0` 仅表示 V3 Planner/Tool 没有原始历史，`recentDialogueMessageCount/recentDialogueSource` 单独记录语义上下文的有界投影。

跨轮权威状态仍只保留：

- `DiscourseState`：当前领域、上一能力、topic epoch 和可解析指代；
- `ResultSet`：本轮真实执行结果的稳定资源引用；
- `ArtifactState`：草稿、确认、执行、替换、失效和结果未知状态。

`recentDialogue` 只帮助理解语言：最新用户消息仍是当轮动作、对象、时间、参数和文字事实的唯一权威。旧回答里的私有数字、旧工具参数和旧材料正文不能直接成为新一轮的事实证据。用户明确说“这些、刚才那条、继续基于上轮结果”时，私有资源只能通过类型兼容的 `ResultSet/SourceSet` 重新读取；跨领域或歧义时必须重新查询或澄清。普通公共知识对话则可以使用经裁剪的近期原话保持连贯。

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
最新用户消息 + 服务端 recentDialogue + 当前显式资源 + 结构化状态 + 模块约束
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
- 分层历史：云端权威优先、session 回退、重新生成版本折叠、各阶段预算和 Planner/Tool 零历史。
- Handler：旧 7 天语义上下文不能覆盖本轮“今天”，权威时间进入查询，私有回答只使用本轮证据。
- 结果契约：`totalCount/returned/totalExact/completeness/nextCursor` 显式投影，数值型 `raw.total` 不再被执行器自动当成精确总量。
- 能力范围：产物领域与可接受的材料领域分开声明，模块约束既不跨域泄漏，也不会误关闭“书签/笔记/文件 → 生成笔记”这类通用转换。
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
- V3 trace 中 Planner/Tool 必须 `rawHistoryMessageCount=0`、`legacyStageCount=0`；`recentDialogueMessageCount` 不得超预算，来源只能是 `cloud/session/none`。
- 不得出现范围外资源、跨领域旧 ResultSet、未确认写入、重复写入或额外写工具。
- 时间约束必须绑定到 Manifest 声明的正确槽，服务端权威值覆盖模型参数。
- 每个目标都有 completed、clarification、unsupported、failed 或 unknown 的可见终态，不能静默丢失。
- shadow 差异、延迟、模型调用数、澄清率和工具成功率达到发布基线后才能扩大 enforce。

## 七、独立分支落地状态（2026-08-21）

当前实现位于独立工作树和 `codex/agent-runtime-v3-phase0b` 分支，用于继续代码评审和确定性回归；这不代表已经合入 `main` 或部署。分支默认 Runtime 仍为 legacy，不会因代码存在而自动影响用户。已经完成：

- TurnSpec V3、Manifest 精确路由、服务端时间/资源绑定和 Planner/Tool 零历史的执行链；
- `ResultSet / DiscourseState / ArtifactState` 的窄状态投影、跨领域隔离和类型兼容继承；
- 同领域待确认草稿的 refine / scope replacement / independent 语义，以及旧确认原子失效；
- 模块级单轮能力约束、无真实材料时隐藏多余检索提示；
- Root 真实门禁的 Runtime 证明、定点成本开关、正式 Service 夹具和自动清理；
- Phase 0B 最低结果契约：关键查询工具显式返回总量、本页数量、完整性、游标和截断原因；
- Phase 1 核心：服务端权威 `recentDialogue`、Compiler/Composer 分层预算、Grounded Composer 事实隔离和低基数 trace；
- Manifest 的 `acceptedSourceDomains`：用声明式数据表达“某产物能由哪些材料域生成”，同一匹配函数被目录与 Handler 共用。

早期实验分支曾对历史失败链做过一次获授权的真实 DeepSeek + Root Handler 定点验证：`query_notes` 和“7 天草稿 → 改今天/2000 字 → 再扩到 2500 字 → 确认最新版”链路通过。当前 Phase 0B/1/2 的日常开发不再重复该真实调用，只使用确定性测试、Mock Provider 和 zero-token smoke；只有首次灰度或扩大受众时才在重新授权后运行最小真实门禁。

### Phase 0A / 0B / 1 / 2 渐进分支

最终统一重构决策按 Phase 0A → 0B → 1 → 2 在独立工作树渐进实施，不直接修改本地 `main`，也不在本阶段启用生产 V3、迁移数据库或删除旧链。已经处理的通用边界包括：

- 显式能力范围在身份解析后重新授权，纯越权范围在模型前确定性拒绝；
- Manifest 明确时间默认和副作用策略，Root 全量统计不再依赖模型补出时间参数；
- 读结果焦点改为带运行令牌的两阶段提交，并用 Redis revision CAS 隔离同会话并发请求；迟到旧轮不能覆盖最新焦点，成功但无稳定引用的统计读取也能正确提交语义；
- TurnSpec 拆分语义摘要与执行合同摘要，`refer_last_result` 使用最终权威材料范围；
- shadow/enforce trace、continuation 枚举和能力差异统一到 V3 Manifest；
- SQL `LIKE`（含云文件夹查询）统一转义用户通配符，幂等链接体检与确认型写入明确区分；V3 Compiler 使用 Manifest 自有时间描述，不继承 legacy 工具的冲突追问文案。

Phase 2 已完成五实体持久状态与产物连续性底座，但尚未应用任何线上 migration，也未切换 persistence 模式：

- `ConversationState / Run / SourceSet / ResultSet / ArtifactVersion` 分别保存会话 revision、运行目标终态、不可变材料句柄、查询稳定引用和产物版本链，避免把不同生命周期塞进一个可变大对象；
- Redis 继续承担热状态和短期确认，MySQL 由独立的 `AI_AGENT_STATE_PERSISTENCE_MODE=disabled|shadow|enforce` 控制；默认 disabled，不能由 Runtime V3 模式隐式启用；
- Run 固化语义 digest、执行 digest、逐目标终态和 unknown，只有真实工具或确认回执完成后才提交会话焦点；并发写通过 revision CAS，迟到旧轮不得覆盖新轮；
- 确认过期不再等同于草稿过期：服务端可凭公开 ArtifactVersion ID，在 owner/subject/conversation 与版本链约束内恢复最新可编辑版本，并按 SourceSet 重读材料后签发新版本，旧 token 永不复活；
- 普通连续问答仍使用有界 `recentDialogue`；只有用户明确要求把指定对话整理成产物时，Compiler 才能选择 `dialogue_anchor`。服务端用云消息稳定 ID、topic epoch 和 digest 创建 SourceSet，生成与改写时精确重读并校验，不持久化客户端 history 或临时 session 原文；
- 并发工具回调不直接决定确认卡顺序，Runner 在有序 join 后统一发送；公开投影不包含 Dialogue Anchor 的消息 ID、正文或私有材料。

该分支的日常验证只跑确定性测试、Mock Provider 和零调用 smoke；真实 Provider 与 Root 数据链仍留到获授权的最终灰度阶段。

## 八、后续演进边界

- 新能力优先扩展 Manifest、类型和测试，不在 Handler 中新增自然语言特判。
- 新的私有资源继承需求优先扩展 ResultSet/SourceSet/DiscourseState schema；普通语义承接只扩展服务端 `recentDialogue` 的统一预算和裁剪规则，不把它变成私有事实源。
- 能力的产物域与输入材料域分别由 `domains/acceptedSourceDomains` 声明，不在前端或 Handler 按问法、工具名或截图故障增加特判。
- 列表总量只有在工具显式证明 `totalExact=true` 时才可对用户声称“全部/只有”；执行器不得从字段名或当前页长度推断完整性。
- 新的时间字段优先声明 temporal slot 和服务端绑定器，不让模型自由拼日期。
- 新写操作必须复用确认、owner、幂等和 unknown 终态，不能在 V3 内另建副作用通道。
- 只有 V3 enforce 稳定覆盖全部核心场景并完成生产观测后，才另开任务删除 legacy/V2；本阶段不做大爆炸式替换。
