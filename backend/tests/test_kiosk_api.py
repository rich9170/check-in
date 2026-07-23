"""Backend API tests for Parkview Counseling kiosk.

Covers:
- GET /api/therapists (roster + no email leak + cache/live)
- POST /api/checkin (success test-mode + NO_EMAIL_MAPPING)
- GET /api/admin/failures (recent failure log)
- GET/PUT /api/admin/order (operator reorder feature)
"""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://parkview-intake.preview.emergentagent.com"
).rstrip("/")

EXPECTED_SLUGS = {
    "rich-maier",
    "steph-maier",
    "cristina-dunahoo",
    "shari-almanza",
    "anna-devries",
    "sara-hill",
}


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session", autouse=True)
def reset_order_at_end(api):
    """Ensure order is reset to empty at end of session so app is in default state."""
    yield
    try:
        api.put(f"{BASE_URL}/api/admin/order", json={"order": []}, timeout=15)
    except Exception:
        pass


# ---- /api/therapists -------------------------------------------------------
class TestTherapists:
    def test_list_therapists_returns_six(self, api):
        r = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "therapists" in data
        therapists = data["therapists"]
        slugs = {t["slug"] for t in therapists}
        assert slugs == EXPECTED_SLUGS, slugs
        for t in therapists:
            assert t["name"]
            # photo may be None only for placeholders; when present must be a URL
            if t.get("photo"):
                assert t["photo"].startswith("http")

    def test_no_email_in_response(self, api):
        r = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        assert r.status_code == 200
        body = r.text
        assert not re.search(
            r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", body
        ), "Email leaked in response"
        for t in r.json()["therapists"]:
            assert "email" not in t

    def test_refresh_returns_live(self, api):
        r = api.get(f"{BASE_URL}/api/therapists", params={"refresh": "true"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["source"] == "live"
        assert len(data["therapists"]) == 6

    def test_cache_on_second_call(self, api):
        api.get(f"{BASE_URL}/api/therapists", params={"refresh": "true"}, timeout=30)
        time.sleep(0.5)
        r = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        assert r.status_code == 200
        assert r.json()["source"] == "cache"

    def test_default_placeholder_pinning(self, api):
        """When no saved order exists, anna-devries and sara-hill should be at the bottom."""
        # Reset saved order to empty first
        api.put(f"{BASE_URL}/api/admin/order", json={"order": []}, timeout=15)
        r = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        assert r.status_code == 200
        slugs = [t["slug"] for t in r.json()["therapists"]]
        # anna-devries and sara-hill should be the LAST two (either order)
        assert set(slugs[-2:]) == {"anna-devries", "sara-hill"}, slugs


# ---- /api/checkin ----------------------------------------------------------
class TestCheckin:
    def test_checkin_success_test_mode(self, api):
        r = api.post(f"{BASE_URL}/api/checkin", json={"slug": "rich-maier"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ok"
        assert data["therapist_name"] == "Rich Maier"
        # Live Resend key may be configured - test_mode may be False; only verify presence
        assert "test_mode" in data
        assert "EDT" in data["checked_in_at"] or "EST" in data["checked_in_at"], data[
            "checked_in_at"
        ]

    def test_checkin_unknown_slug_returns_422(self, api):
        r = api.post(f"{BASE_URL}/api/checkin", json={"slug": "nobody"}, timeout=30)
        assert r.status_code == 422, r.text
        body = r.json()
        detail = body.get("detail", {})
        assert isinstance(detail, dict)
        assert detail.get("code") == "NO_EMAIL_MAPPING"


# ---- /api/admin/failures --------------------------------------------------
class TestFailures:
    def test_failures_includes_no_email_mapping(self, api):
        api.post(f"{BASE_URL}/api/checkin", json={"slug": "nobody"}, timeout=30)
        r = api.get(f"{BASE_URL}/api/admin/failures", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "failures" in data
        kinds = [f.get("kind") for f in data["failures"]]
        assert "NO_EMAIL_MAPPING" in kinds


# ---- /api/admin/order (NEW feature) ---------------------------------------
class TestAdminOrder:
    def test_get_order_returns_list(self, api):
        r = api.get(f"{BASE_URL}/api/admin/order", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "order" in data
        assert isinstance(data["order"], list)

    def test_put_order_saves_and_reflected_by_get(self, api):
        # Custom order: move Steph before Rich
        custom = [
            "steph-maier",
            "rich-maier",
            "cristina-dunahoo",
            "shari-almanza",
            "anna-devries",
            "sara-hill",
        ]
        r = api.put(f"{BASE_URL}/api/admin/order", json={"order": custom}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("order") == custom

        # GET returns saved order
        g = api.get(f"{BASE_URL}/api/admin/order", timeout=15)
        assert g.status_code == 200
        assert g.json()["order"] == custom

    def test_saved_order_reflected_in_therapists_list(self, api):
        custom = [
            "anna-devries",
            "sara-hill",
            "steph-maier",
            "rich-maier",
            "cristina-dunahoo",
            "shari-almanza",
        ]
        r = api.put(f"{BASE_URL}/api/admin/order", json={"order": custom}, timeout=15)
        assert r.status_code == 200

        t = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        assert t.status_code == 200
        got = [x["slug"] for x in t.json()["therapists"]]
        assert got == custom, got

    def test_put_empty_order_restores_default(self, api):
        r = api.put(f"{BASE_URL}/api/admin/order", json={"order": []}, timeout=15)
        assert r.status_code == 200
        # therapists list falls back to placeholder-at-bottom
        t = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        slugs = [x["slug"] for x in t.json()["therapists"]]
        assert set(slugs[-2:]) == {"anna-devries", "sara-hill"}, slugs

    def test_put_partial_order_appends_unlisted(self, api):
        """If saved order only contains some slugs, unlisted ones should appear after."""
        partial = ["cristina-dunahoo", "rich-maier"]
        r = api.put(f"{BASE_URL}/api/admin/order", json={"order": partial}, timeout=15)
        assert r.status_code == 200
        t = api.get(f"{BASE_URL}/api/therapists", timeout=30)
        slugs = [x["slug"] for x in t.json()["therapists"]]
        # first two should match the saved partial order
        assert slugs[:2] == partial, slugs
        # remaining should include the other four
        assert set(slugs[2:]) == EXPECTED_SLUGS - set(partial), slugs
