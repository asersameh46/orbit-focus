# Orbit Focus

A personal focus dashboard with a session timer, saved progress, rewards, an optional shared leaderboard and friend requests, a Gemini-powered coach, five color themes, dark/light display modes, and synthesized sound effects.

Use **My profile** in the app to create an email/password account or sign in on another device. The profile page lets signed-in users change their display name and view account-level focus sessions, time, credits, and recent session history. Sessions saved on the current device are synced when an account signs in. Anonymous leaderboard users can upgrade their temporary account to an email/password account.

## Run locally

Python 3.7 or newer is the only requirement for the local web server:

```powershell
python server.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Stop the server with `Ctrl+C`.

The timer, theme, sound preference, and rewards are stored in the browser on this device. The coach uses guided local replies unless a Gemini key is configured. Run the focused tests with `node --test`.

## Configure the shared leaderboard and online Gemini coach

GitHub Pages hosts the static app; Supabase provides anonymous sign-in, the shared leaderboard, and a server-side Gemini function. Setup requires a Supabase project:

1. In Supabase, enable **Anonymous Sign-Ins** under Authentication providers.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor.
3. Protect anonymous sign-ins with CAPTCHA under **Authentication → Protection**. Create a Cloudflare Turnstile widget for your website hostname, set its secret in Supabase, and put its public site key in `backend-config.js`. The app requests a CAPTCHA token before creating an anonymous account.
4. Add `GEMINI_API_KEY` under **Project Settings → Edge Functions → Secrets**. Keep the key in Supabase only; never commit it or put it in `backend-config.js`.
5. Deploy the Edge Function with the Supabase CLI:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy coach
   ```

   Optionally set `GEMINI_MODEL` as a Supabase secret; the function defaults to `gemini-3.5-flash-lite`.
6. Put the Supabase **Project URL**, **publishable key**, and Turnstile **site key** in `backend-config.js`. These values are public browser configuration; never put the Gemini key, CAPTCHA secret, or a Supabase service-role/secret key in that file.
7. Push this project to a GitHub repository on its `main` or `master` branch. In the repository settings, enable **Pages → Source: GitHub Actions**. The workflow at `.github/workflows/pages.yml` publishes the static site after a push.

Leaderboard participation is optional. Only the chosen display name and score are public; joining creates a private anonymous account without an email address. Friends are added by sharing a private friend code; requests must be accepted, and either person can remove the friendship. Friend lists and requests are only visible to the signed-in accounts involved. Leaving deletes the profile, leaderboard session records, and friend relationships. Clearing browser storage can make an anonymous account unrecoverable. Points are awarded by the client when it reports a completed timer, so they can be gamed; the leaderboard is for fun, not prizes or high-stakes competition.

To enable friend requests, account profiles, and cross-device statistics on an existing Supabase project, run the updated [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL Editor. This adds friend codes, private friend-request functions, and account statistics while keeping table access restricted to the app's authenticated RPCs.

Coach messages and the current focus-session context are sent to Gemini through Supabase when configured. Without cloud configuration, the app falls back to local coach replies. For local Gemini testing only, set `GEMINI_API_KEY` before starting `server.py`.

## Promo video

Open [`promo.html`](./promo.html) and select **Download promo video** to create a 16-second, 16:9 WebM promo in a browser that supports MediaRecorder. The promo link is also available in the app footer.
