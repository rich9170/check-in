"""
Therapist email mapping for the Parkview Counseling check-in kiosk.

HOW TO EDIT (see README.md section 1):
  - Each key is the therapist's URL slug from parkviewcounseling.org/team/<slug>
    e.g. https://www.parkviewcounseling.org/team/rich-maier  ->  "rich-maier"
  - Each value is the email address that should be notified when a client
    checks in for that therapist.
  - The slug is auto-derived from the therapist's name (lowercase, spaces -> hyphens).
  - After editing this file, restart the backend:  sudo supervisorctl restart backend

These addresses are NEVER sent to the frontend or exposed in any API response.

You can also override this mapping at runtime with the THERAPIST_EMAILS_JSON
environment variable (a JSON object of slug -> email). The env var, when set,
is merged on top of the values below.
"""

THERAPIST_EMAILS = {
    "rich-maier": "rich@parkviewcounseling.org",
    "steph-maier": "steph@parkviewcounseling.org",
    "cristina-dunahoo": "cristina@parkviewcounseling.org",
    # Add new therapists here, e.g.:
    # "jane-doe": "jane@parkviewcounseling.org",
}
