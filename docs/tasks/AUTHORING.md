# Authoring a task file

How a drafting agent turns one backlog item into a task file that a builder agent can run. Read it with `AGENTS.md`, `ROLES.md` and `docs/tasks/TEMPLATE.md`. The template says what a task file contains; this file says how to produce one, and what the drafter may and may not do.

A task file is the builder's whole brief and the verifier's whole checklist. Builder and verifier run in separate sessions that never saw your conversation with the user. Whatever you and the user decide must be written in the file, or it is lost.

## The role

Role: **Drafter**. One drafting session runs at a time, and it drafts one task at a time. The user is present and answers questions.

You may create or change these files only:

- `docs/tasks/<slug>.md`, the task file you are drafting.
- `docs/tasks/backlog.md`: remove the line of each item you draft, in the same change as its task file; add a line for any part you leave out; add the user-approved triage lines (Phase 0).

You may not change anything else: no code, tests, `docs/openapi.yaml`, `docs/requirements.md`, `STACK.md`, `CONVENTIONS.md`, other task files, scripts or the build file. If a task needs one of those changed first, do not draft around it. Tell the user what change is needed and why, and stop. The user makes it and merges it before the task runs. The task file then states it as a **Prerequisite**.

## Git mode

The prompt that started this session has a line `Git mode: local` or `Git mode: remote`. If the line is missing, treat it as `local`. The mode changes only what you may do with git; every other rule here is the same.

**local** (the user's own checkout). You edit files in the working tree and run no git command that writes (`add`, `commit`, `branch`, `checkout`, `switch`, `stash`, `reset`, `fetch`, `pull`, `push`). You may read git state. Where a commit message matters (the triage marker), give the user the exact message. Task files must be committed and on the default branch on GitHub before `scripts/stage.sh` can run them; say so at the end. Work from the checkout as it is; if you suspect the default branch is behind GitHub, say so instead of trying to update it.

**remote** (a cloud or other non-local session, where the user cannot commit from their editor). You may commit and push, with these limits:

- Never push to the default branch, never force-push, never rewrite pushed history, never merge. The user is the only one who merges.
- Stay on the branch the session gives you. Do not create or switch branches; if the session has none, stop and say so.
- Commit only the files you are allowed to change (above), in small steps, with plain messages (`draft: <slug>`, `backlog: ...`).
- Triage goes on its own: if the session starts with triage to record, make it a separate branch and pull request whose title is exactly `backlog: triage findings through <short hash of the default branch you read>`, containing only backlog lines. Tell the user to squash-merge it before anything else, so the marker is on the default branch. If nothing was tracked, say so and let the user make the empty marker commit themselves. If the session cannot open a second branch, give the user the title and stop; do not mix triage into the task-file branch.
- Task files and the backlog changes for the tasks you drafted go on the session's branch, one pull request per session. Open it through the REST API if GraphQL is unavailable (`gh api repos/{owner}/{repo}/pulls ...`, body written to a file), body from `.github/pull_request_template.md` where it fits, listing the tasks in run order. Leave "Checked by hand" for the user.
- The checker still runs before any task is announced as ready. A pushed branch is not a ready task.
- You cannot fetch from or update the default branch beyond what the session started with. If it looks stale, say so.

## The user's rules while drafting

- **Do not edit a `.md` file while a discussion is open.** Edit only after the user has made clear that the scope is settled, or after you asked and they confirmed.
- **Scope fully before writing, and ask rather than guess.** If a decision changes what gets built, ask. If it does not (naming, wording, an ordinary default), settle it yourself and list it afterwards.
- **Do not jump ahead.** Draft only the tasks in the plan the user approved, in that order. Do not fix things you noticed on the way; add a backlog line or tell the user.
- **When the user asks you to explain first, explain first.**
- Do not show diffs in the chat (the user reads them in their editor or in the pull request).

## Phase 0: choosing what to draft

Nothing is edited in this phase until the user answers.

1. **Read the whole backlog**, then `scripts/status.sh`, the open task files and `STACK.md`. Every time; the order depends on all of it.
2. **Reconcile the backlog with the facts, and triage new findings.** The backlog is a to-do list, not evidence of what exists. When sources disagree, believe them in this order: the code on the default branch, `docs/openapi.yaml`, task reports and `status.sh`, then the backlog. Check:
   - **Unbuilt operations:** every operation in the backlog's coverage table is still unbuilt, and every unbuilt one is in the table or a task file.
   - **Stale text:** any line in `STACK.md`, the backlog or the docs that describes finished work as pending, or names a commit, a count or a status (those do not belong in the backlog).
   - **Dependencies:** a front-end item that needs a back-end operation names it, and the reverse.
   - **Chat decisions:** decisions the user made in conversation that are written nowhere.
   - **New findings:** find the last triage (the newest commit on the default branch whose message starts `backlog: triage findings through `; the rest is a commit hash). If none, ask where to start. Read the Non-blocking findings of reports added or changed since then. Skip findings already tracked or fixed in a fix round. Show each remaining one in a line with its task and ask **track** or **drop**. A tracked finding becomes a backlog line (`` - `<task>`: <finding>. Matters when: <trigger>. ``); a dropped one stays in its report. `bash scripts/triage.sh` lists them (Non-blocking sections of the reports since the last marker) and prints the marker message; it only reads, so you may run it in either git mode. <!-- UNTESTED in a real project; tested only on a scratch repository. -->
   - **Decision deadlines:** list "Decisions waiting on the user" whose deadline has passed and ask for each: decide, or drop.

   Report every disagreement in the plan (step 4) with what each source says and a proposed fix. When the user has answered, write the tracked lines (and approved corrections) into the backlog and tell the user to commit them on their own, before any task files, with `bash scripts/triage.sh commit` (it makes the marker commit `backlog: triage findings through <short hash>`, empty if nothing was tracked; the user runs it, never the drafter, and pushes). In remote mode, see "Git mode": a separate pull request with that title.
3. **Work out the order with parallel work in mind.** The user runs a backend and a frontend task together whenever files allow, so the plan is lanes, not one list. For every candidate find prerequisites (what must merge first), conflicts (shared files, see `ROLES.md` "Shared state"), blockers for the user (contract, requirements, `STACK.md`, a migration, secrets), and size (split a task a builder cannot finish in one session, or that mixes back end and front end).
4. **Propose the plan in chat:** the next few tasks in order, lane for each, which can run together, what each waits for, what is blocked on the user, what you would leave alone. Short; the user approves or overrules.
5. **Draft in the approved order,** one at a time: steps 1 to 6 for the first before the second, each with its own fresh checker. A task drafted later in the session treats earlier drafts as running tasks when working out conflicts.

The plan is not stored in a file; it would become a second home for backlog items.

## Procedure (per task)

### 1. Read before asking

1. The backlog line, and the requirement IDs it names.
2. The contract for every operation involved: `docs/openapi.yaml`, not only a summary. Write down, per operation, every parameter, request field, status code, response header, response field and error code. That list is the limit of what the task may specify.
3. The code on the default branch that the task touches: names, signatures, what is a stub, what exists. Use `status.sh --all` and the neighbouring tasks' reports.
4. Two or three finished task files of the same side, and one close in shape. They set depth and tone. **Depth follows risk:** keep full detail for backend, contract and security tasks; a pure UI task can be shorter. <!-- UNTESTED: retro P7, check it in project 1. -->
5. Known gaps, non-blocking findings and backlog lines that mention this area: in scope now, or named out of scope.
6. The tests that currently pin behavior you will change (for example a test that says an operation is unimplemented). The task must say they are replaced.

### 2. Ask what only the user can decide

Use the question tool when available (up to four questions, recommended option first); otherwise ask in text. Ask about behavior the requirements and contract do not settle, which of several designs to build, anything needing a change to the contract, requirements, `STACK.md` or a migration, and the split.

Do not ask about wording, test names, file names, or a default any careful engineer would pick. Decide and list them.

**The contract is a limit, not a starting point.** Before offering an option, check it against your list from step 1. A status code, header, field, parameter or error code the contract does not list is a **contract change**: never a default, never the recommended option. Put it to the user as its own question, quoting the contract ("`<operation>` lists 200, 401, 404 and 429 and no 304: add one, or leave it out?"). A task that needs a change names it as a **Prerequisite**. Also raise places where the contract disagrees with itself or with the requirements; do not resolve them silently.

Also check the design reference against the contract: every error state, empty state and limit the design shows must exist in the contract (an error table reconciled once at kickoff, and again whenever a design changes). A state the contract cannot produce is a question for the user. <!-- retro P10 -->

### 3. Write the file

Start from `docs/tasks/TEMPLATE.md`. Keep its section order. Delete guidance comments, the checklist and sections that do not apply. The slug is the file name.

What a good file has:

- **Goal**, **Requirements covered** (each proven by a criterion), **Out of scope with a reason for each item**.
- **Prerequisite** at the top for anything the builder must find in place.
- **Role and ownership**: allowed and forbidden paths, and the shared files.
- **Behavior** is exact: every parameter, every failure with status and code, every limit with what happens at it and one past it, the order checks run in, the exact wording of every user-visible message.
- **Known gaps**, so the builder does not work around them and the verifier does not flag them.
- **Structure**: where code goes, by `ARCHITECTURE.md`; names of files, hooks and helpers that must exist; what must be shared rather than copied.
- **Design reference** (frontend): reference only, copy styles never component code, use the library's components.
- **Dependencies**: only what `STACK.md` names, with the resolved version and command; anything else is a question first.
- **Acceptance criteria**: each has a test that would fail if the behavior were removed; group by unit; include boundaries and every failure; say which are integration tests.
- **Verifier checks**: rules the diff must obey, how to check UI behavior by reading code, how to confirm a test discriminates, inputs to try.
- **Stop and ask when** and **Handing back**, adapted to the task.

Rules for the text:

- Use names that exist in the repo. Never invent one without saying it is new.
- Do not copy code into the file. Describe behavior and shape.
- No "TBD", "as appropriate", "handle errors", or "similar to X" without saying X's rule.
- Do not claim a requirement is covered unless a criterion proves it.
- Keep it to what this task does.

### 4. Backlog

In the same change that adds the task file: remove the item's line or row; if part is left out, add one line for the left-out part naming its source task; change nothing else (stale lines are reported to the user).

### 5. Check, fix, then show

**Run the checker immediately** when the file is written, in the same turn, in the background. You may finish the backlog change meanwhile, but do not start the next task until the findings are handled. **Do not tell the user a task is ready until its checker has finished and its findings are handled.**

Spawn a **fresh subagent** (it gets only the draft's path and read access). Give it the brief below, changing only the file name.

> You are reviewing a task file that a builder agent will implement without access to the person who wrote it. Read `AGENTS.md`, `ROLES.md`, then the task file `docs/tasks/<slug>.md`. Do not edit any file. Check it against the repository as it is now (`docs/openapi.yaml`, `docs/requirements.md`, the code, the tests, `STACK.md`, `CONVENTIONS.md`, `ARCHITECTURE.md`, `TESTING.md`) and report:
> 1. Contradictions: with the contract, the requirements, the code, another section of the same file, or the ownership rules (a file the task tells the builder to change but forbids it to). Go through `docs/openapi.yaml` for every operation the file names, and list each status code, header, parameter, field and error code the file specifies but the contract does not list (Blocking, unless the file names the contract change as a prerequisite), and each thing the contract requires that the file leaves out or contradicts.
> 2. Claims about the code that are wrong or stale: names, signatures, error codes, existing tests, what is a stub.
> 3. Requirements the file says it covers that no acceptance criterion proves, and criteria no verifier check or test could confirm.
> 4. Behavior left open that a builder would have to invent: a status or message, a limit or its boundary, an order of checks, a failure path.
> 5. Existing tests or behavior that the change breaks and the file does not mention.
> 6. Anything that cannot be done without a dependency, migration, contract change or edit outside the allowed paths.
> 7. Conflicts with tasks that run at the same time or with the backlog.
> 8. The recurring catches below, one line each, even if clean: <the list from "Things that went wrong before" and any later additions>.
> For each finding give: Blocking or Non-blocking, the section of the task file, what the repository says (file and line), and what is wrong. Separate design decisions for the user from mechanical errors. Do not propose a design; list the question. If there are no findings, say so.

Then:

- **Mechanical errors:** fix immediately, list each in one line.
- **Design decisions:** do not decide. Show the finding to the user **word for word**, ask, apply the answer.
- **Nothing blocking and nothing to decide:** say so in one line.
- At most **two rounds**. The second round checks only the changed lines and the findings of the first, not the whole file again. <!-- UNTESTED: retro P6 -->
- Record, per task, how many findings each round had and of what kind, in your report. It is the data for tuning this process.

### 6. Report

After each task, a short message; after the last, a closing summary. For a task: the file path, a one-line summary, the checker's result (fixes applied, questions left), the defaults you settled yourself, anything you noticed outside the task, and what the user must do before the task runs (local: commit and push to the default branch; remote: merge the pull request; any contract or `STACK.md` change, regeneration). Say plainly that nothing was run or tested.

## Things that went wrong before

The checker brief uses this list as its checklist. Add a line whenever a checker catches something the drafter should have caught.

- Tasks written before a neighbour merged, then wrong about a file or a name. Read the checkout as it is; state prerequisites.
- Two agents changing the same files at once. Name the shared files and the order.
- A message or limit the file did not give, which the builder invented. Write the exact text.
- A contract detail missing (a status, an error code): the builder cannot edit the contract, so the file names it as a prerequisite and says to stop if absent.
- Acceptance criteria without a test that could fail.
- Backlog items left behind after their task was drafted, so one thing lived in two places.
- Edits made to docs while the user was still discussing.
- A design that shows a state the contract cannot produce.

## Before you finish

- [ ] The task files and approved backlog changes are the only files changed (in remote mode, only those were committed, and nothing went to the default branch).
- [ ] Each drafted item is gone from the backlog; any left-out part is named there with its source task.
- [ ] The closing summary lists the tasks in run order, lanes, what can run together, what each waits for, and what the user must do first.
- [ ] Nothing was announced as ready before its checker finished; mechanical fixes are listed; design questions are answered or shown to the user.
- [ ] Every default you chose is in the final message.
