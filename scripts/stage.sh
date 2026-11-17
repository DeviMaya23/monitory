#!/usr/bin/env bash
# Start one stage of the agent chain. Run it from `main`, in your main checkout.
#
#   bash scripts/stage.sh <stage> TASK=<slug> [NAME=value ...] [--dry-run]
#   bash scripts/stage.sh clean TASK=<slug>
#
# TASK is the task file's name without .md: TASK=save-a-url is docs/tasks/save-a-url.md.
#
# Where the session runs (WHERE=local is the default):
#   WHERE=local   a session on this machine, in its own git worktree on its own branch, so
#                 several stages can run at once and your main checkout stays on `main`.
#                 The worktree is <repo>-wt/<task>-<stage> beside the repo (STAGE_WORKTREES
#                 names another parent directory). The branch is feat/<task> (builder),
#                 verify/<task>, fix/<task> or verify2/<task>, prefixed with BRANCH_PREFIX if
#                 that is set. The builder starts from origin/main; every other stage starts
#                 from the branch it continues, so the "move onto <branch>" step in its
#                 prompt changes nothing. Your .env is copied in. `claude` then starts in
#                 that directory, in this terminal: use one terminal per stage.
#   WHERE=cloud   a cloud session (`claude --remote`). It starts from `main` as it is on
#                 GitHub, and the prompt tells the agent to move its own branch onto the
#                 branch it continues from.
# Either way the session pushes its branch, and the next stage finds it on GitHub.
#
# Stages (see docs/tasks/prompts.md):
#   builder                                       nothing else needed
# FOCUS="handoff follows" starts a session for a drafting group that another session
# planned: paste that session's handoff as the first message (docs/tasks/AUTHORING.md).
#   verify-1  [BUILDER_BRANCH=...]                found: the branch with <TASK>.plan.md and no report
#   fix       [VERIFIER_BRANCH=...] [ALREADY_FIXED=...]
#                                                 found: the branch with <TASK>.report.md
#   verify-2  [FIX_BRANCH=...]                    found the same way
#   draft     [FOCUS=...] [MODE=local|remote]     no TASK; prints the drafter's prompt (see below)
#   clean                                         removes the task's local worktrees (see below)
#
# Finding a branch lists up to 5 unmerged remote branches (any name except main) that have the
# stage's marker file, newest first, and asks you to confirm (Enter takes the first). The
# branch name does not matter. BRANCH_PREFIX=<prefix> (an environment variable) narrows the
# search to names starting with it. It only reads remote refs; your working tree is not touched.
#
# The draft stage works on no existing task, so it takes no TASK. FOCUS names what to
# draft ("search UI", "everything frontend"); without it the session starts by choosing.
# It only prints the prompt, so paste it into a session, or run:
# claude "$(bash scripts/stage.sh draft)". It needs no git state (it skips the "on main"
# and "main is pushed" checks). MODE sets the drafter's git rights (docs/tasks/AUTHORING.md,
# "Git mode"): local (default) is your own checkout, where the drafter makes no commits;
# remote is a cloud or other non-local session, where it commits to its session branch.
#
# clean removes every worktree this script made for the task, after its pull request is
# merged. A worktree with uncommitted changes is left alone and named. Local branches are
# kept: delete them yourself (`git branch -D <name>`) once you no longer need them.
#
# Kit note: the default branch is hard-coded as `main` (see templates/README.md).
#
# --dry-run prints the filled prompt and does not start a session or make a worktree, so
# you can paste it into any session instead.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="$root/docs/tasks/prompts"

stage="${1:-}"
[ -n "$stage" ] || { last=$(awk 'NR>1 && !/^#/ {print NR-1; exit}' "$0"); sed -n "2,${last}p" "$0" | sed 's/^# \{0,1\}//'; exit 2; }
shift
file="$dir/$stage.txt"
[ "$stage" = clean ] || [ -f "$file" ] || { echo "unknown stage '$stage' (builder, verify-1, fix, verify-2, draft, clean)" >&2; exit 2; }

dry=0
pairs=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    [A-Z_]*=*) pairs+=("$arg") ;;
    *) echo "unrecognised argument: $arg" >&2; exit 2 ;;
  esac
done

# value_of KEY prints the value given as KEY=value, or nothing.
value_of() {
  local p
  for p in ${pairs[@]+"${pairs[@]}"}; do
    [ "${p%%=*}" = "$1" ] && { printf '%s' "${p#*=}"; return 0; }
  done
  return 0
}

task="$(value_of TASK)"
if [ "$stage" != draft ]; then
  [ -n "$task" ] || { echo "TASK=<slug> is required" >&2; exit 2; }
  [ -f "$root/docs/tasks/$task.md" ] || { echo "no task file docs/tasks/$task.md" >&2; exit 2; }
fi

cd "$root"

where="$(value_of WHERE)"; where="${where:-local}"
case "$where" in local|cloud) ;; *) echo "WHERE must be local or cloud, not '$where'" >&2; exit 2 ;; esac

# Local worktrees live beside the repo, one per task and stage.
wt_root="${STAGE_WORKTREES:-$(dirname "$root")/$(basename "$root")-wt}"

if [ "$stage" = clean ]; then
  left=0
  for name in builder verify-1 fix verify-2; do
    path="$wt_root/$task-$name"
    [ -d "$path" ] || continue
    if git worktree remove "$path" 2>/dev/null; then
      echo "removed $path"
    else
      echo "kept $path: it has uncommitted changes or is not a worktree of this repo" >&2
      left=1
    fi
  done
  git worktree prune
  branches="$(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -E "(^|/)(feat|verify|fix|verify2)/$task\$" || true)"
  [ -z "$branches" ] || { echo "local branches kept:"; printf '%s\n' "$branches" | sed 's/^/  /'; }
  exit "$left"
fi

# A session starts from main as it is on GitHub (a cloud session clones it, a local
# worktree is cut from origin/main), so main must be what is pushed. (The draft stage
# needs none of this.)
if [ "$stage" != draft ]; then
  git fetch -q origin main
  have="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$have" != main ]; then
    echo "run this from main (you are on '$have'): git checkout main" >&2
    [ "$dry" = 1 ] || exit 1
  fi
  if [ -n "$(git rev-list origin/main..HEAD 2>/dev/null)" ]; then
    echo "main has commits that are not on GitHub. Push them first: the session starts from origin/main." >&2
    [ "$dry" = 1 ] || exit 1
  fi
fi

# pick_branch MARKER LACKING sets $chosen to a pushed, unmerged branch (any name) that
# contains the file MARKER and, when LACKING is given, does not contain that file.
chosen=""
pick_branch() {
  local marker="$1" lacking="$2" ref n=0 i choice
  local found=()
  git fetch -q origin '+refs/heads/*:refs/remotes/origin/*'
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    case "$ref" in origin|origin/HEAD|origin/main) continue ;; esac
    [ -z "${BRANCH_PREFIX:-}" ] || case "$ref" in "origin/$BRANCH_PREFIX"*) ;; *) continue ;; esac
    git merge-base --is-ancestor "$ref" origin/main 2>/dev/null && continue
    git cat-file -e "$ref:$marker" 2>/dev/null || continue
    if [ -n "$lacking" ] && git cat-file -e "$ref:$lacking" 2>/dev/null; then continue; fi
    found+=("$ref")
    n=$((n + 1))
    [ "$n" -ge 5 ] && break
  done < <(git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes/origin/)

  if [ "$n" -eq 0 ]; then
    echo "no unmerged branch has $marker${lacking:+ without $lacking}. Pass the branch as NAME=value." >&2
    exit 2
  fi
  echo "Branches with $marker${lacking:+ and no $lacking}, newest first:" >&2
  i=0
  for ref in "${found[@]}"; do
    i=$((i + 1))
    echo "  $i) ${ref#origin/}   $(git log -1 --format='%h  %cr  %s' "$ref")" >&2
  done
  choice=1
  if [ -t 0 ]; then
    read -r -p "Use which? [1] " choice || true
    choice="${choice:-1}"
  elif [ "$n" -gt 1 ]; then
    echo "more than one candidate and no terminal to ask on. Pass the branch as NAME=value." >&2
    exit 2
  fi
  case "$choice" in
    ''|*[!0-9]*) echo "not a number: $choice" >&2; exit 2 ;;
  esac
  [ "$choice" -ge 1 ] && [ "$choice" -le "$n" ] || { echo "no such choice: $choice" >&2; exit 2; }
  chosen="${found[$((choice - 1))]#origin/}"
}

plan="docs/tasks/$task.plan.md"
report="docs/tasks/$task.report.md"
case "$stage" in
  verify-1)
    if [ -z "$(value_of BUILDER_BRANCH)" ]; then pick_branch "$plan" "$report"; pairs+=("BUILDER_BRANCH=$chosen"); fi ;;
  fix)
    if [ -z "$(value_of VERIFIER_BRANCH)" ]; then pick_branch "$report" ""; pairs+=("VERIFIER_BRANCH=$chosen"); fi
    if [ -z "$(value_of ALREADY_FIXED)" ]; then pairs+=("ALREADY_FIXED=nothing"); fi ;;
  verify-2)
    if [ -z "$(value_of FIX_BRANCH)" ]; then pick_branch "$report" ""; pairs+=("FIX_BRANCH=$chosen"); fi
    ;;
  draft)
    if [ -z "$(value_of FOCUS)" ]; then pairs+=("FOCUS=nothing named: start with Phase 0 and propose a plan"); fi
    mode="$(value_of MODE)"; mode="${mode:-local}"
    case "$mode" in local|remote) pairs+=("GIT_MODE=$mode") ;; *) echo "MODE must be local or remote, not '$mode'" >&2; exit 2 ;; esac ;;
esac

prompt="$(cat "$file")"
for pair in ${pairs[@]+"${pairs[@]}"}; do
  key="${pair%%=*}"; val="${pair#*=}"
  # Not ${prompt//<$key>/$val}: bash 5.2 reads a "&" in $val as the matched text.
  out=""; rest="$prompt"
  while [[ "$rest" == *"<$key>"* ]]; do
    out+="${rest%%"<$key>"*}$val"
    rest="${rest#*"<$key>"}"
  done
  prompt="$out$rest"
done

missing="$(printf '%s' "$prompt" | grep -o '<[A-Z_]\{3,\}>' | sort -u | tr '\n' ' ' || true)"
if [ -n "$missing" ]; then
  echo "missing values for: $missing" >&2
  exit 2
fi

if [ "$dry" = 1 ] || [ "$stage" = draft ]; then
  printf '%s\n' "$prompt"
  exit 0
fi

if [ "$where" = cloud ]; then
  exec claude --remote "$prompt"
fi

# Local: a worktree of its own, on a new branch cut from what this stage continues.
case "$stage" in
  builder)  kind=feat;    base=main ;;
  verify-1) kind=verify;  base="$(value_of BUILDER_BRANCH)" ;;
  fix)      kind=fix;     base="$(value_of VERIFIER_BRANCH)" ;;
  verify-2) kind=verify2; base="$(value_of FIX_BRANCH)" ;;
esac
branch="${BRANCH_PREFIX:-}$kind/$task"
path="$wt_root/$task-$stage"

if [ -e "$path" ]; then
  echo "$path already exists. Continue that session there (cd into it and run claude)," >&2
  echo "or remove it first: bash scripts/stage.sh clean TASK=$task" >&2
  exit 1
fi
if git show-ref --verify -q "refs/heads/$branch"; then
  echo "the local branch $branch already exists. Delete it (git branch -D $branch) or set BRANCH_PREFIX." >&2
  exit 1
fi
git fetch -q origin "+refs/heads/$base:refs/remotes/origin/$base" \
  || { echo "no branch '$base' on GitHub" >&2; exit 2; }

mkdir -p "$wt_root"
# --no-track: the session pushes its own branch name, never the branch it started from.
git worktree add -q --no-track -b "$branch" "$path" "origin/$base"
[ ! -f "$root/.env" ] || cp "$root/.env" "$path/.env"
echo "worktree: $path" >&2
echo "branch:   $branch (from origin/$base)" >&2

cd "$path"
exec claude "$prompt"
