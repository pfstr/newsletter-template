import { Hono } from "hono";
import { sendEmail } from "./email";
import { signupPage, adminPage, messagePage } from "./html";

type Bindings = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  ADMIN_TOKEN?: string;
  FROM_NAME?: string;
  FROM_EMAIL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const unsubUrl = (origin: string, token: string) =>
  `${origin}/unsubscribe?t=${encodeURIComponent(token)}`;

// Read JSON or form-encoded bodies transparently.
async function readParams(c: any): Promise<Record<string, string>> {
  const ct = c.req.header("content-type") || "";
  const raw = ct.includes("application/json")
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody().catch(() => ({}));
  return raw as Record<string, string>;
}

// --- Public: hosted signup form ---
app.get("/", (c) => c.html(signupPage()));

// --- Public: subscribe (single opt-in) ---
app.post("/api/subscribe", async (c) => {
  const p = await readParams(c);
  const email = String(p.email ?? "").trim().toLowerCase();
  const name = String(p.name ?? "").trim().slice(0, 100);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return c.json({ ok: false, error: "invalid_email" }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO subscribers (email, name, status, unsub_token)
     VALUES (?1, ?2, 'subscribed', ?3)
     ON CONFLICT(email) DO UPDATE SET
       status = 'subscribed',
       name = COALESCE(excluded.name, subscribers.name)`,
  ).bind(email, name || null, crypto.randomUUID()).run();
  return c.json({ ok: true });
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
