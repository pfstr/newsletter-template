# Newsletter

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pfstr/newsletter-template)

A complete, self-hosted newsletter on your own Cloudflare account: a signup
form, one-click unsubscribe, and a simple page to send an email campaign to
your subscribers. **You own the data** (Cloudflare D1). Bring your own email
sender — [Resend](https://resend.com) by default.

No servers, no monthly SaaS bill: it runs on Cloudflare Workers + D1 and stays
comfortably inside the free tier for small and medium lists.

## What you get

- **Signup** — a hosted form at `/` plus a `POST /api/subscribe` endpoint you can embed anywhere
- **One-click unsubscribe** — RFC 8058 compliant, with a per-subscriber token
- **Send** — a `/admin` page: paste a subject + HTML, send a test to yourself, then send to everyone
- **Your data** — subscribers live in a D1 database on *your* account, exportable any time

## Getting started

Click **Deploy to Cloudflare** above. Cloudflare creates the D1 database,
applies the schema, deploys the Worker, and puts a copy of this repo on your
account (with CI — every push redeploys).

## After deploying (3 steps to send real email)

1. **Add your email sender.** Create a [Resend API key](https://resend.com/api-keys), then:

   ```
   npx wrangler secret put RESEND_API_KEY
   ```

2. **Protect the send endpoint.** Pick any long random string and set it:

   ```
   npx wrangler secret put ADMIN_TOKEN
   ```

3. **Set your from-address** in `wrangler.json` (`FROM_NAME`, `FROM_EMAIL`) and
   **verify that domain in Resend**. This last step is what makes your email
   actually land in inboxes — it can't be skipped.

That's it. Open `https://<your-worker>.workers.dev/admin`, paste your `ADMIN_TOKEN`,
write an email, send a test to yourself, then send to your list.

## Collecting subscribers

Embed the signup form on your own site by POSTing to your endpoint:

```html
<form onsubmit="event.preventDefault();
  fetch('https://<your-worker>.workers.dev/api/subscribe', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email: this.email.value })
  }).then(()=>this.reset());">
  <input name="email" type="email" placeholder="you@example.com" required />
  <button>Subscribe</button>
</form>
```

Import an existing list with `npx wrangler d1 execute newsletter-template-db --remote --command "..."`.

## Local development

```
npm install
npm run dev        # applies the schema to a local D1, then starts Wrangler
```

## Notes & limits (honest)

- **Single opt-in by default** — simplest to start. For CH/EU compliance consider
  double opt-in (a confirmation email before `status = 'subscribed'`).
- **Sending is a simple loop** — great for up to a few hundred recipients per send
  (Cloudflare Workers subrequest limits). For larger lists, batch the send via
  [Cloudflare Queues](https://developers.cloudflare.com/queues/).
- **Deliverability is your domain's** — verify your sending domain in Resend
  (SPF/DKIM). The one-click deploy provisions the backend; it can't verify your domain for you.

## License

MIT
