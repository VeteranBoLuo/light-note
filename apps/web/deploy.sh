#!/usr/bin/env bash
# 保留旧入口给历史使用方式；实际发布统一交给仓库根脚本，避免两套切换协议漂移。
set -euo pipefail
WEB_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
exec bash "$WEB_SCRIPT_DIR/../../scripts/deploy-web.sh"
