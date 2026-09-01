# 模块化 AI Skills

本文是轻笺现行 AI 产品形态、协议、执行与计费边界的唯一架构说明。Skill 清单和字段细节以代码注册表、共享协议和契约测试为准，不在文档复制易漂移列表。

## 产品边界

- 轻笺不提供万能助手、普通闲聊、全局工具选择或跨模块自由规划。
- 页面选择封闭的 `skillId`；服务端 Registry 决定版本、角色、资源类型、数量上限、历史窗口、模型策略和输出契约。
- 模型只处理当前 Skill 已授权的任务，不重新选择业务模块，也不能扩大资源范围。
- 一个高价值固定成果对应一个主 Skill Profile；Profile 可以复用证据加载、Grounding、Gateway 和 Execution 工厂，但不得把多种成果只区分为同一通用 Skill 上的不同用户提示词。用户输入只调整已选 Skill 的关注点，不能触发隐式跨 Skill 路由。
- 旧 Agent 会话、V2/V3 Runtime、Memory 和通用工具入口只保留数据导出、删除和审计兼容，不再进入普通用户上下文。

## 唯一事实源

| 事实                        | 权威入口                                                        |
| --------------------------- | --------------------------------------------------------------- |
| 请求与响应协议              | `packages/shared/aiSkillProtocol.js`                            |
| Skill 能力、版本与策略      | `apps/server/util/aiSkill/registry.js` 与 `skills/`             |
| 资源归属与证据              | `contextResolver.js`、`resourceEvidence.js`                     |
| 输入、输出和 Grounding 校验 | `inputValidators.js`、`outputValidator.js`、`groundedOutput.js` |
| 模型访问                    | `apps/server/util/agent/aiGateway.js`                           |
| 动作与计费目录              | `apps/server/util/aiBillingCatalog.js`                          |
| 前端执行与展示              | `AiSkillPanel.vue`、`AiSkillResultContent.vue`、`useAiSkill.ts` |

新增或修改能力时更新这些事实源和契约测试，不在页面、Prompt、帮助文案或本文复制第二份 Skill 清单。

## 请求与资源边界

- 请求只接受共享协议声明的字段；未知字段、未知 Skill、版本不符、非法终态和越权资源失败关闭。
- 客户端资源 ID 只是候选。服务端从认证后的 actor/subject 重新读取 owner、当前版本和内容，再生成范围摘要；标题、URL、正文和前端缓存不是权威身份。
- thread 绑定 `skillId + skillVersion + actor + subject + scopeDigest`。不同 Skill、资源集合或 subject 不共享自然语言历史。
- 历史只用于理解省略，每轮事实都重新从当前权威资源加载。零历史 Skill 不得因前端保留聊天 UI 而获得旧材料。
- Help 只读取公开帮助；Search 只读检索当前 subject 的私有资料；管理员上下文继续遵守 actor/subject 与 readonly/maintain 边界。

## 写入与确认

- 写 Skill 只能生成结构化草稿或预览。真实写入必须由用户确认，并复用 `util/services/` 的权限、事务、版本、幂等和审计能力。
- 模型文案、旧预览、HTTP 200 和成功语气都不是执行回执。对象版本变化时返回冲突，不能静默覆盖。
- 日期、时间、owner、资源绑定和执行字段由服务端确定性计算或注入；模型不得计算绝对时间、抄写已校验 ID 或自行指定目标用户。
- 结构化参数归一化后必须再次通过共享 Schema；失败时只允许协议定义的有限修复或明确错误。

## 来源与输出

- 有来源的事实回答通过 `submit_grounded_answer` 提交分段正文和来源索引；引用编号由服务端生成，模型不得手写。
- 来源缺失、越界或输出协议失败最多进行一次受控平台修复；修复不能扩大材料范围。
- 固定成果 Skill 在通用引用契约之上声明业务结构校验；该校验与通用协议共用同一次平台修复机会，修复后仍失败则硬终止，禁止在外层通过整任务重试无界增加模型调用。
- Coverage 由服务端实际装载和成功处理的证据计算，不用“全部、所有、唯一”等正文关键词猜测。
- 计数、完整列表、分类统计和执行结果来自结构化查询；模型只负责表达，不从片段或历史回答反推精确事实。

## Execution 与计费

- 所有真实 Provider 调用都必须经过 `aiGateway.js` 并归属唯一根 AI Execution；源码门禁禁止裸 Provider 和未登记调用方。
- 用户动作在第一次真实 Provider 调用前懒占位一次。缓存命中、确定性解析和纯本地处理不占模型额度。
- 主调用、图片识别、结构修复和 Provider 失败分别记录 Span，并由根 Execution 形成唯一终态；用户额度只结算明确属于用户的真实 usage。
- 平台协议修复由平台承担。usage 缺失按已声明预算保守结算，不能让已发出的调用变成免费，也不能超过预占。
- 每日等级额度与永久 AI 余额是两个可解释资产，按服务端固定顺序消耗；Root 不获得隐形免费调用。
- `system` 计费覆盖只允许受信任的服务端调用方显式注入固定系统主体，公开请求、页面字段和客户端 Header 均不能选择该策略；执行仍保留完整 Execution、Span 与 usage 审计。
- Registry 同时支持公开与 internal-only Skill。internal-only Skill 不得出现在 `/ai/skills/config` 或被公开执行，但为了让用户理解真实 AI 消耗，其可读动作名可以进入用量目录。只有服务端传入的已登记调用者身份与该 Skill 允许的计费策略同时成立时才能执行；客户端 `surface`、body、query 或 Header 都不是内部身份。
- 知识工坊纯 AI 任务允许用户每次选择积分或 AI 额度，不得双扣。积分分支由受信任 Worker 注入 `system` 覆盖；AI 额度分支由同一 Worker 使用默认 `user` 策略，按真实 Token 进入“知识工坊”用量明细。成果页不提供工具内追问；保存为笔记后的追问、润色与反复修改属于笔记模块独立 Skill，使用 AI 额度。工坊任务状态与单介质结算见 [知识工坊](./toolbox.md)。
- Root 的 `/api/admin/ai-operations/*` 只把 `ai_executions` 与 `ai_provider_spans` 投影为平台治理读模型。actor 表示成本承担者，subject 只解释代操作或系统任务的目标；总览、趋势、模块、Provider、列表与详情必须共用同一筛选边界。管理端不得返回 Prompt、问题、正文、标题、URL、资源 ID、模型回答、Provider 原始错误或其他内容载荷；历史 `agent_logs` 不参与现行成本、质量或用户 360 统计。
- 执行租约、规则版本、回收与历史修正必须可重放。历史修正默认 dry-run，只允许自动退款，不自动追扣。

## 开关、隐私与遥测

- `/ai/skills/config` 由前端统一短时缓存并合并并发读取；各组件不得轮询或维护第二份开关。
- 配置读取失败时业务页面保持可用，但执行仍由服务端最终门禁；Skill、域或 Kernel 禁用时失败关闭。
- 产品事件只记录登记过的 Skill、surface、资源类型、桶化数量/长度/耗时、结果和错误族。禁止保存问题、正文、标题、URL、资源 ID、Provider 原文或账号标识。
- `ai_lock` 是能力限制，在根 Execution 统一处理；不得用 URL 正则或页面隐藏代替服务端门禁。

## 变更流程

新增或修改 Skill 时：

1. 先更新共享协议或服务端 Registry，明确角色、资源、历史、模型、计费与输出类型。
2. 更新 Context Resolver、输入/输出校验和必要的业务 Service，不在 Handler 或页面复制权限逻辑。
3. 接入统一 Gateway、Execution、Span、额度与低敏遥测。
4. 前端复用模块化面板和 B 组件，展示用户任务、材料、结果和真实执行状态，不暴露内部运行术语。
5. 同步帮助知识；只有确需实时数据时才增加受控查询能力。

## 验收门禁

- `pnpm --filter server check:ai-model-access`
- 服务端协议、Registry、归属、空材料、解析失败、额度不足、Provider 失败、输出校验、幂等与冲突测试
- 前端加载、成功、空、错误、取消、重试和确认状态测试
- 类型检查与受影响构建

日常测试使用 Provider mock、协议夹具和确定性结果。只有变更 Provider 协议、模型或生产兼容性且获得明确授权时，才运行最小真实调用；报告不得包含用户材料或 Provider 原文。
