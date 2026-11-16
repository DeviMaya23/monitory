#!/usr/bin/env bash
# Remove the stage worktrees of every task that is merged. Run it from anywhere in the repo.
#
#   bash scripts/clean-worktrees.sh [--yes]
#
# Without --yes it only lists what it would remove (a dry run). With --yes it removes them.
#
# A task counts as merged the way scripts/status.sh counts it: its plan and its report are
# both on origin/main. (A branch check such as `git branch --merged` would miss squash merges.)
# Removal is done by `scripts/stage.sh clean TASK=<slug>`, so a worktree with uncommitted
# changes is kept and named. Worktrees of tasks that are not merged are never touched, and
# neither is your main checkout. Local branches are kept: this script never deletes one.
#
# It looks only in the directory stage.sh uses: <repo>-wt beside the repo, or STAGE_WORKTREES.
set -euo pipefail

yes=0
for arg in "$@"; do
  case "$arg" in
    --yes) yes=1 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unrecognised argument: $arg" >&2; exit 2 ;;
  esac
done

root="$(git rev-parse --show-toplevel)"
cd "$root"
wt_root="${STAGE_WORKTREES:-$(dirname "$root")/$(basename "$root")-wt}"

if [ ! -d "$wt_root" ]; then
  echo "no worktree directory at $wt_root: nothing to clean"
  exit 0
fi

git fetch -q origin main
has() { git cat-file -e "origin/main:$1" 2>/dev/null; }

# Task slugs that have a worktree here: <task>-builder, -verify-1, -fix, -verify-2.
tasks="$(find "$wt_root" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; \
  | sed -nE 's/^(.+)-(builder|verify-1|fix|verify-2)$/\1/p' | sort -u)"

if [ -z "$tasks" ]; then
  echo "no stage worktrees in $wt_root"
  exit 0
fi

merged=()
kept=()
for task in $tasks; do
  if has "docs/tasks/$task.plan.md" && has "docs/tasks/$task.report.md"; then
    merged+=("$task")
  else
    kept+=("$task")
  fi
done

if [ "${#kept[@]}" -gt 0 ]; then
  echo "not merged, left alone:"
  printf '  %s\n' "${kept[@]}"
fi

if [ "${#merged[@]}" -eq 0 ]; then
  echo "no merged tasks have worktrees: nothing to clean"
  exit 0
fi

if [ "$yes" = 0 ]; then
  echo "merged, would remove:"
  for task in "${merged[@]}"; do
    for path in "$wt_root/$task"-{builder,verify-1,fix,verify-2}; do
      [ -d "$path" ] && echo "  $path"
    done
  done
  echo
  echo "dry run: run again with --yes to remove them"
  exit 0
fi

status=0
for task in "${merged[@]}"; do
  bash "$root/scripts/stage.sh" clean "TASK=$task" || status=1
done
exit "$status"
