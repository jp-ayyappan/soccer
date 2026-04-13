#!/usr/bin/env python3
"""
Convert scraped OHTSL season CSVs into JSON for the GitHub Pages UI.

Reads from each season directory (e.g. Spring_2026/) and writes:
  docs/data/seasons.json            - list of available seasons
  docs/data/Spring_2026/locations.json - venue details with lat/lng
  docs/data/Spring_2026/games.json     - all games with location_id FK

Usage:
    python3 build_site_data.py
"""

import csv
import glob
import json
import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DATA_DIR = os.path.join(SCRIPT_DIR, "docs", "data")


def find_seasons() -> list[dict]:
    """Find all scraped season directories that have both CSVs."""
    pattern = os.path.join(SCRIPT_DIR, "*_*", "all_games.csv")
    seasons = []
    for games_csv in sorted(glob.glob(pattern)):
        season_dir = os.path.dirname(games_csv)
        locations_csv = os.path.join(season_dir, "locations.csv")
        if os.path.exists(locations_csv):
            dir_name = os.path.basename(season_dir)
            label = dir_name.replace("_", " ")
            seasons.append({
                "id": dir_name,
                "label": label,
                "games_csv": games_csv,
                "locations_csv": locations_csv,
            })
    return seasons


def build_locations_json(locations_csv: str) -> list[dict]:
    """Read locations.csv and return a list of venue dicts."""
    locations = []
    with open(locations_csv) as f:
        reader = csv.DictReader(f)
        for row in reader:
            lat = row.get("latitude", "").strip()
            lng = row.get("longitude", "").strip()
            if not lat or not lng:
                continue
            try:
                lat_f = float(lat)
                lng_f = float(lng)
            except ValueError:
                continue

            locations.append({
                "id": int(row["location_id"]),
                "name": row.get("field_name", "").strip(),
                "community": row.get("community", "").strip(),
                "address": row.get("address", "").strip(),
                "city": row.get("city", "").strip(),
                "state": row.get("state", "").strip(),
                "zip": row.get("zip", "").strip(),
                "lat": lat_f,
                "lng": lng_f,
            })
    return locations


def build_games_json(games_csv: str) -> list[dict]:
    """Read all_games.csv and return a list of game dicts."""
    games = []
    with open(games_csv) as f:
        reader = csv.DictReader(f)
        for row in reader:
            loc_id = row.get("location_id", "").strip()
            if not loc_id:
                continue
            games.append({
                "gn": row.get("game_number", "").strip(),
                "lid": int(loc_id),
                "loc": row.get("location", "").strip(),
                "d": row.get("date", "").strip(),
                "day": row.get("day", "").strip(),
                "t": row.get("time", "").strip(),
                "h": row.get("home_team", "").strip(),
                "v": row.get("visitor_team", "").strip(),
                "g": row.get("gender", "").strip(),
                "age": row.get("age_group", "").strip(),
                "div": row.get("division_name", "").strip(),
            })
    return games


def main():
    seasons = find_seasons()
    if not seasons:
        print("No season data found. Run scrape_ohtsl.py first.")
        return

    os.makedirs(DOCS_DATA_DIR, exist_ok=True)

    # Write seasons.json
    seasons_list = [{"id": s["id"], "label": s["label"]} for s in seasons]
    seasons_path = os.path.join(DOCS_DATA_DIR, "seasons.json")
    with open(seasons_path, "w") as f:
        json.dump(seasons_list, f)
    print(f"Written: {seasons_path} ({len(seasons_list)} seasons)")

    # Build per-season JSON
    for season in seasons:
        out_dir = os.path.join(DOCS_DATA_DIR, season["id"])
        os.makedirs(out_dir, exist_ok=True)

        locations = build_locations_json(season["locations_csv"])
        loc_path = os.path.join(out_dir, "locations.json")
        with open(loc_path, "w") as f:
            json.dump(locations, f)
        print(f"Written: {loc_path} ({len(locations)} venues)")

        games = build_games_json(season["games_csv"])
        games_path = os.path.join(out_dir, "games.json")
        with open(games_path, "w") as f:
            json.dump(games, f)
        print(f"Written: {games_path} ({len(games)} games)")


if __name__ == "__main__":
    main()
