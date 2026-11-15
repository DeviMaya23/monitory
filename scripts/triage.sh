#!/usr/bin/env bash
# List the verifier findings that have not been triaged yet, and make the triage marker commit.
#
#   bash scripts/triage.sh                  list new findings and print the marker commit message
#   bash scripts/triage.sh commit [--yes]   make the marker commit (you run this, never the drafter)
#   bash scripts/triage.sh --since <rev>    start from a given commit instead of the last marker
#
# The marker is a commit on main whose message starts `backlog: triage findings through ` and
# ends with the short hash of the origin/main that was read. The next triage starts from the
# newest marker. Findings come from the reports (docs/tasks/*.report.md) that were added or
# changed on origin/main since then; only their Non-blocking section is shown. A finding that
# is already in the backlog, or that a fix round fixed, is not filtered out here: the drafter
# (docs/tasks/AUTHORING.md, Phase 0) skips those and asks track or drop for the rest.
#
# `commit` stages docs/tasks/backlog.md if it changed (the lines you chose to track) and
# commits with the marker message, empty if nothing was tracked. It refuses to run unless you
# are on main with no commits that are not on GitHub, and nothing but the backlog staged.
# It never pushes: push main yourself afterwards.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
git fetch -q origin main

mode=list; since=""; yes=0
while [ $# -gt 0 ]; do
  case "$1" in
    commit) mode=commit ;;
    --yes) yes=1 ;;
    --since) shift; since="${1:-}"; [ -n "$since" ] || { echo "--since needs a commit" >&2; exit 2; } ;;
    -h|--help) last=$(awk 'NR>1 && !/^#/ {print NR-1; exit}' "$0"); sed -n "2,${last}p" "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unrecognised argument: $1" >&2; exit 2 ;;
  esac
  shift
done

prefix='backlog: triage findings through '
head_short="$(git rev-parse --short origin/main)"
message="$prefix$head_short"

marker="$since"
if [ -z "$marker" ]; then
  marker="$(git log origin/main --format='%H' --grep="^$prefix" | head -1 || true)"
fi
if [ -z "$marker" ]; then
  echo "No triage marker on origin/main yet. Pass --since <commit> to say where to start" >&2
  echo "(for the first triage, the commit before the first report you care about)." >&2
  exit 2
fi
git rev-parse --verify -q "$marker^{commit}" >/dev/null || { echo "not a commit: $marker" >&2; exit 2; }

if [ "$mode" = list ]; then
  echo "Last marker: $(git log -1 --format='%h  %cr  %s' "$marker")"
  echo "Reading origin/main at $head_short"
  echo
  reports="$(git diff --name-only --diff-filter=AM "$marker..origin/main" -- docs/tasks | grep -E '\.report\.md$' || true)"
  if [ -z "$reports" ]; then
    echo "No reports added or changed since the marker: nothing to triage."
  else
    count=0
    for f in $reports; do
      task="$(basename "$f" .report.md)"
      # The Non-blocking section: from its heading to the next heading of the same or higher level.
      body="$(git show "origin/main:$f" | awk '
        /^#+[ \t]/ { match($0, /^#+/); lvl = RLENGTH
                     if (on && lvl <= start) { on = 0 }
                     if (!on && tolower($0) ~ /non-blocking/) { on = 1; start = lvl; next } }
        on && NF { print }')"
      echo "== $task  ($f)"
      if [ -z "$body" ]; then echo "   (no Non-blocking section found: read the report)"; else printf '%s\n' "$body" | sed 's/^/   /'; count=$((count + 1)); fi
      echo
    done
    echo "$count report(s) with a Non-blocking section."
  fi
  echo
  echo "Marker commit message:"
  echo "  $message"
  echo "If nothing is tracked, make it empty:  git commit --allow-empty -m \"$message\""
  echo "Or after editing docs/tasks/backlog.md:  bash scripts/triage.sh commit"
  exit 0
fi

# commit
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = main ] || { echo "run this from main (you are on '$branch')" >&2; exit 1; }
if [ -n "$(git rev-list origin/main..HEAD)" ]; then
  echo "main has commits that are not on GitHub. Push them first; the marker must name the main you read." >&2
  exit 1
fi
if ! git diff --quiet HEAD -- . ':(exclude)docs/tasks/backlog.md' || [ -n "$(git diff --cached --name-only | grep -v '^docs/tasks/backlog.md$' || true)" ]; then
  echo "changes other than docs/tasks/backlog.md are present. Commit or stash them first: the marker commit holds only the backlog." >&2
  exit 1
fi
if git diff --quiet HEAD -- docs/tasks/backlog.md; then
  what="an EMPTY commit (the backlog is unchanged: nothing tracked)"
else
  what="a commit with your edits to docs/tasks/backlog.md"
fi
echo "Will make $what:"
echo "  $message"
if [ "$yes" = 0 ]; then
  [ -t 0 ] || { echo "no terminal to confirm on; pass --yes" >&2; exit 2; }
  read -r -p "Go ahead? [y/N] " ans
  case "$ans" in y|Y|yes) ;; *) echo "not committed"; exit 1 ;; esac
fi
git add docs/tasks/backlog.md 2>/dev/null || true
git commit -q --allow-empty -m "$message"
echo "Committed $(git rev-parse --short HEAD). Push it: git push origin main"
