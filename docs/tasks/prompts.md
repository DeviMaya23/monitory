# Agent prompts

The prompt for each stage is a file in `docs/tasks/prompts/`. They are written for any task: `<TASK>` stands for the task file's name, so `TASK=<slug>` means `docs/tasks/<slug>.md`. Anything specific to one task goes in that task file under "Verifier checks", not in the prompts.

Start a stage with the launcher script, which fills in the placeholders and starts a session. Run it from the default branch in your main checkout, always. You never check a builder or verifier branch out there.

```sh
bash scripts/stage.sh <stage> TASK=<slug> [NAME=value ...] [--dry-run]
bash scripts/stage.sh clean TASK=<slug>
```

`--dry-run` prints the filled prompt without starting anything, so you can paste it into any session instead. The script refuses to start if you are not on the default branch or it has unpushed commits.

Where the session runs:

- **Local (the default, `WHERE=local`).** The script makes a git worktree for the stage beside the repo, `<repo>-wt/<task>-<stage>` (`STAGE_WORKTREES=<dir>` names another parent), on a new branch: `feat/<task>` for the builder, `verify/<task>`, `fix/<task>`, `verify2/<task>` for the others, with `BRANCH_PREFIX` in front if it is set. The builder's branch starts from `origin/main`; every other stage starts from the branch it continues, so the "move onto the branch" step in its prompt changes nothing. Your `.env` is copied in, and `claude` starts in that directory, in the terminal you ran the script from. Use one terminal per stage; stages of different tasks can run at the same time. The worktree has no installed dependencies (`STACK.md`).
- **Cloud (`WHERE=cloud`).** A cloud session (`claude --remote`). It starts from the default branch as it is on GitHub, and the prompt tells the agent to move its own branch onto the one it continues from.

Either way the session pushes its branch, and the next stage and `scripts/status.sh` find it on GitHub. After a task's pull request is merged, `stage.sh clean TASK=<slug>` removes its worktrees; one with uncommitted changes is kept and named, and local branches are left for you to delete.

Local sessions share this machine, which cloud sessions did not: run only one stage at a time that uses Mailpit (`make test-integration`, the end-to-end suite), and choose the permission mode you start `claude` with knowing that a local session can reach outside its worktree.

When you leave a branch placeholder out, the script lists up to five unmerged candidate branches that have the stage's marker file (table below), newest first, and asks you to confirm. It only reads remote refs. Passing `BUILDER_BRANCH=...` (or the other branch placeholders) skips the search.

Branch names do not matter to the scripts: they find a task's branch by the files on it (the plan, the report), whatever its name, and `BRANCH_PREFIX=<prefix>` (an environment variable) narrows the search. Local sessions get the branch names above; cloud sessions name their own, and `feat/<slug>` and `verify/<slug>` are a convention to ask for where the platform allows it. <!-- UNTESTED: the lookup was run on a scratch repository, not against cloud sessions; check in project 1 which branch names sessions actually get. -->

| # | Stage | Prompt file | Continues from | Found by (placeholder left out) | Placeholders |
|---|---|---|---|---|---|
| 1 | Builder | `builder.txt` | default branch | | `TASK` |
| 2 | Verifier, first pass | `verify-1.txt` | the builder's branch | has `<TASK>.plan.md`, no `<TASK>.report.md` | `TASK`, optional `BUILDER_BRANCH` |
| 3 | Fix round (builder) | `fix.txt` | the verifier's branch | has `<TASK>.report.md` | `TASK`, optional `VERIFIER_BRANCH`, optional `ALREADY_FIXED` |
| 4 | Verifier, second pass | `verify-2.txt` | the fix round's branch | has `<TASK>.report.md` | `TASK`, optional `FIX_BRANCH` |
| – | Drafter | `draft.txt` | your checkout, or the session's branch in remote mode | | optional `FOCUS`, optional `MODE` (`local` or `remote`; no `TASK`) |

The drafter is not part of a task's chain. `stage.sh draft` only prints its prompt, with `Git mode` filled in: `MODE=local` (default) for a session in your own checkout, where the drafter edits files and makes no commits, or `MODE=remote` for a cloud or other non-local session, where it commits to its session branch and opens pull requests, never touching the default branch. Example: `bash scripts/stage.sh draft MODE=remote FOCUS="search UI"`. See "Git mode" in `docs/tasks/AUTHORING.md`. <!-- UNTESTED: remote mode has not been run in a real session. `stage.sh` fills <GIT_MODE> (dry-run checked only). -->

Stop rules: two verification rounds at most. Only Blocking findings are fixed in the round; Non-blocking ones with a trigger go to `docs/tasks/backlog.md`. The second pass puts its results in the PR body, not in a file.

Pull requests: one per slice, opened by the last verifier in the chain and only when that verifier finds nothing Blocking. The agents open it through the REST API (`gh api`) if the cloud session cannot use GraphQL, and fill the body from `.github/pull_request_template.md`. Reviewing, testing by hand and merging stay with you (squash-merge). A feature split across a back-end and a front-end slice merges back end first; note the pairing under "Tested together with".
