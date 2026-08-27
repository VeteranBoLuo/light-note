# Chrome Web Store 素材

- `screenshots/localized/`：4 张 1280×800 当地语言截图，依次展示入口、书签、笔记和文件；中文商店资料使用中文深色真实界面。
- `screenshots/global/`：4 张 1280×800 全球通用截图，依次展示入口、书签、笔记和文件；使用英文浅色真实界面，避免把中文写死在所有语言的商店页。
- `promo-small-440x280.png`：商店小型宣传图。
- `promo-marquee-1400x560.png`：商店顶部宣传图；当前为可选素材，但随版本一起维护。
- `extension/icons/icon-128.png`：商店和安装页图标；96×96 主体居中放入 128×128 透明画布。

素材与扩展版本一起复核；界面发生明显变化时重新生成，禁止长期复用过时截图。

截图原始采集图准备完成后，可执行 `pnpm --filter web generate:extension-store-assets <采集图目录>` 一次生成两组截图和两张宣传图。采集图目录需包含 `zh-home.png`、`zh-bookmark.png`、`zh-note.png`、`zh-file.png` 及对应的 `en-*` 文件，尺寸均为 760×800。
