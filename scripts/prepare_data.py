"""
ETL Script to prepare LILA BLACK player data for web visualization.

This script:
1. Reads all .nakama-0 parquet files from player_data/February_*/ folders
2. Decodes the event column from bytes to strings
3. Partitions data by map_id and date into public/data/{map_id}/{date}.parquet
4. Generates metadata.json with available maps, dates, and matches
"""

import os
import json
import pyarrow.parquet as pq
import pandas as pd
from pathlib import Path
from collections import defaultdict
from datetime import datetime

# Configuration
INPUT_DIR = Path("player_data")
OUTPUT_DIR = Path("public/data")
METADATA_FILE = Path("public/metadata.json")

# Map folder names to dates
FOLDER_TO_DATE = {
    "February_10": "2026-02-10",
    "February_11": "2026-02-11",
    "February_12": "2026-02-12",
    "February_13": "2026-02-13",
    "February_14": "2026-02-14",
}


def decode_event_column(df):
    """Decode event column from bytes to string."""
    if 'event' in df.columns:
        df['event'] = df['event'].apply(
            lambda x: x.decode('utf-8') if isinstance(x, bytes) else x
        )
    return df


def load_day_folder(folder_path):
    """Load all parquet files from a day folder."""
    frames = []
    folder_name = folder_path.name
    
    if folder_name not in FOLDER_TO_DATE:
        print(f"Warning: Unknown folder {folder_name}, skipping")
        return None
    
    date = FOLDER_TO_DATE[folder_name]
    print(f"Processing {folder_name} ({date})...")
    
    files = list(folder_path.glob("*.nakama-0"))
    print(f"  Found {len(files)} files")
    
    for file_path in files:
        try:
            table = pq.read_table(file_path)
            df = table.to_pandas()
            df = decode_event_column(df)
            # Add date column
            df['date'] = date
            frames.append(df)
        except Exception as e:
            print(f"  Warning: Failed to read {file_path.name}: {e}")
            continue
    
    if not frames:
        return None
    
    combined = pd.concat(frames, ignore_index=True)
    print(f"  Combined: {len(combined)} rows")
    return combined


def partition_and_save(df, output_dir):
    """Partition dataframe by map_id and date, save as parquet files."""
    if df is None or df.empty:
        return
    
    # Group by map_id and date
    grouped = df.groupby(['map_id', 'date'])
    
    for (map_id, date), group_df in grouped:
        # Create output directory
        map_dir = output_dir / map_id
        map_dir.mkdir(parents=True, exist_ok=True)
        
        # Save parquet file
        output_file = map_dir / f"{date}.parquet"
        group_df.to_parquet(output_file, index=False, engine='pyarrow')
        print(f"  Saved {output_file}: {len(group_df)} rows")


def generate_metadata(output_dir):
    """Generate metadata.json with available maps, dates, and matches."""
    metadata = {
        "maps": [],
        "dates": [],
        "matches_by_map_date": {}
    }
    
    # Scan output directory structure
    for map_dir in output_dir.iterdir():
        if not map_dir.is_dir():
            continue
        
        map_id = map_dir.name
        metadata["maps"].append(map_id)
        
        dates_for_map = []
        matches_by_date = {}
        
        for parquet_file in map_dir.glob("*.parquet"):
            date = parquet_file.stem  # filename without extension
            
            if date not in metadata["dates"]:
                metadata["dates"].append(date)
            
            dates_for_map.append(date)
            
            # Read parquet to get unique matches
            try:
                df = pd.read_parquet(parquet_file)
                unique_matches = sorted(df['match_id'].unique().tolist())
                matches_by_date[date] = unique_matches
            except Exception as e:
                print(f"Warning: Failed to read {parquet_file} for metadata: {e}")
                matches_by_date[date] = []
        
        metadata["matches_by_map_date"][map_id] = matches_by_date
    
    # Sort dates
    metadata["dates"].sort()
    metadata["maps"].sort()
    
    # Save metadata
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\nMetadata saved to {METADATA_FILE}")
    print(f"  Maps: {len(metadata['maps'])}")
    print(f"  Dates: {len(metadata['dates'])}")
    
    return metadata


def main():
    """Main ETL process."""
    print("=" * 60)
    print("LILA BLACK Data Preparation Script")
    print("=" * 60)
    
    # Check input directory
    if not INPUT_DIR.exists():
        print(f"Error: Input directory {INPUT_DIR} does not exist")
        return
    
    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Process each day folder
    all_data = []
    day_folders = [f for f in INPUT_DIR.iterdir() if f.is_dir() and f.name.startswith("February_")]
    day_folders.sort()
    
    for folder in day_folders:
        df = load_day_folder(folder)
        if df is not None:
            all_data.append(df)
    
    if not all_data:
        print("Error: No data loaded")
        return
    
    # Combine all data
    print("\nCombining all data...")
    combined_df = pd.concat(all_data, ignore_index=True)
    print(f"Total rows: {len(combined_df)}")
    print(f"Unique maps: {combined_df['map_id'].unique()}")
    print(f"Unique matches: {combined_df['match_id'].nunique()}")
    
    # Partition and save
    print("\nPartitioning and saving data...")
    partition_and_save(combined_df, OUTPUT_DIR)
    
    # Generate metadata
    print("\nGenerating metadata...")
    metadata = generate_metadata(OUTPUT_DIR)
    
    print("\n" + "=" * 60)
    print("ETL Complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()

