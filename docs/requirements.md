# Requirements: self-hosted uptime/status monitor

Version: v0.44
Status: draft. All nine sections are written and what is in them is accepted for now (may still change). The completeness check gaps are closed. `openapi.yaml` v0.1.0 is written against this version and maps every requirement to an operation or "no API".

## 1. Product

A self-hosted uptime and status monitor. It checks targets (apps and services) on a schedule in the background and tells the admin when one is down. It is built as a practice project for multi-agent development, with parts that can be built in parallel (managing services, and the checking that runs in the background). An installer should be able to run it without asking the author anything.

## 2. Users and devices

- One admin sets up and manages everything. There are no other app users.
- Notification targets receive alerts. They are contact details, not app users and not accounts.
- Anonymous viewers may see the public dashboard if the admin turns it on. They need no sign-in.
- Reachable without sign-in: the sign-in page, the public dashboard and the health endpoint (FR-96). Everything else needs the admin signed in.
- Devices: the interface adjusts to a mobile viewport as well as desktop. Supported browsers and the narrowest screen width are in NFR-2 and NFR-3.
- How the app is reached: over the public internet or a private network. On the public internet the installer puts HTTPS in front of the app (FR-97 to FR-99). On a private network the app can be used over plain HTTP.

## 3. Functional requirements

Reading convention: where a requirement says the admin can add something, the admin can also edit, remove and list it, even if only "add" is written.

### Access

- **FR-1** The admin signs in with credentials. Wrong credentials are rejected, and the rejection does not say which part was wrong.
- **FR-2** After 5 failed sign-in attempts in a row on an account, further attempts on that account are rejected for 15 minutes, even with correct credentials. A correct sign-in resets the count. *(Reworded in v0.21: "in a row" and the reset added.)*
- **FR-3** Signing out ends the session. The admin pages and their API then require signing in again.
- **FR-4** Without a valid session, any page or API call other than the sign-in page, the public dashboard and the health endpoint (FR-96) is rejected. *(Reworded in v0.13: health endpoint added.)*
- **FR-5** A session lasts 30 days from sign-in, or until the app restarts (FR-114), whichever comes first. Using the app does not extend it. After that the admin must sign in again. *(Reworded in v0.21: counted from sign-in. Reworded in v0.34: restart added.)*
- **FR-97** The app does not serve HTTPS itself. HTTPS is provided by a reverse proxy or hosting platform in front of it. A deployment setting, "require HTTPS", decides whether sign-in is allowed over plain HTTP. When it is on, a sign-in request that did not arrive over HTTPS is rejected, and the error says how to turn the setting off. The setting is on by default. It does not apply to the public dashboard or the health endpoint. *(Note for the implementor: do not hardcode the setting.)*
- **FR-98** When "require HTTPS" is on, the session cookie is only sent by the browser over HTTPS. When it is off, the cookie works over plain HTTP too.
- **FR-99** The app decides whether a request arrived over HTTPS from information the proxy passes on about the original request, and only when the installer has told it to trust the proxy. This trust is a deployment setting and is off by default. With it off, every request counts as plain HTTP. The same setting decides the client address used by the public view's rate limit (FR-32): with trust on, it is the original client address that the proxy passes on; with trust off, it is the address that connects to the app. *(Reworded in v0.31: rate-limit address added.)*
- **FR-101** The admin's username and password come from the deployment configuration. The app has no account-creation page. *(Note for the implementor: do not hardcode them.)*
- **FR-102** If the username or password is missing from the deployment configuration, the app does not start, and the error names the missing setting.
- **FR-103** There is no password change in the app. To change the credentials, the installer changes the deployment configuration and restarts the app. This is also how a forgotten password is recovered.
- **FR-114** When the app restarts, all sessions end, and all failed sign-in counts and lockouts are cleared. The admin signs in again.

### Services

The specifics of checks, health, limits and service details are in FR-33 to FR-74.

- **FR-6** The admin can add a service to monitor.
- **FR-7** The admin can edit any setting of a service.
- **FR-8** The admin can delete a service.
- **FR-9** The admin can see all monitored services on a dashboard.
- **FR-10** The system checks each service in the background, at that service's check interval.
- **FR-11** *(Removed in v0.29.)* Was: the admin sets the unhealthy threshold for a service. Replaced by the specific rules in FR-41 to FR-58.
- **FR-12** Adding or editing a service with invalid settings is rejected, and nothing is saved.
- **FR-13** *(Removed in v0.24.)* Was: editing or deleting a service that does not exist is rejected. Treated as implicit, not a separate requirement.

### Alerts

The specifics of notification targets and delivery are in FR-80 to FR-92.

- **FR-14** The admin can add a notification target to a service's alert list.
- **FR-15** The admin can edit a notification target on a service's alert list.
- **FR-16** The admin can remove a notification target from a service's alert list.
- **FR-17** The admin can see a service's alert list.
- **FR-18** An alert list belongs to one service. The same contact on two services is entered on each.
- **FR-19** An alert list holds at most 5 notification targets. Adding a sixth is rejected. *(Note for the implementor: do not hardcode the value 5.)*
- **FR-20** Alerts are on for a new service. The admin can turn them on or off per service. While off, that service sends no alerts. A service with an empty alert list sends nothing even when alerts are on. *(Reworded in v0.13: was off by default; it is the public view that is off by default, FR-26.)*
- **FR-21** When a service changes from healthy to unhealthy and alerts are on, the system sends one alert to each notification target on its alert list.
- **FR-22** When a service changes from unhealthy to healthy and alerts are on, the system sends one recovery alert to the same targets. Its content is defined in FR-23, with the recovery message in place of the unhealthy message. *(Reworded in v0.3 and v0.12.)*
- **FR-23** An alert, by email or webhook, contains the service name, the new status, the time of the change, and the message the admin defined for the unhealthy condition (or a default message if none is defined). It never includes the response body, headers or request settings. *(Reworded in v0.2, v0.3 and v0.12.)*
- **FR-24** If the first check of a service finds it unhealthy and alerts are on, that counts as a change to unhealthy and FR-21 applies. A healthy first check sends nothing.
- **FR-25** Turning alerts on for a service that is already unhealthy sends no alert. The next alert is sent on the next change.

### Public view

What viewers see of each service is in FR-40 and FR-63.

- **FR-26** The admin can turn the public view on or off. It is off by default.
- **FR-27** The admin can choose which services appear on the public view.
- **FR-28** While the public view is on, anonymous viewers can see the chosen services.
- **FR-29** While the public view is off, an anonymous visitor to it gets an "unavailable" message.
- **FR-30** The public view has a refresh button that loads the latest status.
- **FR-31** The public view updates itself every 5 minutes.
- **FR-32** The public view accepts at most 60 requests per minute from one client address. Requests over that are rejected, and the response says how long to wait. *(Note for the implementor: do not hardcode the value 60.)*

### Check types and requests

What counts as unhealthy for each type is in FR-41 to FR-58.

- **FR-33** A service is checked as one of two types: HTTP(S) or TCP port.
- **FR-34** An HTTP(S) check can also check the expiry of the service's TLS certificate.
- **FR-35** An HTTP(S) service has a saved request: URL, optional query parameters, any headers the admin sets, and an optional body. The monitor sends it at each check.
- **FR-36** The admin can choose any HTTP method.
- **FR-37** The body has a type: none, JSON, plain text, or URL-encoded form.
- **FR-38** These limits apply to a saved request: URL (including query parameters) up to 2,048 characters; up to 20 query parameters; up to 20 headers, each name up to 128 characters and each value up to 4,096 characters; body up to 64 KB. A value over a limit is rejected, the error names the field, and nothing is saved. Separately, any request to the app larger than 1 MB in total is rejected as too large before anything else is checked, and nothing is saved. *(Note for the implementor: do not hardcode these values.)*
- **FR-39** When the admin edits a service, its saved header values are displayed.
- **FR-40** The public view never shows a service's URL, headers, query parameters or body.

### Health, timeouts and retries

A check is healthy by default and fails when one of the conditions below applies. The initial limit values are in FR-57 and may still change.

- **FR-41** A service has a timeout set by the admin, with a default. The timeout covers one whole check attempt: connecting, any redirects (FR-58) and reading the response body. An attempt that is not finished within the timeout counts as failed. *(Reworded in v0.13: the timeout now covers redirects and reading the body, so FR-56 holds.)*
- **FR-42** An HTTP(S) check is healthy only if the final response arrives within the timeout, its status code is 2xx, and no JSON rule matches. Otherwise it is failed. *(Reworded in v0.5: the status code is fixed at 2xx.)*
- **FR-43** *(Removed in v0.5.)* Was: the admin sets which HTTP status codes count as healthy. Replaced by the fixed 2xx in FR-42.
- **FR-44** The admin can define several JSON rules per service. A rule names a field and a value that means failure. The value is text or true/false.
- **FR-45** A JSON number is compared as text. Text matching is case-sensitive.
- **FR-46** A field inside nested JSON is named with dots, for example `checks.db.status`.
- **FR-47** One setting per service decides whether the JSON rules fail the check when any rule matches or only when all rules match.
- **FR-48** If JSON rules are defined and the response is not valid JSON, is empty, or lacks a rule's field, the check is failed.
- **FR-49** A TCP port check is healthy if a connection is accepted within the timeout.
- **FR-50** When the certificate check is on for an HTTPS service (FR-34), the admin sets a minimum number of days left. The check is failed when fewer days remain. *(Reworded in v0.13: the certificate check is an option of the HTTPS check, not a separate type.)*
- **FR-51** A service has a retry count set by the admin. When an HTTP(S) check fails for any reason, including its certificate check, the monitor retries it up to that many times. *(Reworded in v0.13: now covers the certificate check.)*
- **FR-52** When a TCP port check fails for any reason, it is retried in the same way. *(Reworded in v0.6: was "times out". Reworded in v0.13: TCP port only.)*
- **FR-53** A service has a retry interval set by the admin: the wait between one failed attempt and the next retry.
- **FR-54** A service becomes unhealthy only when a check and all its retries have failed. If a retry succeeds, the service stays healthy.
- **FR-55** An unhealthy service becomes healthy after one successful check.
- **FR-56** Saving a service is rejected when its worst-case check time, timeout × (1 + retry count) + retry interval × retry count, is longer than its check interval. The error names the fields, and nothing is saved.
- **FR-57** The check interval, timeout, retry count and retry interval each have a default, a minimum and a maximum. The limits are the same for every service and are set in the deployment configuration, not in the app. The admin sets each service's value within them. A value outside the limits is rejected, the error names the field, and nothing is saved. *(Note for the implementor: do not hardcode the limits.)* Initial values, in seconds except the retry count:

  | Setting | Default | Minimum | Maximum |
  |---|---|---|---|
  | Check interval | 60 | 30 | 86,400 |
  | Timeout | 10 | 1 | 60 |
  | Retry count | 2 | 0 | 5 |
  | Retry interval | 10 | 1 | 300 |
- **FR-58** An HTTP(S) check follows up to 3 redirects, and the saved request's headers are sent with each redirected request. A response that needs more than 3 redirects counts as a failed check. The limit of 3 is the same for every service and is set in the deployment configuration. *(Note for the implementor: do not hardcode the value 3.)*

### Service details

- **FR-59** A service has a name, up to 100 characters, unique among services ignoring case. A name that is missing, too long or already used is rejected, and nothing is saved. *(The length limit is set in the deployment configuration. Note for the implementor: do not hardcode it.)*
- **FR-60** The monitor holds at most 50 services. Adding one beyond the limit is rejected. *(The limit is set in the deployment configuration. Note for the implementor: do not hardcode it.)*
- **FR-61** When a check fails, the service records the reason: timed out, could not connect, non-2xx status (with the code), JSON rule matched (which rule), invalid or missing JSON, too many redirects, or certificate problem. When a JSON rule matches and the status is also non-2xx, the recorded reason is the JSON rule.
- **FR-62** The admin dashboard shows, for each service: name, type, status, time of the last check, time of the last status change, the failure reason when unhealthy, whether alerts are on, and whether it is shown on the public view. *(Extends FR-9.)*
- **FR-63** The public view shows, for each chosen service, its name, status and time of the last check, and nothing else.
- **FR-64** A TLS certificate that is invalid (self-signed, expired or not matching the host) fails an HTTP(S) check, unless the admin has turned on "ignore certificate errors" for that service. The setting is per service and off by default. With it on, certificate errors on that service's connection are ignored, including on redirects. The certificate expiry check (FR-50) is separate: if it is on, it still applies, and an already-expired certificate counts as 0 days left. *(Reworded in v0.15: was no ignore setting.)*
- **FR-65** A service has an unhealthy message and a recovery message set by the admin, each up to 500 characters. A longer message is rejected, and nothing is saved.
- **FR-66** Editing a service, including changing its type, keeps its current state. The next check uses the new settings. No check runs at the moment of saving. *(Reworded in v0.33: type change added.)*
- **FR-67** When a service is added, its first check runs straight after saving.
- **FR-68** A new service is hidden from the public view. The admin shows it with a toggle on the service.
- **FR-69** A service has at most 10 JSON rules. Saving a service with more is rejected, and nothing is saved. *(Note for the implementor: do not hardcode the value 10.)*
- **FR-70** Deleting a service removes it permanently, with its alert list and state. It no longer appears on the admin dashboard or the public view.
- **FR-71** Deleting a service stops its checks and retries, and no alert is sent for it afterwards.
- **FR-72** The admin must confirm before a service is deleted.
- **FR-73** The monitor reads at most 64 KB of a response body, and only when the service has JSON rules. A response over that size counts as not valid JSON (FR-48). *(Note for the implementor: do not hardcode the value 64 KB.)*
- **FR-74** Saving a service is rejected, with the error naming the field and nothing saved, when: an HTTP(S) URL does not start with http or https; a TCP service has no host or a port outside 1 to 65535; a JSON rule has no field; the certificate check or "ignore certificate errors" is on for a URL that is not https; or the minimum days left is below 1. *(Extended in v0.15: "ignore certificate errors" added.)*
- **FR-75** The admin can pause and resume a service.
- **FR-76** While a service is paused, the monitor does not check it and sends no alerts. A check or retry in progress is cancelled.
- **FR-77** A paused service shows as paused on the admin dashboard and is not shown on the public view, whatever its public view toggle says.
- **FR-78** A paused service keeps its state.
- **FR-79** When a service is resumed, a check runs straight away.
- **FR-111** When the app starts again, the saved services and their state are kept, and checks resume straight away for every service that is not paused (FR-78). A service that was unhealthy before the stop and is still unhealthy at its first check sends no new alert. A change of status found at that first check is alerted as usual (FR-21, FR-22). A check or retry sequence that was in progress at the time of the stop starts over.
- **FR-112** A service's status is healthy, unhealthy or not yet checked. A service is not yet checked from when it is added until its first check, including any retries, has finished. While a service is paused, the admin dashboard shows it as paused instead (FR-77).
- **FR-113** The public view shows only services whose status is healthy or unhealthy. A service that is paused or not yet checked is not shown, whatever its public view toggle says.

### Notification target details

- **FR-80** A notification target can have a name.
- **FR-81** A notification target is either an email address or a webhook.
- **FR-82** An email target must be a validly formatted email address. An invalid address is rejected, and nothing is saved.
- **FR-83** A failed delivery to one notification target does not stop delivery to the others on the list.
- **FR-84** A failed delivery does not change the service's status.
- **FR-85** When a delivery to a notification target fails, the monitor retries it up to 3 times, waiting 30 seconds between attempts. An email delivery fails if no SMTP account is configured (the reason says so) or if the SMTP server does not accept it. A webhook delivery fails when the monitor cannot connect, when the receiver's certificate is rejected, on a timeout, or on a non-2xx response. *(Reworded in v0.26: connection and certificate failures added. Reworded in v0.32: missing SMTP account added.)* *(Note for the implementor: do not hardcode the 3 or the 30 seconds.)*
- **FR-86** If all delivery attempts fail, the target shows a "last delivery failed" notice on the admin dashboard. The notice stays until a later delivery to that target succeeds. The monitor keeps sending to that target on later alerts.
- **FR-87** A notification target's name is up to 50 characters. A longer name is rejected, and nothing is saved.
- **FR-88** The same contact (same type and value) cannot appear twice in one service's alert list. A duplicate is rejected, and nothing is saved.
- **FR-89** A webhook target's URL must start with http or https. Any other URL is rejected, and nothing is saved. *(Reworded in v0.16: was https only.)*
- **FR-90** A webhook delivery is an HTTP POST with a JSON body carrying the same content as the email alert (FR-23).
- **FR-91** The monitor waits up to 10 seconds for a webhook to respond. No response in that time is a failed delivery. *(Note for the implementor: do not hardcode the 10 seconds.)*
- **FR-92** A webhook target can have custom headers set by the admin. The limits are those of a service request's headers (FR-38).
- **FR-100** When a webhook URL starts with http, the form tells the admin that the URL and headers are sent unencrypted. The admin can still save it.
- **FR-109** *(Removed in v0.23.)* Was: operations on a service or notification target that does not exist are rejected. Treated as implicit, not a separate requirement.
- **FR-115** A webhook delivery does not follow redirects. A redirect response counts as a non-2xx response, so the delivery fails (FR-85).
- **FR-110** An email address is up to 254 characters, and a webhook URL is up to 2,048 characters. A longer value is rejected, naming the field, and nothing is saved. *(Note for the implementor: do not hardcode the limits.)*

### Times, refresh and health endpoint

- **FR-93** Times in email and webhook alerts are in UTC and say so.
- **FR-94** Times on the admin dashboard and the public view are shown in the viewer's local time.
- **FR-95** The admin dashboard has a refresh button that loads the latest status, and updates itself every 5 minutes, like the public view (FR-30, FR-31). *(Note for the implementor: do not hardcode the 5 minutes.)*
- **FR-96** The app has a health endpoint, reachable without sign-in, that says only whether the app is running. It returns no service data.

### Testing before saving

- **FR-104** While adding or editing a service, the admin can run a test of the check with the settings currently in the form, before saving. The test makes one attempt, with no retries, using the form's timeout, request, JSON rules and certificate settings. It shows healthy or failed and, when failed, the failure reason (FR-61). It also shows how long the attempt took. For an HTTP(S) check it also shows the HTTP status code and the response body of the final response, if the endpoint responded. The body is read up to 64 KB, and a larger body is cut off and says so. This is an exception to FR-73, which reads the body only when JSON rules exist. The body is shown to the signed-in admin only and is not saved. *(Extended in v0.21: status code and body added. Extended in v0.25: duration added.)*
- **FR-105** A test does not touch any saved state. It changes no service's status, last check time, last status change time or failure reason, sends no alerts, and saves nothing, including when editing an existing service.
- **FR-106** If the form's settings are invalid, the test does not run and the errors name the field, the same as when saving (FR-74).
- **FR-107** While adding or editing a notification target, the admin can send a test alert with the settings currently in the form, before saving. It goes only to that target, through the same delivery as a real alert (SMTP for email; the URL and custom headers for a webhook). It makes one attempt with no retries, and shows delivered or failed and, when failed, the reason (FR-85). The content says it is a test and carries the time in UTC (FR-93). A webhook test uses the same JSON body as FR-90.
- **FR-108** A test alert does not touch any saved state. It changes no service's status, sends nothing to any other target, and does not change the "last delivery failed" notice (FR-86). If the form's settings are invalid (FR-82, FR-89), the test does not send and the errors name the field.

## 4. Non-functional requirements

- **NFR-1** Data survives a restart and an upgrade of the app: services, alert lists, settings and current state are all still there afterwards. *(Reworded in v0.17: the admin account is no longer stored data, FR-101.)*
- **NFR-2** The interface works in the latest two versions of Chrome, Firefox, Safari and Edge. It passes when the admin can complete these flows in each of them with no visible layout break and no error in the browser console: sign in, add a service, edit it, pause and resume it, delete it (with confirmation), add a notification target, and open the public dashboard. Checked by hand.
- **NFR-3** On mobile the interface is usable at screen widths down to 360 px. It passes when, at 360 px width, no screen scrolls sideways, every button and field can be reached and used, and no text or control is cut off, across the same flows as NFR-2. Checked by hand.
- **NFR-4** The sign-in form, the add and edit forms for services and notification targets, and the delete confirmation can be used without a mouse. Tab moves through the fields in reading order, Enter submits the form, and the focused field is always visibly marked.

- **NFR-5** The first delivery attempt of an alert starts within 10 seconds of the status change that caused it.
- **NFR-6** Each check starts within 10 seconds of its scheduled time, even while other checks are slow or waiting for their timeout.
- **NFR-7** All content that comes from outside the app is shown as plain text and is never interpreted as HTML or script. This covers response bodies shown by the test (FR-104) and names and messages entered by the admin, on screen and in email alerts.
- **NFR-8** A request that changes data is rejected when it did not come from the app's own pages.

HTTPS for access to the app is covered by FR-97 to FR-99.

## 5. Entities

Product level. Fields in plain words; storage design is not covered here.

**Service.** Owned by the admin (the only user). Holds:
- Name (FR-59).
- Type: HTTP(S) or TCP port (FR-33).
- What to check: for HTTP(S), the saved request (method, URL, query parameters, headers, body type and body; FR-35 to FR-38). For TCP port, host and port.
- Check settings: check interval, timeout, retry count, retry interval (FR-57).
- Health rules: for HTTP(S), the JSON rules and the any-or-all setting (FR-44 to FR-48); for an HTTPS service, whether the certificate is checked and the minimum days left (FR-34, FR-50), and whether certificate errors are ignored (FR-64).
- Alerts: on or off (FR-20), the unhealthy and recovery messages (FR-65), and the alert list.
- Whether it is shown on the public view (FR-27, FR-68).
- Whether it is paused (FR-75).
- Current state: status (healthy, unhealthy or not yet checked; FR-112), time of the last check, time of the last status change, and the reason for the last failure (FR-61).

**Notification target.** Belongs to one service's alert list (up to 5 per service; FR-18, FR-19). Holds an optional name (FR-80), a contact type (email or webhook; FR-81), the contact value, custom headers (webhook only; FR-92), and whether its last delivery failed (FR-86).

Deleting a service removes its alert list and state with it (FR-70).

## 6. Assumptions

- Saved request settings (headers, query parameters, body) may contain credentials. The admin decides what to put in them and is responsible for it. The monitor puts no special protection on them: no required encryption or masking. FR-39 and FR-40 depend on this.
- Checks can point at private or internal addresses, many of which have no HTTPS or use self-signed certificates (FR-64, FR-89).
- Anyone who can reach the sign-in page can lock the admin out for 15 minutes at a time by sending wrong passwords (FR-2). Accepted for version 1. The admin is the only account, and the installer can restart the app to clear a lockout or to apply new credentials (FR-103, FR-114).
- The admin password sits in plaintext in the deployment configuration. The installer is responsible for who can read it. FR-101 depends on this.
- Email alerts need an SMTP account. The installer supplies it through the deployment configuration. FR-81 depends on this.
- The unhealthy and recovery alerts have default messages (FR-22, FR-23). Their wording is not a requirement and is decided when building.

## 7. Out of scope

- Multi-user and SaaS use.
- DNS checks (skipped for now).
- Credentialed checks of databases, Redis and blob storage. These services can only be watched through the TCP port type.
- Request body types for file upload (multipart form data, binary).
- Reading plain-text or form-encoded response bodies. Only JSON response bodies are read.
- A separate slow-response limit. Version 1 has the timeout only.
- JSON rule field paths that go into lists (for example `items[0]`). Only dotted object paths are supported.
- Custom healthy status codes. A check is healthy on 2xx only (FR-42).
- Alert contact types other than email and webhook (SMS, phone, and vendor-specific chat integrations).
- Webhook body formats other than the fixed JSON body in FR-90 (for example Slack or Discord formats, or an admin-written body).
- Built-in HTTPS in the app (certificate and key files). A proxy or platform provides HTTPS (FR-97).
- Editing headers or the body as one block of raw text, and filling the form from a pasted curl command. Version 1 has separate fields only.
- Account creation and password change inside the app (FR-101, FR-103).
- Check history and uptime percentages. Only the current state of each service is kept (section 5). No past results, graphs or uptime figures.
- Maintenance windows (scheduled downtime). The admin can pause a service by hand instead (FR-75).
- Grouping or tags. Services appear as a flat list.
- Data export, import and backup. Keeping the data safe is the installer's job (section 9).
- Repeat alerts while a service stays unhealthy. One alert is sent per status change (FR-21, FR-22).
- The monitor does not monitor itself. If the app stops, nothing is checked and nothing is sent, and no one is told.

## 8. Test profile

The top three ways the product could fail for its users:

1. **An outage the admin is not told about.** A service is down, or fails the admin's definition of healthy, and no alert reaches the admin. It defeats the product's purpose. Requirements involved: FR-10, FR-20, FR-21, FR-48, FR-54, FR-76, FR-85, FR-86, FR-104, FR-107, NFR-5, NFR-6. Accepted as out of scope: the monitor itself stopping (section 7).
2. **Data loss.** Services, alert lists, settings or state are gone after a restart or an upgrade. Requirement involved: NFR-1.
3. **Break-in to the admin login.** Someone other than the admin signs in. Requirements involved: FR-1, FR-2, FR-4, FR-97 to FR-99, FR-101 to FR-103.

A bad experience (a technical user who wants keyboard use and quick entry) is covered by NFR-4, not as one of the three.

The paths where failure costs most:

1. **The check-to-alert chain.** A service is added with alerts on, its first check runs (FR-67), its status changes (FR-21, FR-24) and the alert is delivered (FR-85, FR-86). This is where failure 1 happens, so it gets the heaviest testing. A failure here is silent, and the admin cannot easily notice it.
2. **Restart and upgrade.** After the app comes back, the saved services, alert lists, settings and state are still there (NFR-1).
3. **First start and sign-in.** A missing credential setting stops the app and the error names it (FR-102). The admin can then sign in (FR-1, FR-101).

An accepted risk: the monitor itself stops or stalls, and nobody notices. This costs a lot, but the requirements do not guard against it (section 7). It is covered by a go-live prerequisite instead (section 9).

What counts as a milestone, and the bigger test at each:

- **Milestone 1, basic monitoring.** The admin signs in (FR-1, FR-3, FR-4, FR-101 to FR-103), adds, lists and deletes an HTTP service (FR-6, FR-8, FR-9), checks run (FR-10) and the dashboard shows the status. Bigger test: the whole flow end to end through the browser.
- **Milestone 2, alerting.** Alert lists, email and webhook alerts, status changes, retries and the delivery-failed notice (FR-14 to FR-25, FR-80 to FR-92, FR-107). Bigger test: the full chain of failure 1, from a service going down to the alert arriving, and the failed-delivery cases.
- **Milestone 3, full check settings.** TCP checks, JSON rules, certificate options, redirects, timeouts and retries, pausing, and the tests before saving (FR-33 to FR-79, FR-104 to FR-106). Bigger test: each failure reason (FR-61) produced on purpose, and the limits and validation cases (FR-38, FR-56, FR-74).
- **Milestone 4, public view and health endpoint.** FR-26 to FR-32 and FR-96. Bigger test: the public view as an anonymous visitor, including the rate limit and everything it must not show (FR-40, FR-63).
- **Milestone 5, release hardening.** Lockout, the HTTPS settings, the non-functional requirements (FR-2, FR-97 to FR-99, NFR-1 to NFR-4). Bigger test: a restart and an upgrade with data, the supported browsers, and 360 px screens.

## 9. Go-live prerequisites

Date started is "not started" for every item unless a date is shown.

- **An SMTP account** (FR-81, FR-85). Email alerts cannot be sent without one. The installer supplies it through the deployment configuration. If the sender uses its own domain, verifying it with the email provider can take time. Date started: not started.
- **A domain name pointing at the host** (FR-26 to FR-28, FR-97). Only needed for public installs, for the public status page and a valid HTTPS certificate. On a private network the app can be reached by address. Date started: not started.
- **HTTPS in front of the app** (FR-97 to FR-99). Only needed for public installs. A reverse proxy or the hosting platform provides it, and the "require HTTPS" and "trust the proxy" settings are set to match. Date started: not started.
- **A persistent volume for the app's data** (NFR-1). Without it, data is lost when the container is replaced. Date started: not started.
- **A hosting account, with billing and quotas.** Somewhere to run the container, with enough quota to keep it running continuously. Date started: not started.
- **The admin credentials in the deployment configuration** (FR-101, FR-102). The app does not start without them. Date started: not started.
- **Something outside the app watches it.** For example the hosting platform's health check, or an external monitor pointed at the health endpoint (FR-96). The app does not monitor itself (section 7). Date started: not started.
- **An instance that stays on.** The monitor works in the background on a schedule. A platform that stops an idle container, or scales it to zero, would stop all checks and all alerts. The host needs at least one instance always running, with processing time available when no web request is coming in. Date started: not started.
- **Network reach from the host.** The container must be able to reach every service it checks, including private addresses (which may need a VPN or the same network), and the SMTP server's port. Some hosts block outbound email ports. Date started: not started.

## Open questions

Kept in `open-questions.md`.
