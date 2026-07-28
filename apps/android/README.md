# 轻笺 Android

轻笺 Android 是加载 `https://boluo66.top` 的轻量原生壳，业务界面继续由轻笺 Web 端统一维护。

## 页面策略

- `boluo66.top` 及其子域名在主 WebView 中打开。
- GitHub 登录在主 WebView 中完成，保证 OAuth 回调与轻笺会话连续。
- 其他 HTTP(S) 链接在带“返回 / 关闭”工具栏的应用内浏览页打开，不跳出轻笺。
- 电话、邮件、地图和其他系统协议交给对应系统应用。

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

`lightNoteHomeUrl` 只覆盖 Debug 包；Release 始终加载 `https://boluo66.top`。

Debug APK 位于：

```text
app/build/outputs/apk/debug/app-debug.apk
```

Debug 的应用展示名同样是“轻笺”，内部包名使用 `top.boluo66.lightnote.preview`，与未来正式包
`top.boluo66.lightnote` 隔离。正式发布前必须创建并安全备份长期签名密钥，不得把密钥或密码提交到仓库。
