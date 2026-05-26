#!/usr/bin/env bash
# GitHub 为主远程，Gitee 为镜像：fetch/pull 走 GitHub，git push 同时推送到 GitHub + Gitee
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GITHUB="https://github.com/luoyungu/ly-hermes.git"
GITEE="https://gitee.com/YanPro/lyhermes.git"

current_origin="$(git remote get-url origin 2>/dev/null || true)"

# 若 origin 仍指向 Gitee，改名为 gitee 保留备用（可从 Gitee 单独 pull）
if [[ "$current_origin" == *"gitee.com"* ]]; then
  if git remote get-url gitee &>/dev/null; then
    echo "远程 gitee 已存在，跳过 rename"
  else
    git remote rename origin gitee
    echo "已将原 origin 重命名为 gitee"
  fi
fi

# 主远程 origin → GitHub（用于 fetch / pull）
if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$GITHUB"
else
  git remote add origin "$GITHUB"
fi

# push 时先 GitHub，再 Gitee 镜像
git remote set-url --push origin "$GITHUB"
git remote set-url --add --push origin "$GITEE"

echo ""
echo "配置完成："
echo "  git pull / git fetch  → GitHub (origin)"
echo "  git push              → GitHub + Gitee（自动镜像）"
echo "  git pull gitee master → 如需从 Gitee 拉取"
echo ""
git remote -v
