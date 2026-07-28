#!/usr/bin/env bash
set -euo pipefail

android_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
keychain_account="light-note-android-release"
keychain_service="Light Note Android Release Signing"

if ! release_password="$(
  /usr/bin/security find-generic-password \
    -a "$keychain_account" \
    -s "$keychain_service" \
    -w
)"; then
  echo "未在 macOS 登录钥匙串中找到轻笺 Android Release 签名密码。" >&2
  exit 1
fi

cd "$android_root"
LIGHT_NOTE_ANDROID_STORE_PASSWORD="$release_password" \
LIGHT_NOTE_ANDROID_KEY_PASSWORD="$release_password" \
  ./gradlew "$@"
