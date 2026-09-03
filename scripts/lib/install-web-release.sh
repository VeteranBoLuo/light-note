#!/usr/bin/env bash
# 在目标机安装已上传的 Web 产物。参数:远端根目录、版本时间戳、压缩包路径。
set -euo pipefail
REMOTE_ROOT="${1:?缺少远端根目录}"
RELEASE_TS="${2:?缺少版本时间戳}"
ARCHIVE_PATH="${3:?缺少产物压缩包路径}"
case "$RELEASE_TS" in
  *[!0-9]*) echo "版本时间戳只能包含数字: $RELEASE_TS" >&2; exit 1 ;;
esac
STAGE_PATH="$REMOTE_ROOT/dist_stage_$RELEASE_TS"

cleanup_stage() {
  rm -f "$ARCHIVE_PATH"
  if [ -n "${STAGE_PATH:-}" ] && [ -d "$STAGE_PATH" ]; then
    rm -rf "$STAGE_PATH"
  fi
}
trap cleanup_stage EXIT

cd "$REMOTE_ROOT"
if [ -e "$STAGE_PATH" ]; then
  echo "暂存目录已存在,拒绝覆盖: $STAGE_PATH" >&2
  exit 1
fi
mkdir "$STAGE_PATH"
tar xzf "$ARCHIVE_PATH" -C "$STAGE_PATH" --strip-components=1
[ -f "$STAGE_PATH/index.html" ] || { echo "新 dist 缺少 index.html" >&2; exit 1; }
[ -f "$STAGE_PATH/.lightnote-release-assets" ] || { echo "新 dist 缺少静态资源清单" >&2; exit 1; }

# 保留“上一版自身”的哈希资源,让发布前已打开的页面仍能完成懒加载。
# 清单只记录每版自己的 assets,因此线上始终最多是当前版 + 上一版,不会代际累积。
if [ -d dist/assets ]; then
  if [ -f dist/.lightnote-release-assets ]; then
    while IFS= read -r asset_path; do
      case "$asset_path" in
        assets/*)
          if [[ "$asset_path" != *".."* ]] && [ -f "dist/$asset_path" ] && [ ! -e "$STAGE_PATH/$asset_path" ]; then
            mkdir -p "$(dirname "$STAGE_PATH/$asset_path")"
            cp -p "dist/$asset_path" "$STAGE_PATH/$asset_path"
          fi
          ;;
      esac
    done < dist/.lightnote-release-assets
  else
    # 首次启用发布清单时兼容当前线上版本；下一次发布即自动回到单代继承。
    mkdir -p "$STAGE_PATH/assets"
    cp -a dist/assets/. "$STAGE_PATH/assets/"
  fi
fi

if [ -d dist ]; then
  mv dist "dist_bak_$RELEASE_TS"
fi
mv "$STAGE_PATH" dist
STAGE_PATH=""

{ ls -1d dist_bak_* 2>/dev/null || true; } | sort -r | tail -n +2 | while IFS= read -r stale_backup; do
  case "$stale_backup" in
    dist_bak_*) rm -rf "$stale_backup" ;;
  esac
done
