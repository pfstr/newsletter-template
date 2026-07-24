# Changelog

All notable changes to this template are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

Updating a deployed copy: see the [Updating](README.md#updating) section in
the README.

## [1.3.0] - 2026-07-24

### Added

- New-subscriber notification: set `NOTIFY_EMAIL` to your own address to get
  a short email whenever a subscription becomes active — on a single opt-in
  signup, or when a double opt-in is confirmed. Off unless the variable is
  set; delivery is best-effort and never affects the subscriber-facing flow.

## [1.2.1] - 2026-07-23

### Fixed

- A failing `sendEmailBatch()` no longer sinks the whole delivery run: the
  queue drain falls back to per-email `sendEmail()` within the same run, and
  delivery errors are logged (visible in `wrangler tail`) instead of being
  swallowed silently. Previously a broken batch adapter burned all three
  retry attempts without delivering a single email.

## [1.2.0] - 2026-07-23

### Added

- Localizable email texts: `FOOTER_TEXT` and `UNSUBSCRIBE_LABEL` override the
  compliance footer's default English wording; `CONFIRM_SUBJECT` and
  `CONFIRM_HTML` (with a `{{confirm_url}}` merge tag) replace the
  double-opt-in confirmation email.

### Fixed

- Outgoing emails are wrapped in a minimal HTML document with an explicit
  UTF-8 charset, so mail clients no longer garble umlauts and other non-ASCII
  characters. Emails that already contain a full `<html>` document are left
  untouched.

## [1.1.0] - 2026-07-23

Queued background sending — any list size on any plan.

### Added

- **Send queue (outbox)** — `POST /api/send` stores the campaign and returns
  immediately; a minutely background job delivers `SEND_BATCH` emails per run
  (default 40, sized for the free plan's subrequest limits). A 1,000-recipient
  campaign completes in ~25 minutes on the free plan.
- **Retries + crash safety** — up to 3 attempts per recipient; rows claimed by
  a crashed run are reclaimed after 10 minutes; atomic claims mean overlapping
  runs can never double-send.
- **Opt-out cancellation** — unsubscribing also cancels that address's
  queued-but-undelivered emails.
- **Optional batch adapter** — export `sendEmailBatch()` from `src/email.ts`
  (commented example in the file) to deliver up to ~1,000 emails per API call;
  with it even the free plan finishes big lists in minutes.
- `SEND_BATCH` variable on the deploy screen.

### Changed

- `POST /api/send` responds `{ ok, queued }` instead of `{ ok, sent, failed }`;
  delivery progress lands in the `campaigns` table (`sent_count`/`fail_count`).
- The Worker cron runs every minute now (queue drain); the RSS feed check
  keeps its 15-minute cadence internally. RSS posts go through the same queue.
- Migration `0003_outbox.sql` (append-only): `outbox` table plus
  `campaigns.body_html` / `campaigns.base_url`.

## [1.0.0] - 2026-07-23

First stable release. From here on, `sendEmail()` / `isEmailConfigured()`
([src/email.ts](src/email.ts)) and `EXTRA_FIELDS` ([src/fields.ts](src/fields.ts))
are stable API: breaking changes to them only happen in a new major version,
with an upgrade guide. Shipped database migrations are never modified — only
new ones are added.

### Added

- **Signup** — hosted form (`/`), embeddable form (`/embed`), JSON API
  (`POST /api/subscribe`), optional name field, user-definable extra fields
  (`src/fields.ts`) stored as JSON
- **Sending** — `/admin` compose page and `POST /api/send` (test send +
  broadcast) with merge tags `{{name}}`, `{{email}}`, `{{unsubscribe_url}}`
- **Provider-agnostic email adapter** (`src/email.ts`) — bring your own sender;
  collecting subscribers works with zero configuration
- **Double opt-in** *(optional, `DOUBLE_OPT_IN`)* — confirmation email before a
  subscriber becomes active
- **Bot protection** *(optional)* — Cloudflare Turnstile on the signup forms
- **RSS auto-send** *(optional)* — cron trigger emails new feed posts;
  first-run baseline, per-post dedup
- **Compliance built in** — automatic footer with unsubscribe link and postal
  address (`SENDER_ADDRESS`) on every email; RFC 8058 one-click unsubscribe
  headers on every send; scanner-proof unsubscribe confirmation page; personal
  data scrubbed on opt-out; consent audit trail (`confirmed_at`,
  `unsubscribed_at`); optional `PRIVACY_URL` link under the signup form
