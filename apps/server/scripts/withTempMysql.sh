#!/usr/bin/env bash
# 托管一次性 MySQL 8 测试实例：在 /tmp 初始化、只监听 Unix Socket，导出测试 Socket 变量后执行命令。
# 收尾以 PID 确认 mysqld 退出为准（socket 消失不算），进程未退出时保留目录并失败，避免已删除日志被持续写满磁盘。
# 用法：bash scripts/withTempMysql.sh [命令 参数...]，默认执行 node scripts/runMysqlTests.js。
# 可选环境变量：MYSQL_BIN_DIR 指定 mysqld/mysqladmin 所在目录；TEMP_MYSQL_TIMEOUT_SECONDS 覆盖整体上限（默认 600 秒）。
set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
TIMEOUT_SECONDS=${TEMP_MYSQL_TIMEOUT_SECONDS:-600}
LOG_LIMIT_BYTES=$((100 * 1024 * 1024))
STOP_TIMEOUT_SECONDS=60
MAIN_PID=$$

BASE=''
REAL_BASE=''
SOCK=''
ERR=''
INIT_PID=''
SERVER_PID=''
CMD_PID=''
WATCH_PID=''
SERVER_READY=0
ABORT_REASON=''
FORCED_KILL=0
SHOW_LOG=0

log() { printf '[temp-mysql] %s\n' "$*" >&2; }

file_size() {
  local size
  size=$( (wc -c <"$1") 2>/dev/null | tr -d ' ')
  echo "${size:-0}"
}

# 参数错误等早期失败只会写到 stdout.log，因此两份日志都看。
print_log_tail() {
  local file
  for file in "$ERR" "$BASE/stdout.log"; do
    [ -s "$file" ] || continue
    log "${file##*/} 末尾："
    # 限制字节数，避免失控日志中的超长行刷屏。
    tail -c 4000 "$file" | tail -n 20 | sed 's/^/[temp-mysql]   /' >&2
  done
}

# 只把本脚本启动且未成为僵尸的子进程视为仍在运行；PID 被回收复用后不会误判或误杀其他进程。
mysqld_alive() {
  local pid=$1 info
  kill -0 "$pid" 2>/dev/null || return 1
  info=$(ps -o ppid=,stat= -p "$pid" 2>/dev/null)
  [ -n "$info" ] || return 0 # 读不到进程信息时保守视为仍在运行
  set -- $info
  [ "$1" = "$MAIN_PID" ] || return 1
  case "$2" in Z*) return 1 ;; esac
  return 0
}

# 有界执行可能卡住的客户端命令（例如对已冻结的 mysqld 执行 mysqladmin）。
run_bounded() {
  local limit=$1 pid start=$SECONDS
  shift
  "$@" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ $((SECONDS - start)) -ge "$limit" ]; then
      kill -KILL "$pid" 2>/dev/null
      return 124
    fi
    sleep 0.2
  done
  wait "$pid"
}

# 停止一个本脚本启动的 mysqld，只有确认 PID 已退出才返回 0。
stop_mysqld() {
  local pid=$1 via_admin=$2 deadline
  [ -n "$pid" ] && mysqld_alive "$pid" || return 0
  deadline=$((SECONDS + STOP_TIMEOUT_SECONDS))
  if [ "$via_admin" = 1 ] && [ -S "$SOCK" ] &&
    run_bounded 15 "$MYSQLADMIN" --no-defaults --connect-timeout=5 -uroot -S "$SOCK" shutdown >/dev/null 2>&1; then
    log "已通过 mysqladmin 请求 PID $pid 关闭"
  else
    log "向 PID $pid 发送 SIGTERM"
    kill -TERM "$pid" 2>/dev/null
  fi
  while mysqld_alive "$pid" && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.5; done
  mysqld_alive "$pid" || return 0

  log "PID $pid ${STOP_TIMEOUT_SECONDS} 秒内未退出，发送 SIGKILL"
  FORCED_KILL=1
  kill -KILL "$pid" 2>/dev/null
  deadline=$((SECONDS + 10))
  while mysqld_alive "$pid" && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.5; done
  ! mysqld_alive "$pid"
}

tree_pids() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do tree_pids "$child"; done
  echo "$1"
}

stop_command() {
  local pids pid deadline=$((SECONDS + 10))
  pids=$(tree_pids "$CMD_PID")
  log "终止测试命令进程树：$(echo $pids)"
  kill -TERM $pids 2>/dev/null
  while kill -0 "$CMD_PID" 2>/dev/null && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.5; done
  for pid in $pids; do kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null; done
}

verify_no_leftovers() {
  local ok=0 pid held
  for pid in $INIT_PID $SERVER_PID; do
    if pgrep -x mysqld 2>/dev/null | grep -qx "$pid"; then
      log "自检失败：pgrep -x mysqld 仍包含本次 PID $pid"
      ok=1
    fi
  done
  if command -v lsof >/dev/null 2>&1; then
    held=$(lsof -nP +L1 2>/dev/null | grep -F -e "$REAL_BASE/" -e "$BASE/")
    if [ -n "$held" ]; then
      log "自检失败：仍有进程占用本次目录下已删除的文件"
      printf '%s\n' "$held" | head -n 20 >&2
      ok=1
    fi
  else
    log "未找到 lsof，跳过已删除文件自检"
  fi
  return $ok
}

cleanup() {
  local status=$? failed=0
  trap - EXIT
  trap '' INT TERM HUP # 清理期间不响应二次中断，避免停在“进程未退出却已删目录”的中间态
  [ -n "$WATCH_PID" ] && kill "$WATCH_PID" 2>/dev/null
  [ -n "$ABORT_REASON" ] && log "中止：$ABORT_REASON" && SHOW_LOG=1
  [ -n "$CMD_PID" ] && kill -0 "$CMD_PID" 2>/dev/null && stop_command
  if [ "$SERVER_READY" = 1 ] && ! mysqld_alive "$SERVER_PID"; then
    log "mysqld PID $SERVER_PID 在收尾前已退出"
    SHOW_LOG=1
  fi

  stop_mysqld "$INIT_PID" 0 || failed=1
  stop_mysqld "$SERVER_PID" 1 || failed=1
  [ -n "$BASE" ] || exit "$status"
  [ "$failed" -ne 0 ] || [ "$FORCED_KILL" -ne 0 ] && SHOW_LOG=1
  [ "$SHOW_LOG" = 1 ] && print_log_tail

  if [ "$failed" -ne 0 ]; then
    log "mysqld 仍在运行，已保留 $BASE 供排查；确认 PID 退出前不得删除该目录"
    [ "$status" -ne 0 ] || status=1
  else
    [ "$FORCED_KILL" -ne 0 ] && log "警告：mysqld 未能正常关闭，已强制结束"
    rm -rf "$BASE"
  fi

  if verify_no_leftovers; then
    [ "$failed" -eq 0 ] && log "已确认 mysqld 退出并删除 $BASE；无残留进程或被占用的已删除文件"
  else
    [ "$status" -ne 0 ] || status=1
  fi
  exit "$status"
}

on_signal() {
  if [ -n "$BASE" ] && [ -s "$BASE/abort-reason" ]; then
    ABORT_REASON=$(cat "$BASE/abort-reason")
    exit 124
  fi
  ABORT_REASON="收到 SIG$1"
  exit "$2"
}

# 整体超时与错误日志上限由后台监视发起，交给主进程的 TERM trap 统一清理。
watchdog() {
  local deadline=$((SECONDS + TIMEOUT_SECONDS)) size reason
  trap - EXIT INT TERM HUP
  while kill -0 "$MAIN_PID" 2>/dev/null; do
    reason=''
    size=$(file_size "$ERR")
    if [ "$size" -gt "$LOG_LIMIT_BYTES" ]; then
      reason="错误日志超过 100MB（$size 字节）"
    elif [ "$SECONDS" -ge "$deadline" ]; then
      reason="整体运行超过 ${TIMEOUT_SECONDS} 秒"
    fi
    if [ -n "$reason" ]; then
      echo "$reason" >"$BASE/abort-reason"
      kill -TERM "$MAIN_PID" 2>/dev/null
      return
    fi
    sleep 1
  done
}

if [ -n "${MYSQL_BIN_DIR:-}" ]; then
  MYSQLD="$MYSQL_BIN_DIR/mysqld"
  MYSQLADMIN="$MYSQL_BIN_DIR/mysqladmin"
else
  MYSQLD=$(command -v mysqld)
  MYSQLADMIN=$(command -v mysqladmin)
fi
if [ ! -x "$MYSQLD" ] || [ ! -x "$MYSQLADMIN" ]; then
  log "找不到 mysqld/mysqladmin；macOS 可执行 brew install mysql@8.4，或设置 MYSQL_BIN_DIR"
  exit 1
fi
case "$TIMEOUT_SECONDS" in '' | *[!0-9]*)
  log "TEMP_MYSQL_TIMEOUT_SECONDS 必须是正整数"
  exit 1
  ;;
esac

# Socket 变量以 runMysqlTests.js 的套件清单为唯一来源，单独跑某个套件时也能直接命中。
SOCKET_VARS=$(grep -oE "'[A-Z][A-Z0-9_]*_SOCKET'" "$SCRIPT_DIR/runMysqlTests.js" | tr -d "'" | sort -u)
case " $(echo $SOCKET_VARS) " in *' LIGHTNOTE_TEST_MYSQL_SOCKET '*) ;; *)
  log "无法从 runMysqlTests.js 解析测试 Socket 变量"
  exit 1
  ;;
esac
[ $# -gt 0 ] || set -- node "$SCRIPT_DIR/runMysqlTests.js"

trap cleanup EXIT
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM
trap 'on_signal HUP 129' HUP

BASE=$(mktemp -d /tmp/light-note-mysql.XXXXXX) || {
  BASE=''
  log "无法在 /tmp 创建临时目录"
  exit 1
}
REAL_BASE=$(cd "$BASE" && pwd -P)
REAL_BASE=${REAL_BASE:-$BASE}
SOCK="$BASE/mysqld.sock"
ERR="$BASE/error.log"
# macOS 的 sun_path 只有 104 字节（含结尾 NUL）。
if [ "${#SOCK}" -gt 103 ]; then
  log "Socket 路径超过 103 个字符：$SOCK"
  exit 1
fi
mkdir "$BASE/tmp"
watchdog &
WATCH_PID=$!

# mysqld 均放到后台再 wait：前台子进程运行时 bash 会推迟 trap，信号和监视将无法及时生效。
"$MYSQLD" --no-defaults --initialize-insecure --datadir="$BASE/data" --tmpdir="$BASE/tmp" \
  --log-error="$ERR" >>"$BASE/stdout.log" 2>&1 &
INIT_PID=$!
wait "$INIT_PID" || {
  SHOW_LOG=1
  log "mysqld 初始化失败"
  exit 1
}

"$MYSQLD" --no-defaults --datadir="$BASE/data" --tmpdir="$BASE/tmp" --socket="$SOCK" \
  --pid-file="$BASE/mysqld.pid" --log-error="$ERR" --skip-networking --mysqlx=OFF --skip-log-bin \
  >>"$BASE/stdout.log" 2>&1 &
SERVER_PID=$!

ready_deadline=$((SECONDS + 60))
until [ -S "$SOCK" ] &&
  run_bounded 5 "$MYSQLADMIN" --no-defaults --connect-timeout=2 -uroot -S "$SOCK" ping >/dev/null 2>&1; do
  if ! mysqld_alive "$SERVER_PID" || [ "$SECONDS" -ge "$ready_deadline" ]; then
    SHOW_LOG=1
    log "mysqld 启动失败或 60 秒内未就绪"
    exit 1
  fi
  sleep 0.5
done
if [ "$(cat "$BASE/mysqld.pid" 2>/dev/null)" != "$SERVER_PID" ]; then
  log "pid 文件与启动进程 PID $SERVER_PID 不一致，停止以免误判退出"
  exit 1
fi
SERVER_READY=1
log "mysqld PID $SERVER_PID 已就绪：$SOCK"

for name in $SOCKET_VARS; do export "$name=$SOCK"; done
"$@" &
CMD_PID=$!
wait "$CMD_PID"
cmd_status=$?
CMD_PID=''
exit "$cmd_status"
