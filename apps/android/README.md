# 轻笺 Android

轻笺 Android 是加载 `https://boluo66.top/app` 的轻量原生壳，业务界面继续由轻笺 Web 端统一维护。

## 页面策略

- 首次启动先显示原生隐私告知页；用户作出选择前不创建业务 WebView，也不加载在线服务。
- 用户可离线查看随 APK 打包的隐私政策与用户协议；不同意时直接退出，同意后才进入业务页面。
- 已同意的政策版本和时间只保存在 App 本地；政策版本变化后会重新提示。
- 进入业务页面后仍可在“设置 → 隐私与协议”打开同一份 APK 内置文档，并在原生隐私政策全文页底部撤回同意；浏览器环境则打开网站公开文档。
- APK 内隐藏 PWA“安装轻笺”入口且不注册 PWA Service Worker；手机浏览器继续保留 PWA 安装能力。
- `boluo66.top` 及其子域名在主 WebView 中打开。
- GitHub 登录在主 WebView 中完成，保证 OAuth 回调与轻笺会话连续。
- 其他 HTTP(S) 链接在带“返回 / 关闭”工具栏的应用内浏览页打开，不跳出轻笺。
- 电话、邮件和地图协议交给对应系统应用；其他协议默认拒绝。
- `intent://` 不直接启动目标组件，只允许回退到经过校验的 HTTP(S) 页面。
- WebView 显式启用安全浏览，命中风险页面时默认返回安全页。

## 隐私与协议文档

网站和 APK 共用以下源文件，避免两套文案发生偏差：

```text
apps/web/public/legal/privacy-policy.html
apps/web/public/legal/user-agreement.html
apps/web/public/legal/legal.css
```

Android 构建前会通过 `syncLegalDocuments` 自动复制到生成目录并打入 APK，不要直接修改
`app/build/generated/legal-assets`。首次启动页的同意版本定义在
`LegalDocuments.PRIVACY_POLICY_VERSION`；隐私政策发生需要重新征得同意的变化时，必须同步更新
页面版本和该常量。

当前正式政策版本为 `2026-07-28`。定稿依据、权限、依赖和第三方服务审计见
`docs/android/p4-compliance-audit.md`；处理目的、范围或第三方服务发生实质变化时，应先更新政策版本并重新构建。

## 本地构建

首次准备好 JDK 17 和 Android SDK 35 后：

```bash
cd apps/android
./gradlew assembleDebug
```

如需让 Debug APK 加载同一局域网中的本地 Web 开发服务：

```bash
./gradlew assembleDebug -PlightNoteHomeUrl=http://192.168.1.10:5175
```

`lightNoteHomeUrl` 只覆盖 Debug 包；Release 始终加载 `https://boluo66.top/app`。

Debug APK 位于：

```text
app/build/outputs/apk/debug/app-debug.apk
```

### 真机实时联调（无需反复部署或重装 APK）

移动浏览器预览和 App 最终都应连接同一个 Vite 开发服务。只要原生壳代码和开发服务地址
没有变化，首次安装 Debug APK 后，后续修改 Vue / TypeScript / Less 会通过 Vite HMR
直接更新到已安装的 App，不需要部署服务器，也不需要重新构建 APK。

1. 让 Mac 与 Android 手机或平板连接同一局域网，查询 Mac 的局域网地址：

   ```bash
   ipconfig getifaddr en0
   # 有线网卡或其他网络环境可在「系统设置 → 网络」查看当前 IPv4 地址
   ```

2. 在仓库根目录启动面向真机的开发服务：

   ```bash
   pnpm dev:web:device
   ```

   该命令固定监听 `0.0.0.0:5175`。如果同时联调本机后端，可改为
   `VITE_ENV=local pnpm dev:web:device`，并先启动 `pnpm dev:server`。

3. 只在第一次或开发服务地址变化时构建并安装 Debug APK，把示例 IP 换成上一步地址：

   ```bash
   cd apps/android
   ./gradlew assembleDebug -PlightNoteHomeUrl=http://192.168.1.10:5175
   "$ANDROID_HOME/platform-tools/adb" install -r app/build/outputs/apk/debug/app-debug.apk
   ```

4. 平板浏览器打开同一个 `http://192.168.1.10:5175/app`，与已安装的 Debug App
   并排验收。两端会使用同一构建、同一 CSS 移动渲染基线和同一断点；保存前端文件后
   两端都会收到 HMR。电脑浏览器可用设备模拟器，或在 URL 加
   `?renderProfile=mobile` 强制启用同一移动渲染基线。

若平板无法访问，先确认 Mac 防火墙允许 Node/Vite 入站、两台设备没有连访客网络，且路由器
未开启 AP 隔离。字体字形的最终光栅化仍由 Android 系统字体负责，因此电脑模拟只用于快速
开发，发布前至少在真机浏览器与 Debug App 各完成一轮浅色、深色和横竖屏验收。

Debug 的应用展示名同样是“轻笺”，内部包名使用 `top.boluo66.lightnote.preview`，与未来正式包
`top.boluo66.lightnote` 隔离。正式发布前必须创建并安全备份长期签名密钥，不得把密钥或密码提交到仓库。

轻笺支持 Android 8.0（API 26）及以上系统。网页运行环境还要求 Chromium / Android
System WebView 87 或更高版本；这是当前 Vite 生产构建的最低浏览器基线。系统版本满足但
WebView 过旧时，App 会显示更新提示而不是停在空白页。华为等无法识别 Chromium 主版本的
厂商兼容层不会被版本门禁误拦截，仍由实际页面加载结果决定。

## 正式身份

- 应用名：`轻笺`
- 包名：`top.boluo66.lightnote`
- 首发版本：`1.0.0`（`versionCode 10000`）
- Release 首页：`https://boluo66.top/app`
- Release 签名别名：建议固定为 `light-note-release`

上述名称、包名和 Release 签名用于官网直发、Android 开发者身份登记与 App
备案，首次正式发布后不得随意更换。

## 正式签名准备

正式密钥必须由负责人长期保管。当前 macOS 开发机把随机签名密码保存在登录钥匙串的
`Light Note Android Release Signing` 条目中，Gradle 文件和仓库均不保存密码。

如需在新机器重新生成一套尚未公开发布的密钥，可执行不包含明文密码参数的交互命令：

```bash
keytool -genkeypair \
  -keystore "/absolute/secure/path/light-note-release.jks" \
  -storetype JKS \
  -alias light-note-release \
  -keyalg RSA \
  -keysize 4096 \
  -validity 36500
```

生成后：

1. 将密钥库保存到仓库外的受控目录，并制作两份可访问的加密备份。
2. 复制 `keystore.properties.example` 为 `keystore.properties`，只填写绝对路径和
   Alias，并将文件权限限制为当前用户可读写。
3. 从第二份备份恢复到隔离目录，重新配置 `storeFile` 并完成一次 Release 构建，确认文件和密码均可恢复。
4. 保存密钥库文件 SHA-256、证书 Subject、有效期和 MD5 / SHA-1 / SHA-256
   指纹；只可公开证书，不得公开私钥或密码。

`keystore.properties`、`.jks` 和 `.keystore` 均已被 Git 忽略。缺少配置、字段不完整或
密钥库路径无效时，Release 构建会明确失败，不会回退到 Debug 签名。

正式签名配置完成后执行：

```bash
./scripts/release-build.sh clean lintRelease assembleRelease
./scripts/release-build.sh signingReport
```

`release-build.sh` 只在进程内读取钥匙串密码，不会把密码写入命令、日志或项目文件。其他
操作系统和 CI 可使用 `LIGHT_NOTE_ANDROID_STORE_FILE`、
`LIGHT_NOTE_ANDROID_STORE_PASSWORD`、`LIGHT_NOTE_ANDROID_KEY_ALIAS` 和
`LIGHT_NOTE_ANDROID_KEY_PASSWORD` 环境变量。

正式 APK 位于：

```text
app/build/outputs/apk/release/app-release.apk
```

## 免费真机安装验证

在安卓手机的“开发者选项”中开启 USB 调试，用数据线连接这台 Mac，并在手机上确认
“允许 USB 调试”。然后执行：

```bash
adb devices -l
adb install -r app/build/outputs/apk/release/app-release.apk
```

首次验收至少覆盖：

1. 首次启动同意前不加载在线业务；隐私政策、用户协议可离线完整滚动和相互切换。
2. “暂不同意并退出”会关闭 App；同意后进入业务页，重启时能正确识别当前政策版本。
3. 冷启动、返回键、横竖屏切换和刘海屏 / 底部手势区域。
4. 登录、退出、GitHub OAuth 回调和登录态保持。
5. 新建、编辑、删除和搜索笔记，上传图片与文件。
6. 外部网页、电话、邮件、地图以及被拒绝的未知协议。
7. 断网错误页、恢复网络后重试、SSL 错误阻断和文件下载。
8. 唤起软键盘后输入框不被遮挡，关闭键盘后页面尺寸恢复。
9. 在“设置 → 隐私与协议”查看两份文档，并从原生隐私政策全文页底部验证撤回同意后会回到首次启动页。
10. APK 的官网、个人中心和设置中均不出现 PWA 安装入口；同一网页在普通手机浏览器中仍可打开安装教程。

ADB 安装用于开发阶段免费验证，不需要 Android 开发者身份付费。确认功能稳定后，再制作
官网安装页、提交中国大陆 App 备案材料并决定是否办理付费的 Android 开发者完整分发身份。
