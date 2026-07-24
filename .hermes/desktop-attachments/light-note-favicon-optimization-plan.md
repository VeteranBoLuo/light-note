# 轻笺批量导入书签图标优化计划

> 涉及仓库：
>
> - `VeteranBoLuo/light-note`
> - `VeteranBoLuo/favicon-api`
>
> 目标：解决轻笺批量导入 100～1000 条书签时，大量 favicon 获取失败、补全耗时过长、重复请求过多、临时失败后长期不再重试、用户离开页面后任务中止等问题。

---

## 一、背景与当前问题

轻笺当前批量导入书签时，导入接口本身只负责写入书签、标签和关联关系。

导入完成后，前端重新加载书签列表，并调用图标补全接口。

当前链路大致如下：

```text
导入书签
→ 写入数据库
→ 前端重新加载全部书签
→ 前端按批调用 /api/common/analyzeImgUrl
→ 轻笺后端调用本机 favicon-api
→ favicon-api 抓取网页、favicon.ico 或聚合源
→ 轻笺将图片保存到本地并更新 bookmark.icon_url
```

当前存在以下核心问题。

### 1. 轻笺产生瞬时并发洪峰

轻笺前端当前默认：

```text
batchSize = 20
concurrency = 2
```

即前端最多同时请求两个批次。

轻笺后端收到每批 20 条后，又使用 `Promise.all()` 同时抓取批内所有图标。

因此单个用户批量导入时，实际可能产生：

```text
2 个批次 × 每批 20 条
= 约 40 个同时进行的 favicon 抓取
```

多个用户同时操作时，并发量还会继续叠加。

### 2. 轻笺和 favicon-api 超时不一致

轻笺调用 favicon-api 的超时约为 12 秒。

favicon-api 当前单个冷请求可能依次执行：

```text
抓取网页 HTML
→ 获取网页声明图标或 /favicon.ico
→ favicone 聚合源
→ Yandex 聚合源
```

这些阶段的超时可能累加到 20 秒以上。

因此可能出现：

```text
轻笺等待 12 秒后判定失败并断开
→ favicon-api 仍在继续处理
→ 无效请求继续消耗网络和连接
→ 后续请求更加拥堵
```

### 3. favicon-api 缺少全局并发保护

favicon-api 当前有成功结果缓存，但没有完整的：

- 全局并发限制
- 最大等待队列
- 同一 Origin 进行中请求合并
- 总时间预算
- 服务繁忙时反压
- 结构化错误分类
- 失败短缓存

同一域名的多个冷请求同时到达时，可能各自执行完整抓取。

### 4. 临时失败被轻笺标记为“已经检查”

轻笺当前抓取失败后仍可能更新：

```sql
icon_checked_at = NOW()
```

没有图标的书签，前端通常需要等待约 24 小时才再次尝试。

因此一次临时超时或服务拥堵，会导致书签长时间显示默认图标。

### 5. 外部网络请求期间占用数据库连接

轻笺当前图标接口取得数据库连接后，在网络抓取完成前可能一直不释放连接。

图标抓取可能持续数秒甚至十几秒。

批量导入和多用户并发时，会增加数据库连接池压力。

### 6. 用户离开页面后补全不能保证继续

当前补图主要由浏览器页面发起。

用户关闭页面、刷新页面或网络中断后，剩余补图工作不能保证继续。

因此当前不能真正向用户承诺：

> 图标正在后台补全，你可以离开页面。

---

## 二、整体目标

优化完成后，希望达到以下产品体验：

```text
用户导入 200 条书签
→ 导入接口快速返回
→ 页面立即显示书签
→ 服务端后台慢慢补全图标
→ 页面显示“图标补全 56/200”
→ 用户可以离开页面
→ 服务端继续执行
→ 临时失败自动重试
→ 用户回来后可以看到最新进度
```

### 目标性能

以下为工程目标，最终必须通过同一批测试网址进行优化前后对比。

#### 200 条书签，100～160 个不同 Origin，冷缓存

```text
导入接口返回：≤ 5 秒
第一批图标出现：≤ 5 秒
50% 图标完成：≤ 15 秒
90% 图标完成：≤ 45 秒
全部进入终态：≤ 90 秒
正常可访问站点最终成功率：≥ 95%
```

#### 200 条书签，约 50 个不同 Origin

```text
全部完成目标：5～20 秒
真实外部抓取次数应接近 Origin 数，而不是书签数
```

#### 已缓存场景

```text
单个请求 P95：≤ 100 毫秒
200 条重复导入：尽量在数秒内完成
```

#### favicon-api 冷请求目标

```text
P50：≤ 2.5 秒
P95：≤ 8 秒
请求总耗时不明显超过配置的总时间预算
```

---

## 三、开发规则

执行前必须读取轻笺项目中的：

```text
AGENTS.md
ln-ai-intro.md（若存在，只读，不得泄露敏感信息）
docs/architecture.md
docs/development.md
docs/design.md
docs/release-acceptance.md
```

轻笺开发必须遵守：

- 使用中文回答
- 有自研 B 组件时必须使用 B 组件
- 不新增 Ant Design Vue 组件
- 静态 UI 图标统一放入 `apps/web/src/config/icon.ts`
- 同时适配 PC、移动端、深浅主题和中英文
- 后端用户输入必须参数化
- 不信任前端提供的用户 ID、URL 或资源归属
- 只要求分析时不得修改代码
- 未经明确授权不得提交、推送或部署
- 上线前必须运行 `pnpm preview`
- 完成本地预览后必须等待用户明确确认才允许部署

两个仓库均不得为了追求速度而：

- 跳过 SSRF 校验
- 降低图片真实性校验
- 使用统一默认假图冒充网站图标
- 将失败伪装成成功
- 记录用户完整书签 URL、标题或正文到普通性能日志
- 向客户端返回内部路径、对象存储 Key 或原始异常

---

# 阶段 0：建立优化前基准

## 目标

在修改代码前，记录当前的真实耗时、成功率和请求量。

没有优化前基准，就无法证明优化是否有效。

## 0.1 favicon-api 增加基准脚本

新增：

```text
favicon-api/scripts/benchmark.mjs
```

在 `package.json` 中增加：

```json
{
  "scripts": {
    "benchmark": "node scripts/benchmark.mjs"
  }
}
```

使用方式：

```bash
npm run benchmark -- ./benchmark/urls-cold-200.txt
```

输入文件每行一个公开网址。

严禁使用真实用户书签数据。

## 0.2 准备三套测试集

### 测试集 A：200 个不同域名

用于测试冷请求吞吐。

```text
benchmark/urls-cold-200.txt
```

### 测试集 B：200 条网址，约 50 个不同 Origin

模拟同一个网站存在多个页面。

```text
benchmark/urls-duplicate-200.txt
```

### 测试集 C：重复执行测试集 A

用于测试缓存命中速度。

## 0.3 基准输出字段

脚本至少输出：

```text
total
success
failed
successRate
durationMs
requestsPerSecond
p50
p90
p95
max
errorCodeDistribution
sourceTypeDistribution
cacheHit
cacheMiss
```

保存结果：

```text
benchmark/results/baseline-cold-200.json
benchmark/results/baseline-duplicate-200.json
benchmark/results/baseline-warm-200.json
```

## 0.4 轻笺增加批次性能统计

只记录无正文指标：

```text
batchId
bookmarkCount
uniqueOriginCount
successCount
notFoundCount
retryableFailedCount
permanentFailedCount
totalDurationMs
p50
p95
cacheHitCount
deduplicatedCount
```

禁止记录：

```text
完整 URL
书签标题
用户正文
图标二进制
第三方响应正文
```

## 阶段 0 验收

- 基准脚本可以稳定执行
- 结果文件可重复生成
- 已获得优化前冷缓存、重复域名、热缓存三组数据
- 未修改现有业务行为

---

# 阶段 1：优化 favicon-api

> 第一阶段先提高图标服务本身的单请求速度和抗压能力。

重点检查和修改：

```text
favicon-api/src/favicon.js
favicon-api/src/index.js
```

建议新增：

```text
favicon-api/src/limiter.js
favicon-api/src/runtime-metrics.js
favicon-api/src/error.js
```

## 1.1 同 Origin 进行中请求合并

当前成功缓存只有在抓取完成后才生效。

需要增加：

```javascript
const inFlight = new Map();
```

规范化缓存键：

```text
protocol + hostname + port
```

处理流程：

```text
规范化 Origin
→ 查询成功缓存
→ 查询失败缓存
→ 查询 inFlight
→ 已有 inFlight：等待同一个 Promise
→ 没有：创建真实抓取 Promise
→ 成功或失败后删除 inFlight
```

必须保证：

- 同一 Origin 的 100 个并发请求，只执行一次真实抓取
- 后续请求复用相同结果
- Promise 成功和失败后都清理 `inFlight`
- 一个客户端断开不能取消其他客户端共享的抓取

### 测试

```text
100 个请求同时请求 github.com
→ 底层抓取函数只执行一次
→ 100 个调用获得相同结果
```

## 1.2 全局并发限制和等待队列

新增环境变量：

```env
FAVICON_FETCH_CONCURRENCY=8
FAVICON_QUEUE_MAX=500
FAVICON_QUEUE_RETRY_AFTER_SECONDS=15
```

语义：

```text
最多同时抓取 8 个不同 Origin
其余任务排队
队列最多 500 个 Origin
超过后立即返回 503
```

队列满响应：

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 15
Content-Type: application/json
```

响应：

```json
{
  "code": "QUEUE_FULL",
  "retryable": true,
  "error": "Favicon service is busy"
}
```

要求：

- 全局 active 永远不超过配置
- 不能为每个请求各建一套并发池
- 队列必须 FIFO 或采用可解释的公平策略
- 请求取消时应从尚未开始的队列中移除
- 不需要增加大型第三方依赖

## 1.3 抓取来源并行竞速

当前顺序链路尾部耗时可能累加。

建议改为 Hedged Request 竞速。

### 第一阶段立即启动

```text
A：抓取首页 HTML，解析声明的图标
B：直接请求 Origin /favicon.ico
```

### 延迟启动第一个聚合源

如果约 1000 毫秒仍未成功：

```text
启动 favicone
```

### 延迟启动第二个聚合源

如果约 1500 毫秒仍未成功：

```text
启动 Yandex
```

新增环境变量：

```env
FAVICON_AGGREGATOR_HEDGE_MS=1000
FAVICON_SECOND_AGGREGATOR_HEDGE_MS=1500
```

第一个返回有效图标的来源胜出。

其他尚未完成的请求应使用 `AbortController` 取消。

不要从一开始就同时请求所有第三方源，避免批量导入将外部请求数放大数倍。

### 来源类型

成功结果增加：

```text
declared
favicon
favicone
yandex
cache
```

## 1.4 单次请求总时间预算

新增：

```env
FAVICON_TOTAL_TIMEOUT_MS=9000
```

总预算必须覆盖：

```text
DNS
HTML
直接图标
声明图标
聚合源
重定向
响应读取
```

不能给每个阶段单独完整超时并让其累加。

实现方式：

```javascript
const deadline = Date.now() + totalTimeoutMs;

function remainingMs() {
  return Math.max(0, deadline - Date.now());
}
```

每次创建子请求时，使用当前剩余时间。

预算耗尽后统一抛出：

```json
{
  "code": "UPSTREAM_TIMEOUT",
  "retryable": true,
  "error": "Favicon request timed out"
}
```

## 1.5 结构化错误响应

统一错误格式：

```json
{
  "code": "UPSTREAM_TIMEOUT",
  "retryable": true,
  "error": "Favicon request timed out"
}
```

支持错误码：

```text
INVALID_URL
PRIVATE_ADDRESS
DNS_ERROR
ICON_NOT_FOUND
UPSTREAM_TIMEOUT
UPSTREAM_ERROR
QUEUE_FULL
INTERNAL_ERROR
```

建议语义：

| 错误码 | retryable | HTTP |
|---|---:|---:|
| INVALID_URL | false | 400 |
| PRIVATE_ADDRESS | false | 403 |
| DNS_ERROR | true | 502 |
| ICON_NOT_FOUND | false | 404 |
| UPSTREAM_TIMEOUT | true | 504 或 502 |
| UPSTREAM_ERROR | true | 502 |
| QUEUE_FULL | true | 503 |
| INTERNAL_ERROR | true | 500 |

对以下错误返回 `Retry-After`：

```text
QUEUE_FULL
UPSTREAM_TIMEOUT
UPSTREAM_ERROR
```

不得让轻笺依赖英文错误文本判断错误类型。

## 1.6 成功缓存和失败缓存

### 成功缓存

保留现有成功缓存，并支持环境变量：

```env
FAVICON_SUCCESS_CACHE_TTL_MS=3600000
FAVICON_SUCCESS_CACHE_MAX=1000
```

### 失败缓存

新增失败缓存：

| 错误 | 缓存时间 |
|---|---:|
| ICON_NOT_FOUND | 6 小时 |
| INVALID_URL | 1 小时 |
| PRIVATE_ADDRESS | 1 小时 |
| DNS_ERROR | 60 秒 |
| UPSTREAM_TIMEOUT | 30 秒 |
| UPSTREAM_ERROR | 30 秒 |
| QUEUE_FULL | 不缓存 |

新增环境变量时允许调整默认值。

缓存命中必须返回原始结构化错误。

## 1.7 响应头

成功响应增加：

```http
X-Favicon-Cache: hit
X-Favicon-Duration-Ms: 1234
X-Favicon-Source-Type: favicon
```

可选值：

```text
X-Favicon-Cache: hit | miss
X-Favicon-Source-Type: declared | favicon | favicone | yandex | cache
```

不要只返回完整第三方来源 URL。

## 1.8 运行状态与指标

扩展 `/health` 或新增：

```text
GET /runtime
```

返回：

```json
{
  "status": "ok",
  "active": 6,
  "queued": 34,
  "inFlightOrigins": 6,
  "successCacheEntries": 420,
  "failureCacheEntries": 31,
  "successCount": 1200,
  "timeoutCount": 45,
  "queueRejectedCount": 3,
  "deduplicatedCount": 260,
  "cacheHitCount": 830
}
```

不得暴露具体域名。

建议内部统计：

```text
directSuccess
declaredSuccess
faviconIcoSuccess
faviconeSuccess
yandexSuccess
timeoutCount
queueRejectedCount
deduplicatedCount
cacheHitCount
cacheMissCount
averageDuration
p95Duration
```

## 1.9 favicon-api 测试

至少覆盖：

- 同 Origin 请求合并
- 不同 Origin 全局并发限制
- 队列 FIFO
- 队列满返回 503
- `Retry-After`
- 总时间预算
- 第一有效来源胜出
- 其他来源请求被取消
- 成功缓存
- 失败缓存
- 结构化错误
- SSRF 防护不回归
- 每次重定向重新校验目标地址
- ETag 不回归
- `/health` 或 `/runtime` 不泄露域名

执行：

```bash
npm test
npm run check
npm run benchmark -- ./benchmark/urls-cold-200.txt
npm run benchmark -- ./benchmark/urls-duplicate-200.txt
npm run benchmark -- ./benchmark/urls-cold-200.txt
```

## 阶段 1 验收

相较阶段 0：

```text
冷请求 P95 降低至少 40%
同 Origin 重复批次真实外部请求降低至少 70%
全局 active 不超过配置
队列不会无界增长
请求总耗时不明显超过总预算
缓存请求保持毫秒级
```

---

# 阶段 2：优化轻笺现有图标抓取链路

> 这一阶段先止血，不建立持久化后台任务表。

重点修改：

```text
light-note/apps/server/router_handle/commonHandle.js
light-note/apps/web/src/api/commonApi.ts
```

建议拆分新增：

```text
light-note/apps/server/util/bookmarkIconService.js
light-note/apps/server/util/bookmarkIconLimiter.js
light-note/apps/server/util/bookmarkIconClient.js
```

## 2.1 网络抓取期间不占数据库连接

当前逻辑需要拆成三段。

### 阶段 A：短查询

使用 `pool.query` 或短连接读取：

```text
id
url
icon_url
icon_checked_at
```

查询完成立即释放连接。

### 阶段 B：网络抓取

调用 favicon-api。

此阶段禁止持有数据库连接。

### 阶段 C：短更新

抓取完成后，使用短 SQL 更新对应书签。

不得在等待外部请求的数秒到十几秒期间一直占用数据库连接。

## 2.2 轻笺全局并发限制

新增环境变量：

```env
BOOKMARK_ICON_FETCH_CONCURRENCY=6
BOOKMARK_ICON_API_TIMEOUT_MS=12000
```

轻笺整个后端进程最多同时向 favicon-api 请求 6 个不同 Origin。

注意：

- 必须是进程级全局限制
- 不能每个 HTTP 请求各限制为 6
- 后续后台 Worker 应复用同一限制器
- 不能只依赖前端控制

## 2.3 按 Origin 合并请求

将书签 URL 规范化为：

```text
protocol + hostname + port
```

例如：

```text
https://github.com/user/a
https://github.com/user/b
https://github.com/openai/project
```

应只请求一次：

```text
https://github.com
```

同一 Origin 的结果应用到对应的所有书签。

注意：

- 不使用书签标题进行分组
- 不信任前端传入 Origin
- 使用数据库中的权威 URL
- 写回前必须确认书签 URL 仍然未变

## 2.4 对接 favicon-api 结构化错误

轻笺调用 favicon-api 时读取：

```text
HTTP 状态
code
retryable
Retry-After
X-Favicon-Cache
X-Favicon-Duration-Ms
X-Favicon-Source-Type
```

调用超时应略大于 favicon-api 总预算：

```text
favicon-api 总预算：9000ms
轻笺等待：12000ms
```

不要根据英文错误字符串判断类型。

## 2.5 修改 icon_checked_at 规则

### 成功

```text
更新 icon_url
更新 icon_checked_at
```

### ICON_NOT_FOUND

```text
不更新 icon_url
更新 icon_checked_at
```

表示已明确尝试并没有找到有效图标。

### retryable = true

包括：

```text
DNS_ERROR
UPSTREAM_TIMEOUT
UPSTREAM_ERROR
QUEUE_FULL
INTERNAL_ERROR
```

处理：

```text
不更新 icon_url
不更新 icon_checked_at
```

防止临时失败进入 24 小时冷却。

### 不可重试错误

```text
INVALID_URL
PRIVATE_ADDRESS
```

可写入明确的终止状态，但不要反复自动请求。

如果当前数据库只有 `icon_checked_at`，阶段 2 可以先避免更新；阶段 3再通过任务表精确记录错误状态。

## 2.6 轻量即时重试

实时接口遇到 retryable 错误时，只允许做一次短重试：

```text
第一次失败
→ 随机等待 800～1500ms
→ 再尝试一次
```

不要在一个 HTTP 请求内重试多次，避免请求时间过长。

分钟级重试放到阶段 3后台任务中。

## 2.7 暂时降低前端洪峰

在阶段 3完成前，将：

```typescript
batchSize = 20
concurrency = 2
```

临时改为：

```typescript
batchSize = 10
concurrency = 1
```

这是保护措施，不是最终吞吐策略。

最终真实并发由服务端全局限制器控制。

## 2.8 原有图标保护

刷新已有图标失败时：

```text
保留旧图标
不清空 icon_url
不展示默认图替换旧图
```

只有跨站点修改书签地址时，才能隐藏旧站点图标并显示加载状态。

## 2.9 轻笺阶段 2 测试

至少覆盖：

- 同 Origin 只调用一次 favicon-api
- 全局并发永远不超过配置
- 网络抓取期间不持有数据库连接
- retryable 失败不更新 `icon_checked_at`
- ICON_NOT_FOUND 更新检查时间
- 成功更新图标和检查时间
- 刷新失败不清除旧图
- 用户 A 不能操作用户 B 的书签
- 管理员 readonly 模式不能写图标
- 管理员 maintain 模式遵循现有策略
- 前端整批失败不影响后续批
- 快速切换页面不会产生重复请求洪峰

## 阶段 2 验收

```text
200 条导入不再瞬时产生约 40 路抓取
轻笺发给 favicon-api 的请求数降低 20%～60%
数据库连接占用时间明显下降
临时失败不再导致 24 小时默认图标
失败书签可以在短时间内再次尝试
```

---

# 阶段 3：实现真正的后台图标补全任务

> 这一阶段实现用户可以离开页面的可靠后台补全。

## 3.1 新增任务表

先确认线上真实 `bookmark.id` 和 `user.id` 类型，再编写迁移。

建议表：

```sql
CREATE TABLE bookmark_icon_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  bookmark_id VARCHAR(36) NOT NULL,
  url_snapshot VARCHAR(2048) NOT NULL,
  origin_key VARCHAR(512) NOT NULL,
  url_hash CHAR(64) NOT NULL,
  status ENUM(
    'queued',
    'processing',
    'retry_wait',
    'success',
    'not_found',
    'failed',
    'cancelled'
  ) NOT NULL DEFAULT 'queued',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at DATETIME NULL,
  locked_by VARCHAR(96) NULL,
  error_code VARCHAR(64) NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_icon_job_queue (status, available_at, id),
  KEY idx_icon_job_batch (user_id, batch_id, status),
  KEY idx_icon_job_bookmark (user_id, bookmark_id),
  UNIQUE KEY uk_icon_job_bookmark_url (bookmark_id, url_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

不要盲目执行以上 SQL。

必须先确认：

- `bookmark.id` 的真实类型和长度
- `user.id` 的真实类型和长度
- MySQL 5.7 兼容性
- 项目迁移机制
- 是否需要 schema assertion
- 是否需要运行时 ensure 表

## 3.2 导入服务返回受影响书签 ID

修改：

```text
apps/server/util/services/bookmarkImportService.js
```

当前统计增加内部字段：

```javascript
createdBookmarkIds
affectedBookmarkIds
```

语义：

```text
createdBookmarkIds：本次新创建的书签
affectedBookmarkIds：本次创建或补充标签关系的书签
```

对外接口不一定需要暴露全部 ID。

Handler 在事务完成后使用这些 ID 创建图标补全任务。

只给以下书签创建任务：

- 本次新创建且没有图标
- 本次受影响且当前没有图标
- 明确需要刷新图标的书签

禁止导入后扫描整个账号全部书签。

## 3.3 创建图标补全批次

导入时生成：

```text
batchId = UUID
```

创建任务后，导入接口返回：

```json
{
  "parsedTotal": 200,
  "createdBookmarks": 190,
  "createdTags": 30,
  "boundRelations": 220,
  "iconBatch": {
    "batchId": "uuid",
    "total": 190,
    "status": "queued"
  }
}
```

### 原子性建议

推荐：

```text
书签导入成功
图标任务创建失败
→ 不回滚书签导入
→ 返回导入成功，但 iconBatch unavailable
→ 后续缺图扫描兜底
```

图标补全属于增强能力，不应因为队列异常导致用户的书签导入全部失败。

但任务创建过程必须幂等。

## 3.4 新增独立 Worker

建议新增：

```text
apps/server/bookmarkIconWorker.js
apps/server/util/bookmarkIconWorkerService.js
```

服务端脚本：

```json
{
  "worker:bookmark-icons": "node bookmarkIconWorker.js"
}
```

环境变量：

```env
BOOKMARK_ICON_WORKER_CONCURRENCY=6
BOOKMARK_ICON_WORKER_BATCH_SIZE=30
BOOKMARK_ICON_WORKER_POLL_MS=1500
BOOKMARK_ICON_WORKER_LOCK_TIMEOUT_MS=300000
BOOKMARK_ICON_MAX_ATTEMPTS=4
```

## 3.5 MySQL 5.7 任务抢占

不能使用 MySQL 8 的 `SKIP LOCKED`。

建议流程：

```text
开启事务
SELECT 可执行任务 LIMIT 30 FOR UPDATE
更新选中任务：
  status = processing
  locked_by = 当前 Worker ID
  locked_at = NOW()
提交事务
事务外执行外部网络请求
```

启动和周期恢复：

```text
processing 且 locked_at 超过 5 分钟
→ 重置为 retry_wait
→ available_at = NOW()
```

注意多实例和重复抢占。

## 3.6 Worker 按 Origin 分组

抢到任务后：

```text
按 origin_key 分组
每个 Origin 只请求 favicon-api 一次
结果应用到该 Origin 的所有书签
```

写回每条书签前必须重新查询并确认：

```text
书签仍属于该用户
del_flag = 0
当前 URL hash 等于任务 url_hash
```

如果 URL 已修改：

```text
任务状态 → cancelled
不得用旧站点图标覆盖新地址
```

## 3.7 重试策略

retryable 错误采用：

```text
第 1 次失败：1 分钟后
第 2 次失败：5 分钟后
第 3 次失败：30 分钟后
第 4 次失败：failed
```

增加 10%～20% 随机抖动。

例如：

```text
1 分钟 ± 12 秒
5 分钟 ± 60 秒
30 分钟 ± 6 分钟
```

防止大量任务在同一秒重新冲击服务。

### 状态映射

```text
成功 → success
ICON_NOT_FOUND → not_found
INVALID_URL → failed
PRIVATE_ADDRESS → failed
retryable 且未达上限 → retry_wait
retryable 且达到上限 → failed
书签删除或 URL 变化 → cancelled
```

## 3.8 进度接口

新增：

```text
POST /api/bookmark/getIconBatchStatus
```

请求：

```json
{
  "batchId": "uuid"
}
```

必须根据认证后的当前资源用户查询，不接受请求中的 userId。

返回：

```json
{
  "batchId": "uuid",
  "total": 200,
  "completed": 86,
  "success": 78,
  "notFound": 4,
  "failed": 4,
  "cancelled": 0,
  "queued": 90,
  "processing": 6,
  "retryWaiting": 18,
  "status": "processing"
}
```

终态计入 `completed`：

```text
success
not_found
failed
cancelled
```

## 3.9 重试失败项接口

新增：

```text
POST /api/bookmark/retryIconBatchFailures
```

参数：

```json
{
  "batchId": "uuid",
  "includeNotFound": false
}
```

只能重试当前用户的批次。

重试时：

- 重新读取当前书签 URL
- 重新生成 `url_snapshot`
- 重新生成 `origin_key`
- 重新生成 `url_hash`
- 不信任旧任务保存的 URL
- 重置 attempts
- 设置 queued

## 3.10 前端持续进度卡

导入成功后显示：

```text
已导入 200 条书签
图标正在后台补全（0/190），你可以离开当前页面。
```

不能只使用几秒后消失的 BMessage。

建议新增：

```text
apps/web/src/components/manage/bookmarkMg/BookmarkIconBatchProgress.vue
```

使用：

```text
BCard
BLoading
BButton
SvgIcon
```

不得新增原生按钮和 Ant Design 组件。

进度卡内容：

```text
图标补全 86/190
成功 78
暂未找到 4
失败 4
等待重试 18
```

操作：

```text
收起
查看进度
重试失败项
```

## 3.11 进度恢复

将当前未完成批次的 `batchId` 存入：

```text
按用户隔离的 Pinia/localStorage
```

用户重新进入页面时：

```text
读取 batchId
→ 调用状态接口
→ 未完成则恢复轮询
→ 完成则重新加载书签
```

轮询：

```text
页面可见：每 1.5～2 秒
页面隐藏：停止轮询或每 10 秒
任务完成：停止轮询
```

用户离开页面不影响 Worker。

## 3.12 避免双重补图

后台批次执行期间，不能再让：

```text
loadBookmarkIconsProgressively()
```

对同一批书签发起请求。

可选实现：

- 列表接口返回 `iconPending`
- 前端保存当前批次涉及书签 ID
- 导入后不立即触发全列表渐进补图
- 所有周期刷新也统一进入后台图标服务

## 3.13 阶段 3 测试

必须覆盖：

- 导入成功后产生 batchId
- Worker 在用户离开页面后继续
- 服务重启恢复超时的 processing 任务
- 同 Origin 只请求一次
- 书签 URL 修改后旧任务取消
- 书签删除后任务取消
- 用户 A 不能读取用户 B 的批次
- readonly 管理上下文不能触发写
- retry_wait 时间和抖动正确
- 进度统计正确
- 重试失败项正确
- 前端刷新后恢复轮询
- 完成后重新加载图标
- 后台任务失败不影响书签导入结果

## 阶段 3 验收

```text
导入接口不等待图标抓取
用户关闭页面后任务继续
200 条书签可展示准确进度
临时失败自动重试
服务重启不永久丢失任务
没有同一批次的前端重复抓取
```

---

# 阶段 4：持久缓存与进一步加速

> 阶段 4为增强项。前三阶段完成后，主要问题已经解决。

## 4.1 favicon-api 持久缓存

当前内存缓存会在进程重启后丢失。

新增可选配置：

```env
FAVICON_CACHE_DIR=./data/cache
FAVICON_PERSISTENT_CACHE_TTL_MS=604800000
FAVICON_PERSISTENT_CACHE_MAX_ENTRIES=5000
```

缓存结构：

```text
Origin SHA256
├── icon.bin
└── metadata.json
```

元数据：

```json
{
  "origin": "https://github.com",
  "contentType": "image/png",
  "sourceType": "declared",
  "etag": "...",
  "createdAt": 0,
  "expiresAt": 0
}
```

要求：

- 临时文件写入
- 原子 rename
- 不一次性将所有图标读入内存
- 按需读取
- 小批次清理
- 不阻塞请求主链
- 缓存目录权限受控
- 缓存文件名不能直接使用用户输入

## 4.2 轻笺利用 ETag

后续周期刷新时，可保存 favicon-api 返回的 ETag。

再次检查时携带：

```http
If-None-Match: "etag"
```

收到 304：

```text
不重新下载图标
只更新 icon_checked_at
```

这项需要评估是否增加数据库字段，或只在缓存层维护。

不要为这一增强项阻塞前三阶段上线。

---

# 四、预期性能提升

以下为工程预估，不是保证值。

必须通过阶段 0 的同一批数据进行实测。

## 只优化轻笺

主要收益：

- 减少瞬时并发
- 同 Origin 去重
- 避免数据库连接长期占用
- 临时失败快速恢复
- 服务端后台执行

预估：

```text
200 条首次补图：
当前约 60～120 秒且可能大量失败
优化后约 35～80 秒完成大多数
```

若重复 Origin 较多：

```text
约 15～40 秒
```

## 只优化 favicon-api

主要收益：

- 抓取来源竞速
- 同 Origin inFlight 合并
- 总时间预算
- 成功与失败缓存
- 服务过载保护

预估：

```text
冷请求 P50：2～6 秒 → 0.8～2.5 秒
冷请求 P95：10～22 秒 → 4～8 秒
```

200 条不同 Origin：

```text
约 30～80 秒
```

## 两边都优化

不同 Origin 较多：

```text
200 条约 20～50 秒完成大多数
```

重复 Origin 较多：

```text
约 5～20 秒
```

缓存命中：

```text
数秒内完成
```

总体保守目标：

```text
2～4 倍提速
```

重复 Origin 或缓存命中较高：

```text
5～10 倍提速
```

---

# 五、部署顺序

推荐发布顺序：

```text
1. favicon-api 阶段 1
2. 验证结构化错误和性能
3. 轻笺阶段 2
4. 验证现有补图成功率
5. 轻笺阶段 3后台 Worker
6. 前端进度卡
7. favicon-api 持久缓存
```

原因：

- 新版 favicon-api 应保持向后兼容
- 轻笺阶段 2可以开始使用新错误码
- 阶段 3依赖稳定的 favicon-api 行为

---

# 六、环境变量清单

## favicon-api

```env
FAVICON_FETCH_CONCURRENCY=8
FAVICON_QUEUE_MAX=500
FAVICON_QUEUE_RETRY_AFTER_SECONDS=15
FAVICON_TOTAL_TIMEOUT_MS=9000
FAVICON_AGGREGATOR_HEDGE_MS=1000
FAVICON_SECOND_AGGREGATOR_HEDGE_MS=1500
FAVICON_SUCCESS_CACHE_TTL_MS=3600000
FAVICON_SUCCESS_CACHE_MAX=1000
FAVICON_CACHE_DIR=./data/cache
FAVICON_PERSISTENT_CACHE_TTL_MS=604800000
FAVICON_PERSISTENT_CACHE_MAX_ENTRIES=5000
```

持久缓存相关变量在阶段 4之前可以不配置。

## 轻笺

```env
BOOKMARK_ICON_FETCH_CONCURRENCY=6
BOOKMARK_ICON_API_TIMEOUT_MS=12000
BOOKMARK_ICON_WORKER_CONCURRENCY=6
BOOKMARK_ICON_WORKER_BATCH_SIZE=30
BOOKMARK_ICON_WORKER_POLL_MS=1500
BOOKMARK_ICON_WORKER_LOCK_TIMEOUT_MS=300000
BOOKMARK_ICON_MAX_ATTEMPTS=4
```

---

# 七、回滚方案

## favicon-api 回滚

需要提供环境变量开关：

```env
FAVICON_HEDGED_FETCH_ENABLED=false
FAVICON_QUEUE_ENABLED=false
FAVICON_FAILURE_CACHE_ENABLED=false
```

发生异常时可分别关闭：

- 竞速抓取
- 等待队列
- 失败缓存

成功缓存和 SSRF 防护必须保持。

## 轻笺回滚

提供开关：

```env
BOOKMARK_ICON_BACKGROUND_JOBS_ENABLED=false
```

关闭后：

```text
不创建后台批次
恢复原有渐进补图
但仍保留阶段 2的全局并发限制和失败处理
```

后台任务表不需要删除。

已创建任务可以：

- 暂停领取
- 保留等待后续恢复
- 或由管理员明确取消

---

# 八、最终验收清单

## favicon-api

- [ ] 冷请求 P50 ≤ 2.5 秒
- [ ] 冷请求 P95 ≤ 8 秒
- [ ] 缓存请求 P95 ≤ 100 毫秒
- [ ] 同 Origin 并发只发生一次真实抓取
- [ ] active 永不超过配置
- [ ] 队列满返回 503 和 Retry-After
- [ ] 请求不明显超过总时间预算
- [ ] SSRF 防护没有回归
- [ ] 图片有效性验证没有降低
- [ ] 不返回统一占位假图

## 轻笺

- [ ] 导入接口 ≤ 5 秒返回
- [ ] 第一批图标 ≤ 5 秒出现
- [ ] 50% ≤ 15 秒完成
- [ ] 90% ≤ 45 秒完成
- [ ] 全部终态 ≤ 90 秒
- [ ] 可访问站点成功率 ≥ 95%
- [ ] 页面关闭后任务继续
- [ ] 临时失败不更新 icon_checked_at
- [ ] 同 Origin 只请求一次
- [ ] 网络请求期间不占数据库连接
- [ ] 用户无法读取其他用户批次
- [ ] 书签 URL 变化后旧任务不会覆盖
- [ ] PC、移动端、深浅主题、中英文正常

---

# 九、每阶段交付回复模板

每完成一个阶段，必须按以下格式回复。

## 1. 本阶段完成内容

说明实现了哪些能力。

## 2. 新增、修改、删除文件

逐项列出文件及用途。

## 3. 接口和环境变量

列出新增接口、请求响应和变量。

## 4. 并发、缓存和重试策略

说明具体数值和默认值。

## 5. 安全检查

至少包括：

```text
SSRF
用户隔离
URL 权威来源
日志去敏
错误响应
资源写入条件
```

## 6. 测试结果

列出：

```text
单元测试
类型检查
构建
基准脚本
人工验收
```

## 7. 优化前后数据

必须报告：

```text
总耗时
P50
P90
P95
成功率
真实外部请求数
缓存命中率
同 Origin 合并次数
最大 active
最大 queued
错误码分布
```

## 8. 未达到的指标

如实说明原因，不得隐藏。

## 9. 当前风险

说明剩余风险和下一阶段建议。

## 10. 授权边界

没有用户明确授权时：

```text
不提交
不推送
不部署
不连接线上数据库
```

---

# 十、推荐执行指令

可以将下面内容连同本文档交给开发 AI：

```text
请严格按《轻笺批量导入书签图标优化计划》分阶段执行。

当前只执行指定阶段，不得提前实现后续阶段，不得顺带重构无关代码。

开始前先读取两个仓库的项目规范和相关实现。若文档计划与真实代码不一致，以真实代码和现有规范为准，并在修改前说明差异。

每阶段必须先补测试，再修改实现，完成后运行相关测试和基准。

不得为了提升成功率而返回假图、放宽 SSRF、防止占位图校验或把失败计为成功。

未经明确授权，不提交、不推送、不部署、不操作线上数据库。
```
