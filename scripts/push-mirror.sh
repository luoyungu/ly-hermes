#!/usr/bin/env bash
# 显式推送到 GitHub，再推 Gitee（与 origin 双 pushurl 效果相同，供需要时使用）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

branch="${1:-$(git branch --show-current)}"
remote="${2:-origin}"

git push "$remote" "$branch"
if git remote get-url gitee &>/dev/null; then
  git push gitee "$branch"
fi
