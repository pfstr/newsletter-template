// Email delivery via Resend (https://resend.com). Swap this file to bring your
// own SMTP/SES — the rest of the app only calls sendEmail().

export interface MailEnv {
  RESEND_API_KEY?: string;
  FROM_NAME?: string;
  FROM_EMAIL?: string;
}

export async function sendEmail(
  env: MailEnv,
  opts: { to: string; subject: string; html: string; unsubUrl: string },
): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const from = `${env.FROM_NAME || "Newsletter"} <${env.FROM_EMAIL || "onboarding@resend.dev"}>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      // Native "Unsubscribe" button in Gmail/Outlook (RFC 8058).
      headers: {
        "List-Unsubscribe": `<${opts.unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}
