# 轻笺浏览器插件

## 首版范围

首版面向 Chrome 116+ 与采用同一扩展平台的 Edge，使用 Manifest V3 原生 Side Panel。点击工具栏图标只打开入口页，用户再选择书签、笔记或文件；侧栏放在左侧还是右侧由浏览器和用户设置决定。Firefox、Safari、浏览器商店账号操作和插件相关后端自动部署不在首版交付范围内。

## 目录与构建

```text
apps/web/
├── extension/
│   ├── manifest.json
│   └── sidepanel.html
├── src/extension/
│   ├── service-worker.ts
│   ├── ExtensionApp.vue
│   ├── auth.ts / api.ts / storage.ts
│   ├── capture.ts / upload.ts
│   └── components/
├── vite.extension.config.ts
└── scripts/package-extension.mjs
```

```bash
pnpm --filter web build:extension
pnpm --filter web package:extension
```

- 解压安装目录：`apps/web/dist-extension/`
- 商店 ZIP：`apps/web/artifacts/light-note-browser-extension-<version>.zip`
- 校验文件：同名 `.sha256`
- 两个目录都是构建产物并已 Git 忽略。

本地安装：打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，指向 `apps/web/dist-extension`。Manifest 内的公开 build key 固定首版解压安装 ID 为 `nkdlhmfjnokoicodeepadkamopdblbnd`；它不是签名私钥。服务端生产配置必须把实际商店/企业分发 ID 加入 `LIGHTNOTE_EXTENSION_IDS`，多个 ID 用逗号分隔。

## 权限边界

| 权限 | 用途 | 触发时机 |
| --- | --- | --- |
| `sidePanel` | 打开浏览器原生侧栏 | 点击工具栏图标 |
| `activeTab` + `scripting` | 读取当前页 URL、标题、最多 2,000 字选中文本，或最多 5 万字可见文字 | 用户进入书签流程、主动回填网址，或在笔记中点击“带入当前网页文字”后 |
| `storage` | 保存设备 SID、主题和书签/笔记草稿 | 对应状态变化时 |
| `identity` | 打开网站/GitHub 登录中转并接收 `chromiumapp.org` 回调 | 用户主动选择网站登录 |

Manifest 没有 `tabs`、`cookies`、常驻 `content_scripts` 或 `<all_urls>`。Host permissions 只覆盖轻笺 HTTPS Origin 与当前生产桶的精确 OBS 主机名，不使用覆盖同区域其他桶的通配符。工具栏点击由 Chrome/Edge 原生 `openPanelOnActionClick` 行为打开 Side Panel，Service Worker 不读取或缓存标签页信息；只有进入书签流程、主动回填网址或点击笔记带入按钮后，页面才用无需额外 `tabs` 权限的基础 `tabs.query()` 取得当前活动标签页 ID，再凭 `activeTab + scripting` 读取顶层页面。扩展入口、未主动带入的笔记流程和文件流程不会查询或读取当前网页。浏览器保护页读取失败时，书签表单保留手工填写能力，笔记草稿保持原样。

## 登录与授权协议

### 邮箱密码

插件直接调用 `/api/user/login`，响应中的 SID 与本地随机设备 ID 存入 `chrome.storage.local`，之后通过 `X-Session-Id`、`X-Device-Id` 访问 API。密码只存在于当前表单内存，成功后立即清空，不写浏览器存储。

### 网站 / GitHub 中转

1. 插件生成随机 `state`、PKCE verifier/challenge 和稳定设备 ID 摘要。
2. `chrome.identity.launchWebAuthFlow()` 打开 `/extension/authorize`。已有网站登录态的用户直接确认授权；没有登录态时可在网站登录弹框选择邮箱、注册或 GitHub。
3. 网站调用 `/api/user/extension/authorize`。服务端只接受白名单中的 32 位扩展 ID、精确回调地址、`S256` challenge 和合法设备摘要。
4. 服务端向 Redis 写入 5 分钟有效的一次性授权记录，Redis key 只含授权码 SHA-256；回调 URL 返回明文随机 code 与原 state。
5. 插件校验 state，再向 `/api/user/extension/exchange` 提交 code、verifier、扩展 ID 和回调地址，同时携带原设备 ID。
6. 服务端先用 Redis `GETDEL` 原子消费 code，再校验 PKCE、扩展 ID、回调和设备摘要，成功后签发独立的记住登录会话。

任何一次交换尝试都会消费 code；错误 verifier 或设备也不能重放。`LIGHTNOTE_EXTENSION_IDS` 未配置时授权失败关闭。扩展 ID、公开 build key、state 和 challenge 不是秘密；SID、密码、verifier 与授权码不得记录到日志。

## 资源流程

### 书签

- 进入书签视图后才读取操作时的当前活动页，并允许编辑 URL、名称、描述。
- URL 输入框右侧提供“填入当前页”，点击时只替换网址，不覆盖用户已经修改的名称和描述；受限页失败时仍可继续手工填写。
- 页面顶部先选择“快速待整理”或“正式保存”，每种模式只有一个最终提交按钮。快速待整理只显示 URL、名称和描述，不显示或调用 AI、标签与网页快照能力；正式保存才展示 AI 建议和标签。
- “AI 智能补全”复用 `bookmark.parse_url`，只把可编辑的名称、描述和标签建议填入表单，绝不自动保存；失败只显示可重试错误，不阻断正式手工保存。
- 已有标签由服务端 AI 结果匹配并预选；建议新标签默认不勾选，只有用户勾选后才传 `relatedTagNames`。既有与新标签合计最多 4 个。
- 正式保存传入 `idempotencyKey`，书签、新标签、标签关系及可选待整理关系在事务边界内完成。重复 URL 返回已有书签的结构化 ID，成功页可直接打开。
- “快速加入待整理”不自动触发 AI，不创建标签和快照；切换模式不会清空已经填写的基本信息。

### 笔记

- Markdown 使用纯源码输入框，并提供以 `marked + DOMPurify` 实现的编辑/预览切换；富文本只显示轻量 `contenteditable` 编辑区，不显示冗余的编辑/预览标签或操作工具栏，并保留 `⌘/Ctrl+B`、`I`、`U` 三组常用格式快捷键。初始值、富文本粘贴/拖入和提交值都先在客户端清洗，服务端继续执行权威 HTML 清洗。
- 插件不打包 TinyMCE：当前需求不需要其菜单、插件或工具栏，移除后同时减小安装包，并避免在商店分发前额外处理 TinyMCE 8 的 GPLv2+ / 商业许可选择；许可口径以 [TinyMCE 官方说明](https://www.tiny.cloud/docs/tinymce/latest/license-key/) 为准。主站现有编辑器不在本轮变更范围。
- 正文非空时切换格式必须确认清空，禁止静默转换造成语义损失。标题和正文不能同时为空。
- 笔记不会在进入视图时读取网页；“带入当前网页文字”是独立的用户动作，只读取顶层页面可见文字，单次最多 5 万字，并追加而不覆盖草稿。空标题会同时使用网页标题；Markdown 追加纯文本，富文本先通过 DOM 创建安全段落并再次清洗。
- `addToInbox` 默认开启，继续复用现有 `markdown/html`、服务端 HTML 清洗、资源引用校验和幂等创建能力。
- 书签/笔记在首次请求前把“载荷 SHA-256 指纹 + 幂等键”写入草稿；响应丢失、会话过期或侧栏关闭重开后，相同载荷复用原键，载荷发生变化则换新键。

### 文件

- `BUpload` 支持多选，外层拖拽区支持拖入；单批总大小上限 200 MiB，同时最多上传 3 个文件。
- 每个文件走 prepare → OBS signed PUT → confirm。进度来自 XHR upload progress，取消使用 AbortController；失败项可单独重试，部分成功不会回滚已确认文件。
- confirm 可在文件事务内加入待整理，默认开启。PUT 或确认失败会调用 abort；服务端中止前先锁账号并确认对象尚未落库，禁止删除已确认文件。
- 当前首版只上传用户本地选择或拖入的 `File`。现有 `imgextract` 书签工具只枚举 `img[src]`，跨域抓取失败时会退化为打开原 URL，并不能安全地把任意网页资源转换为云文件；“提取网页全部文件并选择上传”需要另设受控资源枚举、类型/数量/体积限制、重定向与 SSRF 防护，且不得携带页面 Cookie 或为此加入 `<all_urls>`，不混入当前本地上传链路。

## 状态与验收矩阵

必须检查入口、三类表单、登录层和成功页的相关状态：默认、hover、focus-visible、选中、加载、空、错误、受限页、会话过期、AI 失败、上传中/取消/部分失败/完成、重复书签。用户可见状态不能只靠混色或阴影，选中/错误/成功同时使用实色描边、图标、圆点或明确文字色。

Side Panel 根节点必须显式占满视口宽高并覆盖共享 Web 的 `body` 布局，外层固定为 Header 与主内容两行，只有主内容区承担纵向滚动；入口、三类资源和成功页切换后必须回到该滚动区顶部。未登录时 Header 的会话文案与入口页主按钮都可打开登录层。笔记标题使用明确的输入表面；Markdown 与富文本编辑区只由共同外壳通过 `focus-within` 绘制连续焦点边框，子编辑器不得叠加第二圈边框。

浏览器原生固定按钮位于 Side Panel 的浏览器框架内，扩展无法修改其颜色、尺寸或旁边文案；入口顶部使用带实色描边的轻量提示引导用户点击右上角固定图标，不伪造一个无法控制浏览器固定状态的按钮。

视觉验收覆盖：

- Chrome 与 Edge；
- 320 / 400 / 600 CSS px 侧栏宽度；
- 浅色与深色；
- 入口、书签、Markdown 编辑/预览、富文本编辑、文件空队列/上传队列、登录和成功页；
- 键盘 Tab、Enter、Space、Escape 及可见焦点；
- 受保护 `chrome://` / `edge://` 页面手工填写兜底。

自动门禁至少执行：

```bash
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web package:extension
pnpm --filter server test
```

服务端发布前仍需执行只读 Schema 门禁；插件本身没有新增 Schema。后端与网站中转页先部署并配置实际扩展 ID，健康检查通过后再分发插件，否则网站登录与新增 API 会失败。提交 Chrome Web Store 或 Edge Add-ons、修改商店隐私披露、最终签名 ID 和商店上线都需要独立授权。
