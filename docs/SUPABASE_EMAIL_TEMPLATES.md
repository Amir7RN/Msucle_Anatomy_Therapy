# Zevahealth — Supabase Email Templates

Paste these into **Supabase Dashboard → Authentication → Email Templates**.
Each template lets you set BOTH the subject line and the HTML body.
Supabase substitutes the link / token values via `{{ .ConfirmationURL }}`,
`{{ .Email }}`, `{{ .Token }}` etc.

The HTML below renders well in Gmail, Outlook, Apple Mail, and most
mobile clients (inline CSS only — no external stylesheets, no JS).

---

## 1. Confirm Signup

**Subject:**
```
Welcome to Zevahealth — confirm your email to get started
```

**Body (HTML):**
```html
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#05070d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#05070d;">
      <tr><td align="center" style="padding:32px 16px 8px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;width:100%;background:#0b1220;border-radius:18px;border:1px solid #1e293b;overflow:hidden;">

          <!-- Brand header -->
          <tr><td align="center" style="padding:32px 24px 8px 24px;">
            <!-- Z logo: simple SVG inlined -->
            <div style="display:inline-block;width:56px;height:56px;border-radius:16px;background:rgba(34,211,238,0.10);border:1px solid rgba(34,211,238,0.35);line-height:56px;text-align:center;">
              <span style="color:#22d3ee;font-size:28px;font-weight:700;letter-spacing:-1px;font-family:Georgia,serif;">Z</span>
            </div>
            <h1 style="margin:16px 0 4px 0;color:#f8fafc;font-size:24px;font-weight:700;letter-spacing:-0.4px;">
              Welcome to Zevahealth
            </h1>
            <p style="margin:0;color:#94a3b8;font-size:14px;letter-spacing:0.2px;">
              Move smarter. Feel better.
            </p>
          </td></tr>

          <!-- Hero blurb -->
          <tr><td style="padding:24px 32px 8px 32px;">
            <p style="margin:0 0 12px 0;color:#cbd5e1;font-size:15px;line-height:1.6;">
              You are one click away from your personal AI movement coach.
              Confirm your email and we will save every assessment and
              exercise session so you can track progress over time.
            </p>
          </td></tr>

          <!-- CTA button -->
          <tr><td align="center" style="padding:16px 32px 8px 32px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr><td align="center" bgcolor="#22d3ee" style="border-radius:999px;">
                <a href="{{ .ConfirmationURL }}"
                   style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#05070d;text-decoration:none;border-radius:999px;letter-spacing:0.2px;">
                  Confirm my email
                </a>
              </td></tr>
            </table>
            <p style="margin:14px 0 0 0;color:#64748b;font-size:12px;">
              Or copy &amp; paste this link:
              <br>
              <a href="{{ .ConfirmationURL }}" style="color:#22d3ee;word-break:break-all;">{{ .ConfirmationURL }}</a>
            </p>
          </td></tr>

          <!-- 3-step value prop -->
          <tr><td style="padding:24px 32px 8px 32px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding:8px 8px 8px 0;vertical-align:top;width:33%;">
                  <div style="font-size:22px;line-height:1;color:#22d3ee;">●</div>
                  <div style="margin-top:8px;color:#f8fafc;font-size:13px;font-weight:600;">Pinpoint pain</div>
                  <div style="color:#94a3b8;font-size:12px;line-height:1.5;margin-top:2px;">Map sore spots to specific muscles in 3D.</div>
                </td>
                <td style="padding:8px;vertical-align:top;width:33%;">
                  <div style="font-size:22px;line-height:1;color:#fb923c;">●</div>
                  <div style="margin-top:8px;color:#f8fafc;font-size:13px;font-weight:600;">Measure ROM</div>
                  <div style="color:#94a3b8;font-size:12px;line-height:1.5;margin-top:2px;">Camera-based goniometry in your browser.</div>
                </td>
                <td style="padding:8px 0 8px 8px;vertical-align:top;width:33%;">
                  <div style="font-size:22px;line-height:1;color:#34d399;">●</div>
                  <div style="margin-top:8px;color:#f8fafc;font-size:13px;font-weight:600;">AI form coach</div>
                  <div style="color:#94a3b8;font-size:12px;line-height:1.5;margin-top:2px;">Live, voice-guided correction every rep.</div>
                </td>
              </tr>
            </table>
          </td></tr>

          <!-- Footer -->
          <tr><td style="padding:24px 32px 28px 32px;border-top:1px solid #1e293b;">
            <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
              You received this because someone signed up for Zevahealth with
              this email address. If that was not you, you can safely ignore
              this message — no account will be created.
            </p>
            <p style="margin:16px 0 0 0;color:#475569;font-size:11px;">
              Zevahealth AI — General-purpose movement guidance, not medical advice.
            </p>
          </td></tr>

        </table>

        <p style="margin:16px 0 0 0;color:#475569;font-size:11px;">
          © {{ .Year }} Zevahealth.  Move smarter.  Feel better.
        </p>
      </td></tr>
    </table>
  </body>
</html>
```

---

## 2. Magic Link (passwordless sign-in)

**Subject:**
```
Your Zevahealth sign-in link
```

**Body (HTML):** — same shell as above, replace the hero copy + CTA with:

```html
<p style="margin:0 0 12px 0;color:#cbd5e1;font-size:15px;line-height:1.6;">
  Tap the button below to sign in to Zevahealth.  The link expires in
  one hour and works only on this device.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0">
  <tr><td align="center" bgcolor="#22d3ee" style="border-radius:999px;">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#05070d;text-decoration:none;border-radius:999px;">
      Sign me in
    </a>
  </td></tr>
</table>
```

---

## 3. Password Reset

**Subject:**
```
Reset your Zevahealth password
```

**Body (HTML):** — same shell as above, replace the hero copy + CTA with:

```html
<p style="margin:0 0 12px 0;color:#cbd5e1;font-size:15px;line-height:1.6;">
  We received a request to reset the password on your Zevahealth account.
  Click below to choose a new one.  If you did not request this, ignore
  this email and your current password stays unchanged.
</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0">
  <tr><td align="center" bgcolor="#fb923c" style="border-radius:999px;">
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#05070d;text-decoration:none;border-radius:999px;">
      Reset password
    </a>
  </td></tr>
</table>
```

---

## Marketing copy variants

If you want different tone, here are alternates for the **Confirm Signup**
hero blurb.

**A. Punchy:**
> Sore spots should not be a mystery.  Confirm your email and let
> Zevahealth show you exactly what hurts — and exactly what to do about it.

**B. Practical:**
> One last step.  Confirm your email to unlock your AI movement coach,
> 3D muscle atlas, and personalized exercise tracking — all in your browser.

**C. Aspirational:**
> Better movement starts with one click.  Confirm your account and step
> into your first assessment.  Most users finish their first session in
> under five minutes.

**D. Reassuring (post-injury / pain-aware):**
> Confirm your email to get started with Zevahealth.  Whether you are
> rehabbing, prehabbing, or just trying to move better — we will meet
> you where you are.

---

## Sender branding — REQUIRES custom SMTP

Even with the above templates, the **From** address stays
`noreply@mail.app.supabase.io` on Supabase's default sender, and the
footer "powered by Supabase" cannot be removed.  To send from
`hello@mail.zevahealth.com` with no Supabase branding:

1. Sign up for a transactional email provider — recommended order:
   - **Resend** (cheapest at low volume, easiest setup)
   - **Postmark** (best deliverability)
   - **SendGrid / AWS SES** (high volume)
2. Verify a sending domain (e.g. `mail.zevahealth.com`) — they walk you
   through DKIM + SPF DNS records.
3. Supabase Dashboard → **Authentication → SMTP Settings** →
   **Enable custom SMTP**.
4. Paste the SMTP host / port / username / password from your provider.
5. **Sender email:** `hello@mail.zevahealth.com` (or whatever you set up).
6. **Sender name:** `Zevahealth`.
7. Save.  Test by triggering a sign-up — the email should now arrive
   from "Zevahealth <hello@mail.zevahealth.com>" with no Supabase
   footer.

Until then, the templates above will at least make the email itself
look like it came from Zevahealth, even if the From line says
"noreply@mail.app.supabase.io".

---

## Logo image option

For a real image logo instead of the inline-CSS "Z" rectangle, upload a
PNG (160×160 px on transparent background) to a publicly reachable URL
(e.g. your GitHub Pages site at `https://YOUR-USER.github.io/Msucle_Anatomy_Therapy/zevahealth-icon.png`)
and replace the brand-header block with:

```html
<tr><td align="center" style="padding:32px 24px 8px 24px;">
  <img src="https://YOUR-USER.github.io/Msucle_Anatomy_Therapy/zevahealth-icon.png"
       width="56" height="56" alt="Zevahealth"
       style="display:inline-block;border-radius:16px;border:1px solid rgba(34,211,238,0.35);" />
  ...
</td></tr>
```

Gmail and most clients fetch remote images when the user enables them,
so the inline-CSS fallback is what most recipients will see by default.
