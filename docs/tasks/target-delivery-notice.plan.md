# Plan: target delivery notice

Branch: feat/target-delivery-notice

## Checklist

TR = `frontend/src/features/alert-list/components/TargetRow.test.tsx` (new); AL = `.../components/AlertList.test.tsx`. Source: `.../components/TargetRow.tsx`.

- [x] TR: email and webhook with `true` each render one `.notice--warn` with the exact sentence, an aria-hidden icon, after `.target__addr` inside `.target__main` (FR-86)
- [x] TR: same two with `false` render no `.notice` and no text containing "delivery" (FR-86)
- [x] TR: flagged, unnamed target keeps fallback name, chip, address and `Edit`/`Remove` names
- [x] TR: `asking`, and `asking`+`removing`: `true` shows the notice, `false` none
- [x] TR: no role or aria-live on the notice or an ancestor within the row
- [x] TR: flagged target named `<b>x</b>` shows the fixed text and no `b` element (NFR-7)
- [x] AL: three targets, only the middle flagged: one notice, in the middle row, server order, sub line unchanged (FR-86, FR-17)
- [x] AL: none flagged: no notice; all flagged: three notices
- [x] AL: reload made to fail via 404 removal + rejected refetch leaves rows under the `Something went wrong.` banner (helper used by the next two)
- [x] AL: disappears: both `true`, failed refetch keeps second's notice, `Try again` with `false` removes it, banner gone (FR-86)
- [x] AL: appears: both `false`, `Try again` with first `true` shows notice in that row
- [x] AL: edit via dialog on flagged row, `updateTarget` answers `true` (stays) and `false` (gone); other rows unchanged
- [x] AL: removing a flagged target (204): row and notice gone, no other row gains one
- [x] AL: removal question open and `Cancel` keep the notice
- [x] AL: `updateTarget: vi.fn()` added to the `vi.mock` factory; dashboard tests not edited, still pass
- [x] Implementation: `TargetRow.tsx` constant + `p.notice.notice--warn` from `target.last_delivery_failed === true`
- [x] CSS: 360 px read-through done; the board's `alerts.css` has no `.notice` rule, and `.notice` (inline-flex, wrapping span) in `components.css` plus the flex-column `.target__main` already cover it. No CSS change
- [x] `make check` passes (exit 0)
- [x] Integration tests: not run: frontend-only task; it touches no code that has integration tests

## Judgment calls

- The AlertList edit cases wait for the `Target saved.` toast and the dialog closing before asserting, because the dialog closes asynchronously.
- The `TargetRow` tests use `describe.each` over email and webhook instead of writing each case twice.
- Mutation check run by hand: always showing the notice fails 14 tests, never showing it fails 16. Both mutations were reverted.
- Installed frontend dependencies with `npm ci` (lockfile unchanged) because the worktree had none.
- Added `type Target` to the `lib/api/targets` import in `AlertList.test.tsx`.
