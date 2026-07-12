# 退出重登录误弹「登录已过期」修复

## 根因

退出时发的游客 `/me` 请求（7 表 JOIN 慢）在登录 B 之后才返回 → `notifyAuthExpired` 的 `lostLoginState` 看到「当前是 B(admin)」但「响应说身份是 visitor」→ 误判为登录态丢失 → 闪现「登录已过期」。

## 修复方案（三层拦截，缺一不可）

### 1. 拦截器身份指纹（request.ts）

**请求拦截器** — 每个 API 请求发出前在 config 上记录发起时的 `userId`：

```js
(config as any).__reqUserId = useUserStore().id || '';
```

**notifyAuthExpired 入口** — 响应回来时对比身份，不一致说明是陈旧响应，直接忽略：

```js
const reqUserId = response?.config?.__reqUserId;
if (reqUserId !== undefined && reqUserId !== (user.id || '')) {
  return false;
}
```

### 2. getUserInfo 陈旧响应丢弃（App.vue）

发起 `/me` 前记下当时的 `userId`，响应回来后若身份已变，整个丢弃（不 applyUserInfo、不改登录框、不刷通知）：

```js
const reqUserId = user.id || '';
// ...
if ((user.id || '') !== reqUserId) {
  return res;  // 丢弃
}
```

**为什么两层缺一不可**：
- 拦截器管提示层（挡掉 `auth-expired` 事件）
- getUserInfo 管状态层（挡掉 `applyUserInfo(游客)` 覆盖）
- 拦截器短路同时会挡掉 auth-expired 事件触发的「第二次 getUserInfo 恢复」，若无第二层 → 登录态永久丢失

### 3. auth.js 加固

`shouldMarkAuthExpired` 静默列表匹配从 `startsWith` 改为 `includes`，解除对 Nginx rewrite 剥离 `/api` 前缀的隐性依赖。附安全注释说明这是非鉴权边界（fail-safe）。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `apps/web/src/http/request.ts` | 拦截器打 `__reqUserId` + notifyAuthExpired 入口指纹短路 |
| `apps/web/src/App.vue` | getUserInfo 发起前记 reqUserId，响应后身份比对，不一致丢弃 |
| `apps/server/util/auth.js` | `startsWith` → `includes` + 安全注释 |

## 边界场景验证

| 场景 | 拦截器指纹 | getUserInfo 丢弃 | 结果 |
|---|---|---|---|
| 退出→登录，/me 晚归（本 bug） | `''≠'B'` 短路 | `''≠'B'` 丢弃 | 不弹、不覆盖 ✅ |
| 退出→登录，/me 早归 | `''=''` 放行 | `''=''` 放行 | 正常游客态 ✅ |
| 登录响应自身 | `''=''` 放行→命中登录豁免 | 不经过 | 正常登录 ✅ |
| 正常会话过期 | `'B'='B'` 放行→正常判过期 | `'B'='B'` 放行→变游客 | 正常弹过期 ✅ |
| 首屏加载 | `''=''` 放行 | `''=''` 放行 | 正常加载 ✅ |
| 重登同账号 | `''≠'A'` 短路 | `''≠'A'` 丢弃 | 正确丢弃陈旧游客响应 ✅ |

## 验证

- `pnpm run typecheck` ✅
- `node --check apps/server/util/auth.js` ✅
- 已部署（前端 deploy-web.sh + 后端 scp + pm2 restart）✅

---

## root 用户签到无 `growth_events` 记录修复

### 根因

`grantExp`（`growth.js` 第 94 行）对 `userRole === 'root'` 直接 `return`，不写签到事件到 `growth_events` 表。导致 `getGrowthDashboard` 查到的 `checkinDays` 始终为空，日历无高亮。

### 修复

`checkin` 函数内，`grantExp` 返回 `skipped: 'root'` 后手动 `INSERT IGNORE` 一条签事件（`amount=0`，不发经验）：

```js
if (userRole === 'root' && grant.skipped === 'root') {
  await conn.query(
    `INSERT IGNORE INTO growth_events (user_id, source, ref_id, day, amount, status, meta)
     VALUES (?, 'checkin', NULL, ?, 0, 'granted', ?)`,
    [userId, today, JSON.stringify({ streak })],
  );
}
```

### 涉及文件

| 文件 | 改动 |
|---|---|
| `apps/server/util/growth.js` | checkin 函数内 root 签到后补插 growth_events |

### 验证

- `node --check apps/server/util/growth.js` ✅
- 已部署（pm2 restart）✅
