# PRD — Parkview Counseling Check-In Kiosk

## Original Problem Statement
Tablet waiting-room kiosk for Parkview Counseling. Clients tap a therapist card
(photo + name) → confirm modal → server-side email (Resend) notifies the
therapist → success screen → auto-return home in 12s. On email failure, show a
friendly "Something went wrong, use your portal" screen (12s auto-return) and
log the failure server-side. Therapist names+photos auto-scraped from
parkviewcounseling.org (1h cache). Therapist emails kept private on the backend,
keyed by URL slug, never exposed to the frontend. Kiosk hardening (no selection,
no context menu, no zoom, 60s inactivity reset, hidden operator refresh gesture).

## Stack / Architecture
- Frontend: React (CRA + craco) + Tailwind. Brand green #2E5D3A, cream #FBF7F0,
  Playfair Display headlines. Single-page kiosk state machine in
  `frontend/src/components/Kiosk.jsx`.
- Backend: FastAPI (`backend/server.py`). Scrapes the site's JS bundle (the site
  is a React SPA) for the roster; 1h in-memory cache with stale-cache fallback.
- Email: Resend (`resend` SDK), async via `asyncio.to_thread`. TEST/LOG mode when
  keys absent.
- Email map: `backend/therapist_emails.py` (slug→email) + optional
  `THERAPIST_EMAILS_JSON` env override.
- DB: MongoDB — `checkin_events` collection logs every attempt.

## API
- `GET /api/therapists?refresh=<bool>` → {therapists[], source, cached_at} (no emails)
- `POST /api/checkin {slug}` → 200 {status, therapist_name, checked_in_at(ET), test_mode}
  | 422 NO_EMAIL_MAPPING | 502 EMAIL_SEND_FAILED
- `GET /api/admin/failures` → recent failures (in-memory + /var/log/parkview_kiosk.log)

## User Personas
- Client (waiting room): taps own therapist, confirms, sees confirmation.
- Operator (front desk): long-press bottom-right refresh corner to re-sync roster.

## Implemented (2026-06-22)
- Live scrape → 3 therapists (rich-maier, steph-maier, cristina-dunahoo).
- Full tap → confirm → success / error / cancel flow with kiosk hardening.
- 12s success/error auto-return, 60s inactivity reset, hidden long-press refresh.
- Eastern-Time email timestamp; server-side failure logging.
- README.md with the 4 required deliverable sections.
- Tested: backend 100% (pytest), frontend 100% (browser flow).
- MOCKED/TEST MODE: Resend not yet keyed → check-in logs email & returns test_mode:true.

## Backlog
- P0: User supplies RESEND_API_KEY + FROM_EMAIL + verified domain → live emails.
- P1: Gate `/api/admin/failures` behind an operator token before production.
- P1: Persist check-in/failure history (currently events in Mongo, failures in-memory).
- P2: PWA manifest + offline splash; optional sound/haptic on success.

## Next Tasks
1. Collect Resend API key + FROM_EMAIL and confirm/fill therapist email map.
2. Deploy + configure Android kiosk mode (README section 3).
