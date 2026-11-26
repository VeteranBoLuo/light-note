#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

fail_release() {
  printf '生产发布检查失败：%s\n' "$1" >&2
  exit 1
}

worktree_status="$(git -C "$REPO_DIR" status --porcelain --untracked-files=normal)" ||
  fail_release '无法核对工作树状态。'
[[ -z "$worktree_status" ]] || fail_release '请使用干净的 main 工作树。'

head_sha="$(git -C "$REPO_DIR" rev-parse --verify HEAD^{commit})" ||
  fail_release '无法读取待发布提交。'
[[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || fail_release '待发布提交无效。'
[[ -z "${1:-}" || "$head_sha" == "$1" ]] ||
  fail_release '待发布提交在准备期间发生变化。'

branch="$(git -C "$REPO_DIR" symbolic-ref --quiet --short HEAD || true)"
if [[ "$branch" != main ]]; then
  [[ -z "$branch" && "${GITHUB_ACTIONS:-}" == true &&
    "${GITHUB_REF:-}" == refs/heads/main && "${GITHUB_SHA:-}" == "$head_sha" ]] ||
    fail_release '只能从 main 或 GitHub Actions 对应的 main 提交发布。'
fi

origin_url="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null)" ||
  fail_release '无法确定 GitHub 上的 origin 仓库。'
if [[ "$origin_url" =~ ^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)$ ]]; then
  repository="${BASH_REMATCH[2]%.git}"
else
  fail_release 'origin 必须指向 GitHub 仓库。'
fi
[[ "$(printf '%s' "$repository" | tr '[:upper:]' '[:lower:]')" == 'veteranboluo/light-note' ]] ||
  fail_release 'origin 必须指向轻笺的生产源码仓库。'
command -v gh >/dev/null || fail_release '请先安装并登录 GitHub CLI，以便核对远程分支和 CI。'

remote_sha="$(gh api --hostname github.com "repos/$repository/git/ref/heads/main" \
  --jq 'select(.ref == "refs/heads/main" and .object.type == "commit") | .object.sha' 2>/dev/null)" ||
  fail_release '无法核验远程 main，请检查 GitHub CLI 登录和读取权限。'
[[ "$remote_sha" == "$head_sha" ]] || fail_release '当前提交与远程 main 不一致。'

checked_run="$(gh api --hostname github.com --method GET "repos/$repository/actions/workflows/ci.yml/runs" \
  -f branch=main -f event=push -f head_sha="$head_sha" -F per_page=20 \
  --jq '[.workflow_runs[] | select(.head_branch == "main" and .event == "push")] | max_by(.run_number) | [.head_sha,.status,.conclusion] | @tsv' 2>/dev/null)" ||
  fail_release '无法读取 CI 结果，请检查 GitHub Actions 读取权限。'
[[ "$checked_run" == "$head_sha"$'\tcompleted\tsuccess' ]] ||
  fail_release "提交 $head_sha 的 main CI 尚未成功。"

printf '%s\n' "$head_sha"
