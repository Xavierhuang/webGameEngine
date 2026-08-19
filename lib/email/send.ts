/**
 * Outbound email.
 *
 * There was no mail transport anywhere in the repo, which is why the
 * pending-approval screen used to claim "We've emailed your parent" while
 * sending nothing, and why the parental-consent link had to be handed over by
 * the child. Consent you can't deliver isn't verifiable consent.
 *
 * Transport is chosen by environment so the app never hard-depends on one
 * vendor and never silently pretends to have sent something:
 *   - RESEND_API_KEY  → Resend HTTPS API (no SMTP egress needed on the droplet)
 *   - otherwise       → 'unconfigured', and every caller is told so explicitly
 */

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: 'unconfigured' | 'failed'; detail?: string };

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Required — some mail clients and most filters prefer it. */
  text: string;
  html?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || 'lingplay <noreply@lingcode.dev>';
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Deliberately not a silent no-op: callers surface a manual fallback.
    console.warn('[email] RESEND_API_KEY not set — no email sent to', message.to);
    return { ok: false, reason: 'unconfigured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[email] send failed', response.status, detail.slice(0, 300));
      return { ok: false, reason: 'failed', detail: `HTTP ${response.status}` };
    }

    const data = await response.json().catch(() => ({}));
    return { ok: true, id: data?.id ?? null };
  } catch (error: any) {
    console.error('[email] send threw:', error?.message);
    return { ok: false, reason: 'failed', detail: error?.message };
  }
}

/** The parental-consent request. Written to be read by a busy adult. */
export function parentalConsentEmail(params: {
  childName: string;
  consentUrl: string;
}): Omit<EmailMessage, 'to'> {
  const { childName, consentUrl } = params;

  const text = [
    `${childName} made an account on lingplay, a place where kids build 3D games with code blocks.`,
    '',
    'Because they are under 13, we need your permission before they can share anything publicly.',
    'Until you decide, they can build and play their own games privately.',
    '',
    'Give or decline permission here:',
    consentUrl,
    '',
    'This link works once and expires in 24 hours.',
    '',
    'What you would be agreeing to:',
    '  - They can publish games to a public gallery, where others can play and remix them.',
    '  - We store their username, age, and the games they make.',
    '  - There is no open chat between kids.',
    '  - You can withdraw permission at any time.',
    '',
    'Privacy policy: https://play.lingcode.dev/privacy',
    '',
    'If you were not expecting this, you can ignore this email and nothing will be shared.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;color:#0f172a;line-height:1.6">
      <h2 style="margin:0 0 12px">Permission needed for ${escapeHtml(childName)}</h2>
      <p style="margin:0 0 12px">
        ${escapeHtml(childName)} made an account on <strong>lingplay</strong>, a place where kids
        build 3D games with code blocks.
      </p>
      <p style="margin:0 0 12px">
        Because they're under 13, we need your permission before they can share anything publicly.
        Until you decide, they can build and play their own games privately.
      </p>
      <p style="margin:20px 0">
        <a href="${escapeHtml(consentUrl)}"
           style="background:#0f172a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">
          Review and decide
        </a>
      </p>
      <p style="margin:0 0 12px;color:#475569;font-size:14px">This link works once and expires in 24 hours.</p>
      <ul style="margin:0 0 12px;padding-left:18px;color:#475569;font-size:14px">
        <li>They can publish games to a public gallery, where others can play and remix them.</li>
        <li>We store their username, age, and the games they make.</li>
        <li>There is no open chat between kids.</li>
        <li>You can withdraw permission at any time.</li>
      </ul>
      <p style="margin:0;color:#64748b;font-size:13px">
        <a href="https://play.lingcode.dev/privacy" style="color:#64748b">Privacy policy</a>
        &middot; If you weren't expecting this, ignore this email and nothing will be shared.
      </p>
    </div>`;

  return { subject: `Permission needed for ${childName} on lingplay`, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
