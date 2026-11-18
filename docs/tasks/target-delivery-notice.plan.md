# Plan: target delivery notice

Branch: feat/target-delivery-notice

## Checklist

TR = `frontend/src/features/alert-list/components/TargetRow.test.tsx` (new); AL = `.../components/AlertList.test.tsx`. Source: `.../components/TargetRow.tsx`.

- [ ] TR: email and webhook with `true` each render one `.notice--warn` with the exact sentence, an aria-hidden icon, after `.target__addr` inside `.target__main` (FR-86)
- [ ] TR: same two with `false` render no `.notice` and no text containing "delivery" (FR-86)
- [ ] TR: flagged, unnamed target keeps fallback name, chip, address and `Edit`/`Remove` names
- [ ] TR: `asking`, and `asking`+`removing`: `true` shows the notice, `false` none
- [ ] TR: no role or aria-live on the notice or an ancestor within the row
- [ ] TR: flagged target named `<b>x</b>` shows the fixed text and no `b` element (NFR-7)
- [ ] AL: three targets, only the middle flagged: one notice, in the middle row, server order, sub line unchanged (FR-86, FR-17)
- [ ] AL: none flagged: no notice; all flagged: three notices
- [ ] AL: reload made to fail via 404 removal + rejected refetch leaves rows under the `Something went wrong.` banner (helper used by the next two)
- [ ] AL: disappears: both `true`, failed refetch keeps second's notice, `Try again` with `false` removes it, banner gone (FR-86)
- [ ] AL: appears: both `false`, `Try again` with first `true` shows notice in that row
- [ ] AL: edit via dialog on flagged row, `updateTarget` answers `true` (stays) and `false` (gone); other rows unchanged
- [ ] AL: removing a flagged target (204): row and notice gone, no other row gains one
- [ ] AL: removal question open and `Cancel` keep the notice
- [ ] AL: `updateTarget: vi.fn()` added to the `vi.mock` factory; dashboard tests not edited, still pass
- [ ] Implementation: `TargetRow.tsx` constant + `p.notice.notice--warn` from `target.last_delivery_failed === true`
- [ ] CSS: 360 px read-through of `alert-list.css`/`components.css` against the board; add a rule only if missing
- [ ] `make check` passes
- [ ] Integration tests: not run: the task touches frontend only; no backend code with integration tests

## Judgment calls

(filled in at the end)
