from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import time
import asyncio
import logging
from logging.handlers import RotatingFileHandler
from collections import deque
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import uuid

import requests
import resend

import therapist_emails as email_config

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

SITE_BASE = "https://www.parkviewcounseling.org"
SCRAPE_TTL_SECONDS = 3600  # cache therapist data for 1 hour
EASTERN = ZoneInfo("America/New_York")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
FROM_EMAIL = (os.environ.get("FROM_EMAIL") or os.environ.get("SENDER_EMAIL") or "").strip()

EMAIL_SUBJECT = "Client has checked in at Parkview Counseling"

# ---------------------------------------------------------------------------
# Logging (console + rotating file the practice can review later)
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("parkview_kiosk")

try:
    _fh = RotatingFileHandler("/var/log/parkview_kiosk.log", maxBytes=1_000_000, backupCount=3)
    _fh.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(_fh)
except Exception as e:  # pragma: no cover - log dir may be read-only in some envs
    logger.warning(f"Could not attach file log handler: {e}")

# In-memory failure queue (most recent 200) for quick operator review
FAILURE_LOG: deque = deque(maxlen=200)


def log_failure(kind: str, detail: str, slug: Optional[str] = None):
    entry = {
        "kind": kind,
        "slug": slug,
        "detail": detail,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    FAILURE_LOG.append(entry)
    logger.error(f"[KIOSK FAILURE] {kind} slug={slug} :: {detail}")


def get_email_map() -> dict:
    """Email mapping from config file, merged with optional env override."""
    mapping = dict(email_config.THERAPIST_EMAILS)
    raw = os.environ.get("THERAPIST_EMAILS_JSON", "").strip()
    if raw:
        try:
            mapping.update(json.loads(raw))
        except Exception as e:
            logger.warning(f"Invalid THERAPIST_EMAILS_JSON, ignoring: {e}")
    # Drop empty values so they are treated as "no mapping yet"
    return {k: v for k, v in mapping.items() if v}


# ---------------------------------------------------------------------------
# Therapist scraper (the public site is a client-rendered React SPA, so the
# therapist roster lives in its JS bundle rather than the HTML body).
# ---------------------------------------------------------------------------
_scrape_cache = {"data": None, "fetched_at": 0.0}

_HEADERS = {"User-Agent": "ParkviewKiosk/1.0 (+check-in kiosk)"}


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _scrape_site() -> List[dict]:
    """Fetch the main JS bundle and extract the therapist roster."""
    manifest = requests.get(f"{SITE_BASE}/asset-manifest.json", headers=_HEADERS, timeout=15)
    manifest.raise_for_status()
    main_js = manifest.json()["files"]["main.js"]
    bundle_url = main_js if main_js.startswith("http") else f"{SITE_BASE}{main_js}"

    bundle = requests.get(bundle_url, headers=_HEADERS, timeout=20)
    bundle.raise_for_status()
    js = bundle.text

    # Primary pattern: objects carrying a /images/team/ headshot.
    pattern = re.compile(
        r'name:"(?P<name>[^"]+)",credentials:"(?P<credentials>[^"]*)",'
        r'title:"(?P<title>[^"]*)",photo:"(?P<photo>/images/team/[^"]+)"'
    )
    found = {}
    for m in pattern.finditer(js):
        name = m.group("name").strip()
        slug = _slugify(name)
        if slug in found:
            continue
        photo = m.group("photo")
        found[slug] = {
            "slug": slug,
            "name": name,
            "credentials": m.group("credentials").strip(),
            "title": m.group("title").strip(),
            "photo": photo if photo.startswith("http") else f"{SITE_BASE}{photo}",
        }

    # Fallback pattern (name + team photo only) if structure changes.
    if not found:
        fallback = re.compile(r'name:"(?P<name>[^"]+)"[^{}]*?photo:"(?P<photo>/images/team/[^"]+)"')
        for m in fallback.finditer(js):
            name = m.group("name").strip()
            slug = _slugify(name)
            if slug in found:
                continue
            photo = m.group("photo")
            found[slug] = {
                "slug": slug,
                "name": name,
                "credentials": "",
                "title": "",
                "photo": photo if photo.startswith("http") else f"{SITE_BASE}{photo}",
            }

    therapists = list(found.values())
    if not therapists:
        raise ValueError("No therapists parsed from site bundle")
    return therapists


def get_therapists(force_refresh: bool = False) -> dict:
    """Return cached therapist roster, refreshing from the site when stale.

    Returns dict: {therapists, source, cached_at}. Falls back to last cache on
    network error. Raises RuntimeError only when there is no data at all.
    """
    now = time.time()
    fresh = (now - _scrape_cache["fetched_at"]) < SCRAPE_TTL_SECONDS
    if _scrape_cache["data"] is not None and fresh and not force_refresh:
        return {
            "therapists": _scrape_cache["data"],
            "source": "cache",
            "cached_at": _scrape_cache["fetched_at"],
        }

    try:
        data = _scrape_site()
        _scrape_cache["data"] = data
        _scrape_cache["fetched_at"] = now
        return {"therapists": data, "source": "live", "cached_at": now}
    except Exception as e:
        log_failure("SCRAPE_ERROR", str(e))
        if _scrape_cache["data"] is not None:
            return {
                "therapists": _scrape_cache["data"],
                "source": "stale-cache",
                "cached_at": _scrape_cache["fetched_at"],
            }
        raise RuntimeError("Unable to reach parkviewcounseling.org and no cache available")


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
def build_email_html(checked_in_at: str) -> str:
    return f"""\
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F0;padding:24px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e6ded0;">
      <tr><td style="padding:28px 32px;">
        <p style="margin:0 0 6px;color:#2E5D3A;font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:bold;">Parkview Counseling</p>
        <h1 style="margin:0 0 16px;color:#1f2a22;font-size:20px;">A client has checked in</h1>
        <p style="margin:0 0 12px;color:#33403a;font-size:15px;line-height:1.6;">
          A client has checked in at the Parkview Counseling kiosk and is waiting in the waiting area.
        </p>
        <p style="margin:0 0 4px;color:#33403a;font-size:15px;"><strong>Checked in at:</strong> {checked_in_at}</p>
        <p style="margin:20px 0 0;color:#7a857d;font-size:13px;">&mdash; Parkview Counseling kiosk</p>
      </td></tr>
    </table>
  </td></tr>
</table>"""


def build_email_text(checked_in_at: str) -> str:
    return (
        "A client has checked in at the Parkview Counseling kiosk "
        "and is waiting in the waiting area.\n"
        f"Checked in at: {checked_in_at}\n"
        "\u2014 Parkview Counseling kiosk"
    )


async def send_checkin_email(to_email: str, checked_in_at: str) -> dict:
    """Send via Resend. Returns dict with test_mode / email_id. Raises on failure."""
    if not RESEND_API_KEY or not FROM_EMAIL:
        # Keys not configured yet -> test/log mode (no live email sent).
        logger.info(f"[TEST MODE] Would email check-in notice to {to_email} (checked in at {checked_in_at})")
        return {"test_mode": True, "email_id": None}

    resend.api_key = RESEND_API_KEY
    params = {
        "from": FROM_EMAIL,
        "to": [to_email],
        "subject": EMAIL_SUBJECT,
        "html": build_email_html(checked_in_at),
        "text": build_email_text(checked_in_at),
    }
    result = await asyncio.to_thread(resend.Emails.send, params)
    return {"test_mode": False, "email_id": result.get("id") if isinstance(result, dict) else None}


# ---------------------------------------------------------------------------
# App / routes
# ---------------------------------------------------------------------------
app = FastAPI()
api_router = APIRouter(prefix="/api")


class CheckinRequest(BaseModel):
    slug: str


@api_router.get("/")
async def root():
    return {"message": "Parkview Counseling kiosk API"}


@api_router.get("/therapists")
async def list_therapists(refresh: bool = False):
    try:
        result = await asyncio.to_thread(get_therapists, refresh)
    except RuntimeError as e:
        # No data at all -> kiosk shows "initializing" message. Return 200 with an
        # empty list so the platform gateway doesn't replace a 5xx with its own page.
        return {"therapists": [], "source": "unavailable", "cached_at": 0, "code": "NO_DATA", "message": str(e)}
    # Never expose emails. Only public fields are returned.
    public = [
        {
            "slug": t["slug"],
            "name": t["name"],
            "credentials": t.get("credentials", ""),
            "title": t.get("title", ""),
            "photo": t["photo"],
        }
        for t in result["therapists"]
    ]
    return {
        "therapists": public,
        "source": result["source"],
        "cached_at": result["cached_at"],
    }


@api_router.post("/checkin")
async def checkin(req: CheckinRequest):
    slug = req.slug.strip()
    checked_in_at = datetime.now(EASTERN).strftime("%B %-d, %Y at %-I:%M %p %Z")

    # Resolve therapist display name (best effort, from cache).
    name = slug
    try:
        roster = get_therapists().get("therapists", [])
        match = next((t for t in roster if t["slug"] == slug), None)
        if match:
            name = match["name"]
    except Exception:
        pass

    email_map = get_email_map()
    to_email = email_map.get(slug)

    if not to_email:
        log_failure("NO_EMAIL_MAPPING", f"No email configured for slug '{slug}'", slug=slug)
        await record_event(slug, name, "failed", "NO_EMAIL_MAPPING")
        raise HTTPException(
            status_code=422,
            detail={"code": "NO_EMAIL_MAPPING", "message": "No email is configured for this therapist."},
        )

    try:
        send_result = await send_checkin_email(to_email, checked_in_at)
    except Exception as e:
        log_failure("EMAIL_SEND_FAILED", str(e), slug=slug)
        await record_event(slug, name, "failed", f"EMAIL_SEND_FAILED: {e}")
        raise HTTPException(
            status_code=422,
            detail={"code": "EMAIL_SEND_FAILED", "message": "Could not send the notification email."},
        )

    await record_event(slug, name, "sent", "test_mode" if send_result["test_mode"] else "delivered")
    return {
        "status": "ok",
        "therapist_name": name,
        "checked_in_at": checked_in_at,
        "test_mode": send_result["test_mode"],
    }


@api_router.get("/admin/failures")
async def get_failures():
    """Operator endpoint: recent kiosk failures for review."""
    return {"failures": list(FAILURE_LOG)}


async def record_event(slug: str, name: str, status: str, note: str):
    doc = {
        "id": str(uuid.uuid4()),
        "slug": slug,
        "name": name,
        "status": status,
        "note": note,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.checkin_events.insert_one(doc)
    except Exception as e:
        logger.warning(f"Could not persist check-in event: {e}")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
