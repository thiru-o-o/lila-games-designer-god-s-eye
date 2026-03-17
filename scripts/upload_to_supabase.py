"""
One-time migration script: upload existing Parquet files + metadata.json
to a Supabase Storage public bucket named 'parquets'.

Usage:
    pip install requests
    python scripts/upload_to_supabase.py

Environment variables (or edit the constants below):
    SUPABASE_URL          https://<project-id>.supabase.co
    SUPABASE_SERVICE_KEY  <service-role key from Project Settings > API>
"""

import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: 'requests' not installed. Run: pip install requests")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration — either set env vars or paste values directly here
# ---------------------------------------------------------------------------
SUPABASE_URL         = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET               = "parquets"

# Paths relative to the project root (d:\player_data)
GODS_EYE_DIR = Path(__file__).parent.parent / "gods-eye"
DATA_DIR     = GODS_EYE_DIR / "public" / "data"
METADATA_FILE = GODS_EYE_DIR / "public" / "metadata.json"


def ensure_bucket_exists() -> bool:
    """Create the bucket if it does not exist. Requires service_role key."""
    url = f"{SUPABASE_URL}/storage/v1/bucket"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    # id and name both set so Supabase accepts the bucket
    payload = {"id": BUCKET, "name": BUCKET, "public": True}
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code in (200, 201):
        print(f"  Created bucket '{BUCKET}' (public).")
        return True
    if resp.status_code == 409 or "already exists" in resp.text.lower():
        print(f"  Bucket '{BUCKET}' already exists.")
        return True
    # Hosted Supabase may not expose bucket create via REST; bucket might need to be created in Dashboard
    print(f"  Could not create bucket via API: {resp.status_code} — {resp.text[:200]}")
    print(f"  Create the bucket in Supabase Dashboard: Storage → New bucket → name '{BUCKET}', Public ON.")
    return False


def upload_file(local_path: Path, storage_path: str) -> bool:
    """Upload a single file to Supabase Storage, overwriting if it exists."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "x-upsert": "true",
    }
    content_type = (
        "application/json"
        if local_path.suffix == ".json"
        else "application/octet-stream"
    )
    headers["Content-Type"] = content_type

    with open(local_path, "rb") as f:
        resp = requests.post(url, headers=headers, data=f, timeout=60)

    if resp.status_code in (200, 201):
        print(f"  OK  {storage_path}")
        return True
    else:
        print(f"  ERR {storage_path} — {resp.status_code}: {resp.text[:120]}")
        return False


def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print(
            "Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.\n"
            "  export SUPABASE_URL=https://<project-id>.supabase.co\n"
            "  export SUPABASE_SERVICE_KEY=<service-role-key>"
        )
        sys.exit(1)

    print("=" * 60)
    print("Uploading files to Supabase Storage")
    print(f"  Bucket : {BUCKET}")
    print(f"  Project: {SUPABASE_URL}")
    print("=" * 60)

    print("\n[1/2] Ensuring bucket exists...")
    if not ensure_bucket_exists():
        print("Create the bucket manually in Supabase: Storage → New bucket → name 'parquet', Public ON.")
        sys.exit(1)

    ok = err = 0

    # Upload metadata.json
    if METADATA_FILE.exists():
        print("\n[metadata.json]")
        if upload_file(METADATA_FILE, "metadata.json"):
            ok += 1
        else:
            err += 1
    else:
        print(f"Warning: {METADATA_FILE} not found — skipping")

    # Upload Parquet files
    print("\n[Parquet files]")
    for map_dir in sorted(DATA_DIR.iterdir()):
        if not map_dir.is_dir():
            continue
        for parquet_file in sorted(map_dir.glob("*.parquet")):
            # Storage path mirrors the local structure: data/{map}/{date}.parquet
            storage_path = f"data/{map_dir.name}/{parquet_file.name}"
            if upload_file(parquet_file, storage_path):
                ok += 1
            else:
                err += 1

    print(f"\nDone — {ok} uploaded, {err} failed")
    if err:
        sys.exit(1)


if __name__ == "__main__":
    main()
