# Changelog

All notable changes to this template are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

Updating a deployed copy: see the [Updating](README.md#updating) section in
the README.

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
