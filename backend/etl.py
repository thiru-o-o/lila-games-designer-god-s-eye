"""
ETL logic for processing .nakama-0 Parquet files into per-map/date Parquet
files and updating metadata.json in Supabase Storage.

Adapted from scripts/prepare_data.py — operates in-memory and uploads
results to Supabase Storage instead of writing to the local filesystem.
"""

import io
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
import pandas as pd
import pyarrow.parquet as pq

logger = logging.getLogger(__name__)


def decode_event_column(df: pd.DataFrame) -> pd.DataFrame:
    if "event" in df.columns:
        df["event"] = df["event"].apply(
            lambda x: x.decode("utf-8") if isinstance(x, bytes) else x
        )
    return df


async def upload_bytes_to_supabase(
    client: httpx.AsyncClient,
    supabase_url: str,
    service_key: str,
    bucket: str,
    path: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> bool:
    """Upload raw bytes to a Supabase Storage bucket, overwriting if exists."""
    url = f"{supabase_url}/storage/v1/object/{bucket}/{path}"
    headers = {
        "Authorization": f"Bearer {service_key}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    resp = await client.post(url, headers=headers, content=data, timeout=120)
    if resp.status_code in (200, 201):
        logger.info("Uploaded %s", path)
        return True
    logger.error("Failed to upload %s: %s %s", path, resp.status_code, resp.text[:200])
    return False


async def download_json_from_supabase(
    client: httpx.AsyncClient,
    supabase_url: str,
    service_key: str,
    bucket: str,
    path: str,
) -> Optional[dict]:
    """Download and parse a JSON file from Supabase Storage."""
    url = f"{supabase_url}/storage/v1/object/{bucket}/{path}"
    headers = {"Authorization": f"Bearer {service_key}"}
    resp = await client.get(url, headers=headers, timeout=30)
    if resp.status_code == 200:
        return resp.json()
    return None


async def run_etl(
    raw_bytes: bytes,
    filename: str,
    date_str: str,
    supabase_url: str,
    service_key: str,
    bucket: str = "parquets",
) -> dict:
    """
    Full ETL pipeline for a single uploaded .nakama-0 file.

    Steps:
      1. Read Parquet from bytes.
      2. Decode event column.
      3. Add date column.
      4. Group by map_id; serialize each group to Parquet bytes.
      5. Upload per-map Parquet files to Supabase Storage.
      6. Fetch existing metadata.json, merge new data, re-upload.

    Returns a summary dict with processed maps/dates.
    """
    # Validate date format
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"Invalid date format '{date_str}' — expected YYYY-MM-DD") from exc

    # Read the uploaded Parquet file
    buf = io.BytesIO(raw_bytes)
    table = pq.read_table(buf)
    df = table.to_pandas()
    df = decode_event_column(df)
    df["date"] = date_str

    if df.empty:
        return {"maps_processed": [], "rows": 0}

    # Determine unique maps in this file
    maps_in_file = df["map_id"].unique().tolist() if "map_id" in df.columns else []

    async with httpx.AsyncClient() as client:
        # Upload per-map Parquet files
        maps_processed = []
        for map_id in maps_in_file:
            map_df = df[df["map_id"] == map_id].copy()

            out_buf = io.BytesIO()
            map_df.to_parquet(out_buf, index=False, engine="pyarrow")
            parquet_bytes = out_buf.getvalue()

            storage_path = f"data/{map_id}/{date_str}.parquet"
            success = await upload_bytes_to_supabase(
                client, supabase_url, service_key, bucket,
                storage_path, parquet_bytes,
            )
            if success:
                maps_processed.append(map_id)

            # Build match list for this map+date
            match_ids = sorted(df[df["map_id"] == map_id]["match_id"].unique().tolist()) if "match_id" in df.columns else []

        # Update metadata.json
        existing_meta = await download_json_from_supabase(
            client, supabase_url, service_key, bucket, "metadata.json"
        ) or {"maps": [], "dates": [], "matches_by_map_date": {}}

        # Merge
        all_maps = set(existing_meta.get("maps", []))
        all_dates = set(existing_meta.get("dates", []))
        matches_by_map_date: dict = existing_meta.get("matches_by_map_date", {})

        for map_id in maps_in_file:
            all_maps.add(map_id)
            all_dates.add(date_str)

            match_ids = sorted(
                df[df["map_id"] == map_id]["match_id"].unique().tolist()
            ) if "match_id" in df.columns else []

            if map_id not in matches_by_map_date:
                matches_by_map_date[map_id] = {}
            matches_by_map_date[map_id][date_str] = match_ids

        updated_meta = {
            "maps":  sorted(all_maps),
            "dates": sorted(all_dates),
            "matches_by_map_date": matches_by_map_date,
        }

        meta_bytes = json.dumps(updated_meta, indent=2).encode("utf-8")
        await upload_bytes_to_supabase(
            client, supabase_url, service_key, bucket,
            "metadata.json", meta_bytes, "application/json",
        )

    return {
        "maps_processed": maps_processed,
        "rows": len(df),
        "date": date_str,
        "filename": filename,
    }
