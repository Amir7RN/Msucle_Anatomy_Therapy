# Launch guide — zeva.health (.health compliance + security)

This covers what the `.health` registry requires and the security hardening for a
public launch. Items marked **[done in code]** are already implemented in this repo;
items marked **[you do]** are account/hosting steps only you can perform.

## 1. SSL / TLS (required by .health)
- **[done in code]** `index.html` force-redirects any `http://` load to `https://`.
- **[you do]** In your GitHub repo → **Settings → Pages**, set your custom domain
  (`zeva.health`) and tick **Enforce HTTPS**. GitHub provisions a free Let's Encrypt
  certificate automatically (can take a few minutes to an hour after the DNS points
  at GitHub). That certificate satisfies the .health SSL requirement.
- If you later move to Netlify or Cloudflare Pages, `public/_headers` adds HSTS and
  other security headers automatically (GitHub Pages ignores that file).

## 2. Owner name + contact (required by .health)
- **[done in code]** The footer now clearly shows: **Amirreza Naseri · Waltham, MA,
  USA · amir73rn@gmail.com** (mailto link).
- **How much to reveal:** the policy is satisfied by **any one** of email, phone, or
  postal address plus your name. A visible **name + email is enough** — you do NOT
  need to publish your full street/apartment address. I used name + city/state +
  email. If you'd rather show a phone number or a full address instead, tell me.

## 3. Clinical data must cite sources (required by .health)
- **[done in code]** The footer cites the standard references the muscle/movement
  content is based on (Kendall, *Muscles: Testing and Function*; Neumann,
  *Kinesiology of the Musculoskeletal System*).
- **[done in code]** A clear **medical disclaimer** states the content is
  informational, is not medical advice, and is not a substitute for a professional.

## 4. Pharmacy / prohibited practices
- Not applicable — the site sells no prescription drugs (no LegitScript needed) and
  makes no miracle-cure / designer-drug / psychoactive claims. The disclaimer keeps
  claims appropriately hedged.

## 5. Hide the AI (Anthropic) API key — the real exposure
**Background:** every `VITE_*` variable is inlined into the public JS bundle, so a
key put there is trivially extractable. The old `VITE_ANTHROPIC_API_KEY` fallback
was **removed [done in code]** for that reason.

**The app no longer asks visitors for a key** — every AI feature (triage chat,
workout coach, camera load detection) calls a server proxy, so users just use the
platform. Until the proxy is deployed those sections show a friendly "being set up"
notice; **everything non-AI works regardless.** Deploying the proxy is the single
step that turns the AI on for everyone:
- **Server proxy [done in code, you deploy]:** run the AI on *your* key without
  shipping it. A Supabase Edge Function (`supabase/functions/anthropic-proxy/index.ts`)
  holds the key server-side.
- **Local testing only:** during `npm run dev` you can put `VITE_ANTHROPIC_API_KEY`
  in `.env.local` to exercise the AI without the proxy — it's read only in dev mode
  and can never reach the production build.

  Deploy it once:
  ```bash
  supabase functions deploy anthropic-proxy --no-verify-jwt
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-real-key
  supabase secrets set ALLOWED_ORIGIN=https://zeva.health
  ```
  Then set in your site build (GitHub Actions env / repo variable, NOT a secret baked
  as a key — this is just the public function URL):
  ```
  VITE_LLM_PROXY_URL=https://<your-project-ref>.functions.supabase.co/anthropic-proxy
  ```
  With that set, both the triage chat and the workout coach call the proxy, the key
  entry prompt disappears, and the key never touches the browser. Add rate limiting
  on the function if you expect real traffic (Supabase supports this) so a scraper
  can't run up your bill even without the key.

## 6. General security hardening
- **[done in code]** No `dangerouslySetInnerHTML` / raw HTML injection anywhere; all
  chat/user text is rendered as text (React auto-escapes), so an attacker can't make
  the AI or a form inject clickable links or scripts.
- **[done in code]** `Referrer-Policy` meta + HTTPS redirect in `index.html`.
- **[done in code]** A ready **Content-Security-Policy** is included two ways:
  - commented in `index.html` (works on GitHub Pages via `<meta>`), and
  - active in `public/_headers` (Netlify/Cloudflare only).
  It is left OFF by default because a wrong CSP can blank the page — MediaPipe
  (jsdelivr + Google Storage), Supabase, Anthropic and the TURN relay must all be
  allow-listed. **To enable on GitHub Pages:** uncomment the `<meta http-equiv=
  "Content-Security-Policy" …>` block in `index.html`, run `npm run dev`, and confirm
  the 3D pose/camera, sign-in, AI chat, and remote call all still work before shipping.
- **[you do]** Keep `.env.local` out of git (it already is via `.gitignore`), and
  rotate any key that was ever pasted into a shared machine.

## 7. Pointing GitHub Pages at zeva.health (when you've bought it)
When you own the domain, ping me and I'll set it up, but the outline is:
1. Add a `public/CNAME` file containing `zeva.health` (so the domain survives deploys).
2. At your domain registrar, add DNS records pointing to GitHub Pages:
   - `A` records for the apex `zeva.health` → GitHub's four IPs
     (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153), and/or
   - a `CNAME` for `www.zeva.health` → `<your-github-username>.github.io`.
3. In **Settings → Pages**, enter `zeva.health` and enable **Enforce HTTPS**.
