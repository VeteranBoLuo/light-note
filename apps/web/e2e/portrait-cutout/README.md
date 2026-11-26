# 本地抠图预览

前端开发服务入口为 `/e2e/portrait-cutout/`。这是供本机试用的交互原型，正式工坊入口仍由应用工具注册表维护。

LaMa 使用工坊图片修复的运行时和同源模型。点选需要把原型的 MediaPipe Vision 运行时和模型放在 `local-assets/engine/`，其中包括 `vision_bundle.mjs`、`magic.tflite` 和 `wasm/`。示例照片和对照图从 `local-assets/` 加载，来源见 `samples/sources.json`。这些文件由本机预览提供，属于 Git 忽略范围。
