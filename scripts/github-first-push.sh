#!/usr/bin/env bash
# 首次推送到 GitHub（需本机登录一次，之后 git push 会自动镜像 Gitee）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh &>/dev/null; then
  echo "请先安装 GitHub CLI: brew install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "请在浏览器中完成 GitHub 登录…"
  gh auth login --hostname github.com --git-protocol https --web
fi

gh auth setup-git
branch="$(git branch --show-current)"
git push -u origin "$branch"
echo ""
echo "完成。之后执行 git push 会同时推送到 GitHub 和 Gitee。"
