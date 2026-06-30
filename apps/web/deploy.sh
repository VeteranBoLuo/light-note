#!/bin/bash
set -e

HOST="root@139.9.83.16"
SSH_KEY="$HOME/.ssh/hermes_server"
DEPLOY_DIR="/www/wwwroot"
TIMESTAMP=$(date +%Y%m%d%H%M%S)

echo "🏗️  Building..."
npm run build

echo "📦  Packing..."
tar czf /tmp/light-note-dist.tar.gz dist

echo "🚀  Deploying to $HOST..."
cat /tmp/light-note-dist.tar.gz | ssh -i "$SSH_KEY" "$HOST" "cd $DEPLOY_DIR && mv dist dist_bak_$TIMESTAMP && tar xzf -"

rm /tmp/light-note-dist.tar.gz

echo "✅  Done! https://boluo66.top"
