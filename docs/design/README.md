# Design reference

Read-only. The files in this directory are the design reference for the five screens, not code.

## Rules

- Do not edit these files.
- Copy styles only: token values from `tokens.css` and style rules from the stylesheets go into the project's own tokens and CSS. Never copy the board markup or treat it as component code.
- `board.css` and the board chrome (state titles, notes, frames) are presentation for these boards. They are not part of the product.
- Build every component with the Base UI wrappers in `frontend/src/components/ui/` and Lucide icons, as `STACK.md` says.
- Where a board and `docs/openapi.yaml` disagree, the contract wins. The known differences are listed below.
- A state that is not drawn here and not listed below is not built. Stop and report it.

## Files

| File | Screen |
|---|---|
| `index.html` | Overview: visual direction, tokens, core components, destructive actions |
| `sign-in.html` | Sign-in |
| `dashboard.html` | Admin dashboard, delete confirmation, failure-reason wording, time format |
| `service-form.html` | Add or edit a service, test check, validation wording |
| `alerts.html` | A service's alert list, add or edit a target, test alert |
| `public.html` | Public dashboard |
| `ui-design-brief.md` | The brief the design was made from, with the error and state table |

## Where the boards differ from what is built

| Board | What is built |
|---|---|
| Dashboard: "Alert delivery failed" and the delete dialog's target count annotated as `listTargets` per service | Both come from `listServices`: `Service.alert_delivery_failed` and `Service.target_count`. The delete dialog has no "counting" state |
| Dashboard: pause and resume annotated as `updateService` | `pauseService` and `resumeService` |
| Service form: "Service not found" lists `testServiceCheck` 404 | `testServiceCheck` has no 404. The state applies to `getService` and `updateService` only |
| Service form: name counter "0/100", hints "Up to 20" and "Up to 10" | Not shown. These limits are deployment configuration. The counters for the unhealthy and recovery messages (500) and the target name (50) stay |
| Validation wording table: fixed text per code, "Outside the range this server allows" | The field shows the server's `FieldError.message` as it is |
| Field paths `headers[2].value`, `json_rules[1].path` | `check.headers[2].value`, `check.json_rules[1].field`, `check.query_params[0].name`; `headers[0].name` for a webhook target |
| Failure reasons keyed by description | Keyed by `FailureReason.code`; the status code is `http_status`, the rule's field is `json_rule_field` |
| Sign-in: "returns to the screen the admin was on" after a session expires | Not built. Sign-in always goes to the dashboard |
| Open question 5: restoring typed values after a session expires | Not built |

## Additions that are built

- Dark theme, following the operating system setting, from the tokens.
- Removing a notification target: inline two-step confirm in the row.
- "Discard unsaved changes?" dialog on both forms, and the browser's own prompt on tab close or reload.
- Notification target dialog: an error summary above the form after a `422`, titled `1 field needs fixing before this can be saved.` or `{n} fields need fixing before this can be saved.`, with one entry per error that links to its input. The board draws only the message under each field.
- Alerts group on the service form: the `Send alerts` switch showing Off, and a message error under the Unhealthy or Recovery text area, styled like the other field errors.

## Pages

| Page | Path |
|---|---|
| Admin dashboard | `/` |
| Sign-in | `/sign-in` |
| Public dashboard | `/status`, with the fixed heading "Service status" |
