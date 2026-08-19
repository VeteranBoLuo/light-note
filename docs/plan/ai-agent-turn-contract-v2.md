# Agent Turn Contract V2 实施基线

本文档是轻笺智域 Agent 重构的仓库内实施基线。原始审计提案形成于 2026-08-19；当前实现以仓库最新代码、自动化测试和真实 Provider 隔离评测为准。

## 目标

- 每轮只有一份不可变 TurnSpec，历史只用于理解指代，GroundingScope 才能提供事实。
- 模型可以在服务端边界内选择和缩小，不能扩大材料范围、输出契约或工具权限。
- 字数、结构、扩写和保持篇幅由 OutputContract 确定性验收；两次失败不生成确认卡。
- Intent Compiler 与 Execution Planner 分层，Planner 只看到收窄后的真实工具。
- 现有 owner、toolPolicy、写确认、幂等和结果未知保护继续作为唯一副作用边界。

## 已落地协议

1. `TurnEnvelope V2 → GroundingScope → Source Set/Clarification`：显式材料、继承材料和工作区检索互不混用，最终 Composer 不接收旧助手事实正文。
2. `OutputContract V2`：支持 minimum、target range、relative growth、preserve length、结构、Markdown、链接保留和重复门禁。
3. `Intent Compiler → Capability Router → Execution Planner → Plan Validator`：低置信度/缺 slot 澄清，候选工具 p95 上限 12，额外写工具失败关闭。
4. `Runtime/Runners`：conversation、answer、action、mixed 和 note draft 统一消费 TurnSpec；依赖轮不重新判断意图。
5. 分阶段 Provider：intent、planner、composer、note draft 可独立覆盖；默认继承全局 Provider。
6. 无正文 trace：只记录枚举、数量、哈希、耗时和稳定错误码。

## 2026-08-19 Provider A/B 结论

- 隔离 quick 集 6 条 × 20 次/Provider，业务工具执行数为 0。
- DeepSeek `deepseek-v4-flash`：120/120，strict 100%，协议失败 0，灾难性失败 0，候选工具 p95=2，延迟 p95=6277ms。
- Qwen `qwen3.5-flash`：114/120，strict 95%，协议失败 0，灾难性失败 0，候选工具 p95=2，延迟 p95=5666ms。
- 依据“契约正确率优先，再比较协议、延迟和成本”，默认继续使用 DeepSeek；Qwen 达到同一安全门槛，可保留为 fallback，但不替换默认。

## 发布门槛

- 显式材料泄漏、范围外执行、未确认写入、重复写入、额外写工具执行均为 0。
- 明确最少字数和相对扩写契约必须 100% 通过，失败不得生成确认卡。
- 关键 Provider A/B 每条至少重复 20 次；严格正确率至少 95%，灾难性失败为 0，候选工具 p95 不超过 12。
- server/web 全量测试、黄金集、类型检查、生产构建和 `git diff --check` 全部通过。

## 运维与回退

- `AI_AGENT_RUNTIME_V2_MODE=enforce` 为 V2 主链；`legacy` 仅作为事故回退，`shadow` 只记录语义分歧。
- `AI_GROUNDING_SCOPE_V2_ENABLED=false` 是材料作用域的最高优先级急停。
- Provider 阶段覆盖变量见 `docs/development.md`；未配置时继承 `AGENT_LLM_PROVIDER`。
- 真实 A/B 命令只运行协议和计划，业务工具执行数恒为 0。

详细数据结构、踩坑约束和评测命令分别见 `docs/architecture.md`、`docs/pitfalls.md` 与 `apps/server/evaluation/ai-assistant/README.md`。
