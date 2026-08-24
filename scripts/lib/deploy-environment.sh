#!/usr/bin/env bash

# 环境变量中的 `~` 不会像命令行字面量那样由 Shell 自动展开。
# 第二个参数只用于测试；生产调用默认解析当前用户目录。
resolve_deploy_ssh_key() {
  local raw_key="${1:-}"
  local user_directory="${2:-}"

  if [[ "$raw_key" == "~/"* ]]; then
    if [[ -z "$user_directory" ]]; then
      user_directory="$(cd ~ && pwd -P)"
    fi
    printf '%s/%s\n' "${user_directory%/}" "${raw_key:2}"
    return
  fi

  printf '%s\n' "$raw_key"
}
