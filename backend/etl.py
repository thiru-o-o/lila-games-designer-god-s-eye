"""
ETL logic for processing .nakama-0 Parquet files into per-map/date Parquet
files and updating metadata.json in Supabase Storage.

The date is derived automatically from the data: we take the minimum
timestamp in the file and convert it to an ISO date (YYYY-MM-DD).
No manual date input is required from the user.
"""

import io
import json
import logging
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


def derive_date_from_df(df: pd.DataFrame) -> str:
    """
    Extract the session date from the ts column.

    The ts column stores epoch-seconds as a TIMESTAMP type (an ETL quirk).
    PyArrow reads it as a numpy datetime64 or pandas Timestamp.
    We take the minimum value and extract the date portion.
    """
    if "ts" not in df.columns:
        raise ValueError("No 'ts' column found in file — cannot derive date.")

    ts_series = df["ts"]
    min_ts = ts_series.min()

    # Case 1: already a pandas Timestamp / datetime-like
    if hasattr(min_ts, "date"):
        return str(min_ts.date())

    # Case 2: numeric (epoch-seconds or epoch-milliseconds)
    val = float(min_ts)
    if val > 1e12:
        # milliseconds
        return str(pd.Timestamp(val / 1000, unit="s").date())
    else:
        # seconds
        return str(pd.Timestamp(val, unit="s").date())


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
    url = f"{supabase_url}/storage/v1/object/public/{bucket}/{path}"
    resp = await client.get(url, timeout=30)
    if resp.status_code == 200:
        return resp.json()
    return None


async def run_etl(
    raw_bytes: bytes,
    filename: str,
    supabase_url: str,
    service_key: str,
    bucket: str = "parquets",
) -> dict:
    """
    Full ETL pipeline for a single uploaded .nakama-0 file.

    Steps:
      1. Read Parquet from bytes.
      2. Decode event column.
      3. Derive session date from min(ts) in the data.
      4. Group by map_id; serialize each group to Parquet bytes.
         Note: existing data for the same map+date is merged (union) so
         uploading multiple files from the same day accumulates correctly.
      5. Upload per-map Parquet files to Supabase Storage.
      6. Fetch existing metadata.json, merge new data, re-upload.

    Returns a summary dict with processed maps/dates.
    """
    # Read the uploaded Parquet file
    buf = io.BytesIO(raw_bytes)
    table = pq.read_table(buf)
    df = table.to_pandas()
    df = decode_event_column(df)

    if df.empty:
        return {"maps_processed": [], "rows": 0, "date": None, "filename": filename}

    # Derive date from data
    date_str = derive_date_from_df(df)
    df["date"] = date_str

    logger.info("File '%s': derived date=%s, rows=%d", filename, date_str, len(df))

    maps_in_file = df["map_id"].unique().tolist() if "map_id" in df.columns else []

    async with httpx.AsyncClient() as client:
        maps_processed = []

        for map_id in maps_in_file:
            new_df = df[df["map_id"] == map_id].copy()

            # Download existing parquet for this map+date and merge
            existing_url = (
                f"{supabase_url}/storage/v1/object/public/{bucket}"
                f"/data/{map_id}/{date_str}.parquet"
            )
            existing_resp = await client.get(existing_url, timeout=30)
            if existing_resp.status_code == 200:
                try:
                    ex_buf = io.BytesIO(existing_resp.content)
                    existing_df = pq.read_table(ex_buf).to_pandas()
                    existing_df = decode_event_column(existing_df)
                    new_df = pd.concat([existing_df, new_df], ignore_index=True).drop_duplicates()
                    logger.info("Merged with existing data for %s/%s", map_id, date_str)
                except Exception as merge_err:
                    logger.warning("Could not merge existing data: %s", merge_err)

            out_buf = io.BytesIO()
            new_df.to_parquet(out_buf, index=False, engine="pyarrow")
            parquet_bytes = out_buf.getvalue()

            storage_path = f"data/{map_id}/{date_str}.parquet"
            success = await upload_bytes_to_supabase(
                client, supabase_url, service_key, bucket,
                storage_path, parquet_bytes,
            )
            if success:
                maps_processed.append(map_id)

        # Update metadata.json
        existing_meta = await download_json_from_supabase(
            client, supabase_url, service_key, bucket, "metadata.json"
        ) or {"maps": [], "dates": [], "matches_by_map_date": {}}

        all_maps = set(existing_meta.get("maps", []))
        all_dates = set(existing_meta.get("dates", []))
        matches_by_map_date: dict = existing_meta.get("matches_by_map_date", {})

        for map_id in maps_in_file:
            all_maps.add(map_id)
            all_dates.add(date_str)

            match_ids = (
                sorted(df[df["map_id"] == map_id]["match_id"].unique().tolist())
                if "match_id" in df.columns else []
            )
            if map_id not in matches_by_map_date:
                matches_by_map_date[map_id] = {}
            # Merge match IDs (union with any existing ones)
            existing_ids = set(matches_by_map_date[map_id].get(date_str, []))
            matches_by_map_date[map_id][date_str] = sorted(existing_ids | set(match_ids))

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
