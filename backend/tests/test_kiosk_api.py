"""Backend API tests for Parkview Counseling kiosk."""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://parkview-intake.preview.emergentagent.com").rstrip("/")
# Note: We read REACT_APP_BACKEND_URL from frontend .env via OS - fallback acceptable for test


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- /api/therapists -------------------------------------------------------
class TestTherapists:
    def test_list_therapists_returns_three(self, api):
        r = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "therapists" in data
        therapists = data["therapists"]
        slugs = sorted(t["slug"] for t in therapists)
        assert slugs == ["cristina-dunahoo", "rich-maier", "steph-maier"], slugs
        for t in therapists:
            assert t["name"]
            assert t["photo"].startswith("http")

    def test_no_email_in_response(self, api):
        r = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        assert r.status_code == 200
        body = r.text
        # No email-shaped content should leak
        assert not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", body), "Email leaked in response"
        for t in r.json()["therapists"]:
            assert "email" not in t

    def test_refresh_returns_live(self, api):
        r = api.get(f"{BASE_URL}/api/therapists", params={"refresh": "true"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["source"] == "live"
        assert len(data["therapists"]) == 3

    def test_cache_on_second_call(self, api):
        # Force a refresh first to populate cache
        api.get(f"{BASE_URL}/api/therapists", params={"refresh": "true"}, timeout=30)
        time.sleep(0.5)
        r = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        assert r.status_code == 200
        assert r.json()["source"] == "cache"


# ---- /api/checkin ----------------------------------------------------------
class TestCheckin:
    def test_checkin_success_test_mode(self, api):
        r = api.post(f"{BASE_URL}/api/checkin", json={"slug": "rich-maier"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ok"
        assert data["therapist_name"] == "Rich Maier"
        assert data["test_mode"] is True
        assert "EDT" in data["checked_in_at"] or "EST" in data["checked_in_at"], data["checked_in_at"]

    def test_checkin_unknown_slug_returns_422(self, api):
        r = api.post(f"{BASE_URL}/api/checkin", json={"slug": "nobody"}, timeout=30)
        assert r.status_code == 422, r.text
        body = r.json()
        # FastAPI puts our dict in "detail"
        detail = body.get("detail", {})
        assert isinstance(detail, dict)
        assert detail.get("code") == "NO_EMAIL_MAPPING"


# ---- /api/admin/failures --------------------------------------------------
class TestFailures:
    def test_failures_includes_no_email_mapping(self, api):
        # Trigger a failure
        api.post(f"{BASE_URL}/api/checkin", json={"slug": "nobody"}, timeout=30)
        r = api.get(f"{BASE_URL}/api/admin/failures", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "failures" in data
        kinds = [f.get("kind") for f in data["failures"]]
        assert "NO_EMAIL_MAPPING" in kinds
