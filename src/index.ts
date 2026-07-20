import { Hono } from "hono";
import { cors } from "hono/cors";
import { sendEmail, isEmailConfigured } from "./email";
import { signupPage, embedPage, adminPage, messagePage } from "./html";

type Bindings = {
  DB: D1Database;
  ADMIN_TOKEN?: string;
  FROM_NAME?: string;
  FROM_EMAIL?: string;
  DOUBLE_OPT_IN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const unsubUrl = (origin: string, token: string) =>
  `${origin}/unsubscribe?t=${encodeURIComponent(token)}`;
const confirmUrl = (origin: string, token: string) =>
  `${origin}/confirm?t=${encodeURIComponent(token)}`;

// Verify a Cloudflare Turnstile token server-side. Only enforced when a secret
// is configured; otherwise signups pass through (feature is opt-in).
async function turnstileOk(secret: string, token: string, ip?: string): Promise<boolean> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  }).catch(() => null);
  if (!res) return false;
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  return data.success === true;
}

// Plain confirmation email for double opt-in.
const confirmEmailHtml = (link: string) =>
  `<p>Please confirm your subscription by clicking the link below:</p>
   <p><a href="${link}">Confirm my subscription</a></p>
   <p>If you didn't request this, you can ignore this email.</p>`;

// Read JSON or form-encoded bodies transparently.
async function readParams(c: any): Promise<Record<string, string>> {
  const ct = c.req.header("content-type") || "";
  const raw = ct.includes("application/json")
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody().catch(() => ({}));
  return raw as Record<string, string>;
}

// --- Public: hosted signup form ---
app.get("/", (c) => c.html(signupPage(c.env.TURNSTILE_SITE_KEY)));

// --- Public: bare form for iframe/script embedding on your own site ---
app.get("/embed", (c) => c.html(embedPage(c.env.TURNSTILE_SITE_KEY)));

// Allow the subscribe endpoint to be called from your own website's domain.
app.use("/api/subscribe", cors());

// --- Public: subscribe (single or double opt-in, per DOUBLE_OPT_IN) ---
app.post("/api/subscribe", async (c) => {
  const p = await readParams(c);
  const email = String(p.email ?? "").trim().toLowerCase();
  const name = String(p.name ?? "").trim().slice(0, 100);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return c.json({ ok: false, error: "invalid_email" }, 400);
  }

  // Bot protection (only when Turnstile is configured).
  if (c.env.TURNSTILE_SECRET_KEY) {
    const token = String(p["cf-turnstile-response"] ?? p.token ?? "");
    const ok = await turnstileOk(c.env.TURNSTILE_SECRET_KEY, token, c.req.header("CF-Connecting-IP"));
    if (!ok) return c.json({ ok: false, error: "failed_captcha" }, 400);
  }

  const doubleOptIn = String(c.env.DOUBLE_OPT_IN ?? "").toLowerCase() === "true";

  if (doubleOptIn) {
    // Double opt-in needs email configured to send the confirmation link.
    if (!isEmailConfigured(c.env)) {
      return c.json({ ok: false, error: "email_not_configured" }, 400);
    }
    // Insert as pending; never downgrade an already-subscribed address.
    const row = await c.env.DB.prepare(
      `INSERT INTO subscribers (email, name, status, unsub_token, confirm_token)
       VALUES (?1, ?2, 'pending', ?3, ?4)
       ON CONFLICT(email) DO UPDATE SET
         name = COALESCE(excluded.name, subscribers.name),
         status = CASE WHEN subscribers.status = 'subscribed' THEN 'subscribed' ELSE 'pending' END,
         confirm_token = CASE WHEN subscribers.status = 'subscribed' THEN subscribers.confirm_token ELSE excluded.confirm_token END
       RETURNING status, confirm_token`,
    ).bind(email, name || null, crypto.randomUUID(), crypto.randomUUID())
      .first<{ status: string; confirm_token: string | null }>();

    // Already subscribed -> nothing to confirm.
    if (row?.status !== "pending" || !row.confirm_token) return c.json({ ok: true });

    const origin = new URL(c.req.url).origin;
    try {
      await sendEmail(c.env, {
        to: email,
        subject: "Please confirm your subscription",
        html: confirmEmailHtml(confirmUrl(origin, row.confirm_token)),
        unsubUrl: unsubUrl(origin, row.confirm_token),
      });
    } catch {
      return c.json({ ok: false, error: "confirmation_send_failed" }, 502);
    }
    return c.json({ ok: true, pending: true });
  }

  // Single opt-in: active immediately.
  await c.env.DB.prepare(
    `INSERT INTO subscribers (email, name, status, unsub_token)
     VALUES (?1, ?2, 'subscribed', ?3)
     ON CONFLICT(email) DO UPDATE SET
       status = 'subscribed',
       name = COALESCE(excluded.name, subscribers.name)`,
  ).bind(email, name || null, crypto.randomUUID()).run();
  return c.json({ ok: true });
});

// --- Public: confirm a double opt-in subscription ---
app.get("/confirm", async (c) => {
  const token = c.req.query("t") || c.req.query("token") || "";
  if (token) {
    await c.env.DB.prepare(
      `UPDATE subscribers SET status = 'subscribed', confirm_token = NULL
       WHERE confirm_token = ?1 AND status = 'pending'`,
    ).bind(token).run();
  }
  return c.html(messagePage("You're subscribed!", "Thanks for confirming — you're all set."));
});

// --- Public: one-click unsubscribe (GET link in the email + RFC 8058 POST) ---
app.on(["GET", "POST"], "/unsubscribe", async (c) => {
  const token = c.req.query("t") || c.req.query("token") || "";
  if (token) {
    await c.env.DB.prepare(
      `UPDATE subscribers SET status = 'unsubscribed' WHERE unsub_token = ?1`,
    ).bind(token).run();
  }
  if (c.req.method === "POST") return c.text("unsubscribed");
  return c.html(messagePage("You've been unsubscribed.", "You won't receive further emails."));
});

// --- Admin compose page (a form only; sending requires the token below) ---
app.get("/admin", (c) => c.html(adminPage()));

// --- Protected: send a campaign ---
app.post("/api/send", async (c) => {
  if (!c.env.ADMIN_TOKEN || c.req.header("x-admin-token") !== c.env.ADMIN_TOKEN) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  // Signups work with zero config; sending needs your own email provider wired
  // up in src/email.ts. Fail clearly until then.
  if (!isEmailConfigured(c.env)) {
    return c.json({ ok: false, error: "email_not_configured" }, 400);
  }
  const { subject, html, testEmail } = await c.req.json<{
    subject?: string; html?: string; testEmail?: string;
  }>().catch(() => ({} as any));
  if (!subject || !html) return c.json({ ok: false, error: "missing_subject_or_html" }, 400);

  const origin = new URL(c.req.url).origin;
  const render = (h: string, token: string, email: string) =>
    h.replaceAll("{{unsubscribe_url}}", unsubUrl(origin, token)).replaceAll("{{email}}", email);

  // Test send: only to the given address, using a throwaway token.
  if (testEmail) {
    if (!EMAIL_RE.test(testEmail)) return c.json({ ok: false, error: "invalid_test_email" }, 400);
    const t = crypto.randomUUID();
    await sendEmail(c.env, { to: testEmail, subject, html: render(html, t, testEmail), unsubUrl: unsubUrl(origin, t) });
    return c.json({ ok: true, test: true });
  }

  const { results } = await c.env.DB.prepare(
    `SELECT email, unsub_token FROM subscribers WHERE status = 'subscribed'`,
  ).all<{ email: string; unsub_token: string }>();

  let sent = 0, failed = 0;
  for (const r of results) {
    try {
      await sendEmail(c.env, {
        to: r.email,
        subject,
        html: render(html, r.unsub_token, r.email),
        unsubUrl: unsubUrl(origin, r.unsub_token),
      });
      sent++;
    } catch {
      failed++;
    }
  }
  await c.env.DB.prepare(
    `INSERT INTO campaigns (subject, sent_count, fail_count) VALUES (?1, ?2, ?3)`,
  ).bind(subject, sent, failed).run();

  return c.json({ ok: true, sent, failed });
});

export default app;
