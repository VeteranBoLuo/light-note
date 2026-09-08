# 图片预览回滚

先关闭 `IMAGE_PREVIEW_CLEANUP_ENABLED` 和 `IMAGE_PREVIEW_GENERATION_ENABLED`，停止图片任务；分别关闭 `IMAGE_PREVIEW_NOTES_ENABLED`、`IMAGE_PREVIEW_CLOUD_ENABLED` 可令卡片仅显示占位。不得回退到卡片加载原图。

保留 `image_assets`、`image_asset_refs`、产物表及对象，避免丢失引用和未完成清理的位置。此迁移为加法迁移，不执行 DROP TABLE 或批量删除 OBS。旧版 Worker 的清理器不认识 `image_asset`，禁止直接恢复旧版 Worker；必须同时保留忽略该来源的兼容修改。

回填工具默认只读预检；`--apply --checkpoint=/受保护目录/状态.json` 执行，可从同一检查点恢复。上线前在明确授权的环境执行；远程写入还需显式 `--authorized-remote` 并满足数据库安全门禁。完成全部阶段并核对引用后才允许启用清理。存在不同资产共享物理位置时保持未核对状态，不自动删除。
