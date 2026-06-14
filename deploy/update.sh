#!/usr/bin/env bash
# Update & restart automation di VPS dengan satu perintah:
#   ~/automation/deploy/update.sh
# Langkah: git pull -> bun install -> migrasi DB -> restart service.
set -euo pipefail

cd "$(dirname "$0")/.."   # pindah ke root repo (folder deploy/ ada di dalamnya)
BUN="$HOME/.bun/bin/bun"

echo "==> git pull"
git pull --ff-only

echo "==> bun install"
"$BUN" install

echo "==> migrasi DB"
"$BUN" run src/db/migrate.ts

echo "==> restart service"
sudo systemctl restart automation
sleep 3

echo "==> status"
systemctl is-active automation && echo "OK: automation active"
journalctl -u automation -n 8 --no-pager
