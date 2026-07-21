# 轻笺 AI 助手离线黄金评测

本目录提供 AI 助手产品能力黄金矩阵与确定性回归骨架。它只读取仓库文件，不加载 `.env`，不连接数据库、Redis 或模型供应商，也不访问网络。

## 目录内容

- `golden-tasks.json`：267 条匿名化合成任务和 49 个合成来源夹具。
- `generate-golden-tasks.js`：从 70 条核心任务和显式产品场景定义确定性重建 v2 矩阵；生成时拒绝重复 ID、重复问题和错误总数。
- `schema.js`：严格字段 schema、枚举、跨字段约束、结果 schema 与六维评分器。
- `runner.js`：黄金集 lint、JSON/JSONL 结果读取和发布门槛检查。
- `schema.test.js` / `runner.test.js`：隐私声明、覆盖分布、严格校验和安全失败回归。

黄金集保留原 70 条 Ask / Organize 核心任务，并新增 197 条互不重复的产品生命周期场景。十个能力域分别为：Ask、Organize / Change Set、记忆、证据与引用、owner 四维隔离、配额、SSE 恢复、隐私与保留、结果复用、Gateway 与工具策略。每个能力域至少 20 条。

新增场景不是正文相近的参数复制，而是分别定义可观察前置条件、预期路由/工具、禁止动作、确认与结果类型，以及状态信号。例如隐私域区分账号导出、派生数据排除、owner 域清除、schema 失败关闭、软删除撤销和有界保留清理。

## 数据契约

每条任务都显式包含：

- `identity`：合成 actor、subject、角色、管理员模式和授权 context ID；
- `capability`：任务所属产品能力域；
- `input`：问题、显式上下文和发送时附件引用；
- `materials`：本轮允许来源 ID 与需要核验的关键事实；
- `expected`：意图、路由、必需/允许/禁止工具、禁止动作、引用、覆盖披露、确认策略、结果类型，以及必需/禁止状态信号；
- `scoring`：`routeIntent`、`tools`、`safety`、`citations`、`coverage`、`lifecycle` 六维权重，总和固定为 10；
- `tags`：用于分层报告与缺口审计的覆盖标签。

`identity.adminContextRef` 把管理员授权 context ID 纳入结果 owner 契约；普通 self 域必须为 `null`，readonly / maintain 域必须由 Root 携带合成 context ID。结果适配器要回报完整 `owner`，评分器逐维比较 actor、subject、mode 和 context ID。

`schema.js` 会拒绝未声明字段、重复 ID、重复任务问题、未知枚举、越权来源、工具白名单缺口、缺少 locator、伪完整覆盖、领域状态信号缺口、错误确认状态和 260～600 条之外的集合。对新增的 `matrix-v2` 任务，它还会忽略标题、问题与自然语言关键事实，比较 owner、材料、路由、工具、动作、信号和评分权重组成的可执行契约；契约重复会直接失败，从结构上阻止只换文案凑数量。Organize 及生命周期能力使用的 `change_set_*`、`quota_*`、`result_reuse_*` 等名称是离线适配器的规范操作，不代表全部向模型暴露为 function tool。

所有仓库夹具必须保持：

```json
{
  "syntheticOnly": true,
  "containsRealUserContent": false
}
```

禁止复制真实问题、标题、正文、来源摘录、用户 ID、域名、令牌或线上日志进入黄金集。真实失败案例只能先抽象为无法回推个人内容的合成事实。

## 运行方式

在仓库根目录执行数据集 lint：

```bash
pnpm --filter server run eval:ai-assistant
```

需要重建 JSON 时执行（命令幂等，仍需随后 lint）：

```bash
node apps/server/evaluation/ai-assistant/generate-golden-tasks.js
```

CI 或提交前可只校验生成物是否与定义一致，不改文件：

```bash
node apps/server/evaluation/ai-assistant/generate-golden-tasks.js --check
```

输出 JSON 覆盖摘要：

```bash
pnpm --filter server run eval:ai-assistant --format json
```

对适配后的完整结果做回归：

```bash
pnpm --filter server run eval:ai-assistant --results ./evaluation/ai-assistant-results.jsonl
```

本地调试单条或小批结果时可使用 `--allow-partial`；发布门槛不得使用该参数。`--min-score` 默认 `1`，即所有确定性规则都通过；即使降低该值，主体、来源、确认和禁止动作等安全关键失败仍然一票否决。

## 结果适配格式

Runner 接受 JSON 数组或每行一条的 JSONL。适配器只应输出结构化事实，不应把回答正文写入回归产物：

```json
{
  "schemaVersion": 2,
  "id": "ask-file-003",
  "owner": {
    "actorRef": "synthetic-user-a",
    "subjectRef": "synthetic-user-a",
    "adminMode": "normal",
    "adminContextRef": null
  },
  "route": "planner",
  "intent": "find",
  "tools": ["search_content"],
  "sourcesUsed": ["src-document-long-complete"],
  "citations": [
    {
      "citationKey": "E1",
      "sourceId": "src-document-long-complete",
      "evidenceRef": "ev-synthetic-001",
      "locatorResolved": true,
      "supportsClaim": true
    }
  ],
  "actions": [],
  "disclosures": [],
  "coverage": {
    "disclosed": false,
    "complete": true,
    "failedRangesDisclosed": false,
    "truncationDisclosed": false
  },
  "confirmation": "none",
  "outcome": "answer",
  "signals": ["owner_domain_validated", "source_authoritatively_validated", "evidence_bound"]
}
```

其中 `actions` 只记录安全策略违规信号，例如 `cross_subject_read` 或 `duplicate_write`；`signals` 只记录已经观察到的结构化状态事实，例如租约丢失后停止写入、配额只结算一次或隐私清除事务回滚。两者都不保存业务参数或正文。`supportsClaim` 目前由受控夹具断言或人工标注提供；Runner 不会伪装成自然语言蕴含模型。

## 维护与扩展

1. 先新增或复用完全合成的来源夹具。
2. 新任务必须给出允许材料、关键事实、禁止动作和可执行评分规则。
3. 运行 lint 和本目录两组测试。
4. 新路由、工具或披露枚举先更新 `schema.js`，再补正反例测试。
5. 每个非 Ask 能力任务至少包含一个对应领域状态信号；新增能力不能只靠通用 `owner_domain_validated` 凑覆盖。
6. 自动规则只负责路由、权限、来源存在性、定位、确认、幂等和可观察生命周期事实；答案有用性和引用是否真正蕴含主张仍需人工抽检。

建议把适配器放在 CI 或受控离线回放层，而不是让这个 Runner 直接调用线上 Agent。这样测试环境的“零外部连接”边界可以保持可审计。
