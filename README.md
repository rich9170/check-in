# Parkview Counseling — Waiting-Room Check-In Kiosk

A tablet kiosk for the Parkview Counseling waiting room. A client taps their
therapist's card, confirms, and the therapist is emailed that the client has
arrived. Therapist names + headshots are pulled automatically from
[parkviewcounseling.org](https://www.parkviewcounseling.org). Therapist email
addresses are kept private on the backend and are never exposed to the kiosk.

> **Stack note:** This build runs on the Emergent platform stack —
> **React (frontend)** + **FastAPI / Python (backend)** + **MongoDB**, with
> **Resend** for email and a Python scraper (instead of Node/Express +
> cheerio). The behavior matches the original spec exactly. The four numbered
> setup sections below are the deliverables.

---

## 1. How to add or update therapist email addresses

Therapist emails live in **`backend/therapist_emails.py`**.

```python
THERAPIST_EMAILS = {
    "rich-maier": "rich@parkviewcounseling.org",
    "steph-maier": "steph@parkviewcounseling.org",
    "cristina-dunahoo": "cristina@parkviewcounseling.org",
    # "new-therapist-slug": "their-email@parkviewcounseling.org",
}
```

- **The key is the therapist's URL slug** from `parkviewcounseling.org/team/<slug>`
  (e.g. `https://www.parkviewcounseling.org/team/rich-maier` → `"rich-maier"`).
  The slug is auto-derived from the therapist's name: lowercase, spaces become
  hyphens. *Cristina Dunahoo* → `cristina-dunahoo`.
- **The value is the email address** that should be notified for that therapist.

**After editing:**
1. Save the file.
2. Restart the backend so changes load:
   ```bash
   sudo supervisorctl restart backend
   ```
   *(On Vercel/other hosts: redeploy.)*

**Alternative (no code edit):** set the `THERAPIST_EMAILS_JSON` environment
variable to a JSON object, e.g.
`{"rich-maier":"rich@parkviewcounseling.org"}`. It is merged on top of the file.

**If a therapist has no email yet:** the kiosk shows the friendly
*"Something went wrong — please use your portal"* screen, and the backend logs a
`NO_EMAIL_MAPPING` failure (see `/var/log/parkview_kiosk.log` or
`GET /api/admin/failures`). Emails are **never** sent to the frontend.

---

## 2. How to set up the Resend email service from scratch

1. **Create an account** at <https://resend.com> (free tier is fine).
2. **Get an API key:** Resend dashboard → **API Keys** → **Create API Key**.
   It starts with `re_...`. Copy it.
3. **Verify your sending domain** so emails come from `@parkviewcounseling.org`:
   - Dashboard → **Domains** → **Add Domain** → enter `parkviewcounseling.org`.
   - Resend shows DNS records (an `MX` + several `TXT` records for SPF/DKIM,
     and a DMARC record). Add these in your domain's DNS provider
     (e.g. Cloudflare, GoDaddy, Namecheap).
   - Wait for Resend to mark the domain **Verified** (usually minutes, up to a
     few hours). Until verified, Resend only delivers to your own verified
     address.
4. **Set the environment variables** in **`backend/.env`**:
   ```
   RESEND_API_KEY=re_your_api_key_here
   FROM_EMAIL=checkin@parkviewcounseling.org
   ```
   - `RESEND_API_KEY` — the key from step 2.
   - `FROM_EMAIL` — any address **on your verified domain**.
5. **Restart the backend:**
   ```bash
   sudo supervisorctl restart backend
   ```

**Test mode:** if `RESEND_API_KEY` / `FROM_EMAIL` are blank, the kiosk still
works end-to-end but **logs the email instead of sending it** (look for
`[TEST MODE] Would email …` in the backend logs). Fill in the keys to send live.

**Email that gets sent**
- **Subject:** `Client has checked in at Parkview Counseling`
- **Body:**
  > A client has checked in at the Parkview Counseling kiosk and is waiting in
  > the waiting area.
  > Checked in at: *[timestamp in Eastern Time]*
  > — Parkview Counseling kiosk

---

## 3. How to deploy and run on an Android tablet in kiosk mode

### Deploy the app
- **On Emergent:** use the in-app **Deploy** button — you get a preview/production
  URL automatically.
- **On Vercel (full-stack equivalent):** push the repo and import it. Set the
  env vars (`RESEND_API_KEY`, `FROM_EMAIL`, optionally `THERAPIST_EMAILS_JSON`,
  plus `MONGO_URL`/`DB_NAME`) in Vercel → Project → Settings → Environment
  Variables. You'll get a URL like `parkview-kiosk-xyz.vercel.app`.
- The random subdomain is fine — only the operator ever sees the URL.

### Option A — Android built-in "App Pinning" (free, simplest)
1. On the tablet: **Settings → Security → App pinning** → turn **On**.
2. Open Chrome, go to the kiosk URL, and (recommended) **Add to Home screen**
   so it opens fullscreen with no address bar.
3. Open Recents, tap the app's icon, choose **Pin**.
4. To unpin (staff only): hold **Back + Overview** together.

### Option B — Fully Kiosk Browser (most locked-down)
1. Install **Fully Kiosk Browser** from the Play Store.
2. **Settings → Start URL** → your kiosk URL.
3. Enable: **Kiosk Mode (PLUS)**, **Disable Status Bar**, **Disable Navigation Bar**,
   **Disable Hardware Keys / Back button**, and **Prevent Swipe Down** /
   **Disable swipe gestures**.
4. **Web Content Settings:** disable pinch-to-zoom; the app already disables
   zoom, text selection, and the context menu.
5. **Screen-on/off:** under **Device Management → Screen** set
   **Keep Screen On = On** (or **Screen Off Timer** for after-hours), and enable
   **Screen Saver / Motion Detection** to wake on approach if desired.
6. **Movement / re-launch:** enable **Auto Reload on Idle** and
   **Restart App on Crash** so the kiosk always returns to the home screen.

### Built-in kiosk behaviors (already in the app)
- Inactivity reset: after **60 seconds** on any non-home screen, returns home.
- Success screen auto-returns home after **12 seconds**; error screen too.
- Text selection, right-click/context menu, and pinch/zoom are disabled.
- No exit button is shown to clients.

> Tip: Fully Kiosk is overkill for most lobbies — Android's free **App Pinning**
> (Option A) is usually enough.

---

## 4. How the auto-sync from parkviewcounseling.org works

- On load, the kiosk calls `GET /api/therapists`. The backend fetches the
  Parkview site, extracts each therapist's **name + headshot**, and returns a
  JSON list. (The public site is a React app, so the roster is read from its
  served JS bundle — names, credentials, and `/images/team/*` photos.)
- **Cache TTL = 1 hour.** Results are cached server-side; repeat loads within the
  hour are served from cache so we never hammer the main site.
- **Hidden refresh gesture (operator):** **long-press (~0.7s)** the small,
  faded refresh icon in the **bottom-right corner**. This forces an immediate
  re-fetch (`?refresh=true`) — use it right after editing the team page or
  email map.
- **Fallback if the site is unreachable:** the backend returns the most recent
  cached snapshot (`source: "stale-cache"`). If there is **no cache yet**, the
  kiosk shows *"Kiosk is initializing — please use the portal to check in"* and
  logs the failure server-side.

### Where failures are logged
- Console (backend logs) **and** `/var/log/parkview_kiosk.log` (rotating file).
- Recent failures are also available at `GET /api/admin/failures` for quick review.
- Clients never see a stack trace or technical error — only the friendly screen.

---

## API reference (internal)
| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/api/therapists?refresh=<bool>` | Public roster (no emails). |
| `POST` | `/api/checkin` `{ "slug": "rich-maier" }` | Look up email, send notification. |
| `GET`  | `/api/admin/failures` | Recent kiosk failures (operator). |
