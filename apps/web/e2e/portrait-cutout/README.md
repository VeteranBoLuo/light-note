# 本地抠图预览

前端开发服务入口为 `/toolbox/local-cutout`，从工坊目录进入。旧原型地址会跳到同一个编辑器。抠图和移除补全均免费，图片与结果保留在浏览器。

LaMa 使用工坊图片修复的运行时和同源模型。点选需要把原型的 MediaPipe Vision 运行时和模型放在 `local-assets/engine/`，其中包括 `vision_bundle.mjs`、`magic.tflite` 和 `wasm/`。这些模型文件由本机预览提供，属于 Git 忽略范围。
