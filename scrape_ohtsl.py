#!/usr/bin/env python3
"""
OHTSL Game Schedule Scraper

Scrapes the Ohio Travel Soccer League (ohtsl.com) game schedules for all
divisions (boys & girls), and outputs them grouped by location and sorted
by date/time — useful for planning referee assignments at nearby venues.

Usage:
    python3 scrape_ohtsl.py [--season SEASON_NAME]

Output is written to a directory named after the season (default: "Spring_2026").
"""

import argparse
import csv
import os
import re
import time
from collections import defaultdict
from datetime import datetime

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.ohtsl.com"
GAMES_ENDPOINT = f"{BASE_URL}/core/getgames.php"
PUBLIC_PAGE = f"{BASE_URL}/public.php"

# Polite delay between requests (seconds)
REQUEST_DELAY = 0.3


def fetch_division_ids(gender_id: int) -> list[dict]:
    """Fetch all division IDs and metadata from the public schedule page."""
    resp = requests.get(PUBLIC_PAGE, params={"genderid": gender_id})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    gender_label = "Boys" if gender_id == 1 else "Girls"
    divisions = []

    for fieldset in soup.find_all("fieldset"):
        legend = fieldset.find("legend")
        if not legend:
            continue
        # e.g. "2017(U09):" or "2016(U10):"
        age_group_text = legend.get_text(strip=True).rstrip(":")

        for link in fieldset.find_all("a"):
            href = link.get("href", "")
            match = re.search(r"showDivisionData\((\d+)", href)
            if match:
                div_id = int(match.group(1))
                div_name = link.get_text(strip=True)
                divisions.append({
                    "division_id": div_id,
                    "division_name": div_name,
                    "age_group": age_group_text,
                    "gender": gender_label,
                })

    return divisions


def fetch_games_for_division(division: dict) -> list[dict]:
    """Fetch all games for a single division via the AJAX endpoint."""
    resp = requests.post(
        GAMES_ENDPOINT,
        data={"keyvalue": division["division_id"], "mode": "d"},
    )
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    games = []
    rows = soup.find_all("tr")
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 9:
            continue

        # Extract location text and location ID
        location_cell = cells[8]
        location_link = location_cell.find("a")
        location_name = location_link.get_text(strip=True) if location_link else location_cell.get_text(strip=True)
        location_id = None
        if location_link:
            loc_match = re.search(r"locationid=(\d+)", location_link.get("href", ""))
            if loc_match:
                location_id = int(loc_match.group(1))

        # Parse date and time
        date_str = cells[6].get_text(strip=True)
        time_str = cells[7].get_text(strip=True)
        try:
            game_datetime = datetime.strptime(f"{date_str} {time_str}", "%m/%d/%y %I:%M %p")
        except ValueError:
            game_datetime = None

        games.append({
            "game_number": cells[0].get_text(strip=True),
            "home_score": cells[1].get_text(strip=True),
            "home_team": cells[2].get_text(strip=True),
            "visitor_score": cells[3].get_text(strip=True),
            "visitor_team": cells[4].get_text(strip=True),
            "day": cells[5].get_text(strip=True),
            "date": date_str,
            "time": time_str,
            "datetime": game_datetime,
            "location": location_name,
            "location_id": location_id,
            "division_name": division["division_name"],
            "age_group": division["age_group"],
            "gender": division["gender"],
        })

    return games


def scrape_all_games() -> list[dict]:
    """Scrape all games across all divisions for boys and girls."""
    all_games = []

    for gender_id, gender_label in [(1, "Boys"), (2, "Girls")]:
        print(f"\nFetching {gender_label} divisions...")
        divisions = fetch_division_ids(gender_id)
        print(f"  Found {len(divisions)} divisions")

        for i, div in enumerate(divisions):
            label = f"{div['gender']} {div['age_group']} {div['division_name']}"
            print(f"  [{i+1}/{len(divisions)}] Scraping {label}...")
            try:
                games = fetch_games_for_division(div)
                all_games.extend(games)
            except Exception as e:
                print(f"    ERROR: {e}")
            time.sleep(REQUEST_DELAY)

    return all_games


def group_by_location(games: list[dict]) -> dict[str, list[dict]]:
    """Group games by location, sorted by datetime within each group."""
    grouped = defaultdict(list)
    for game in games:
        grouped[game["location"]].append(game)

    # Sort games within each location by datetime
    for location in grouped:
        grouped[location].sort(key=lambda g: g["datetime"] or datetime.max)

    # Sort locations alphabetically
    return dict(sorted(grouped.items()))


def write_csv(games: list[dict], filepath: str):
    """Write all games to a CSV file."""
    fieldnames = [
        "location", "date", "day", "time", "game_number",
        "home_team", "home_score", "visitor_team", "visitor_score",
        "gender", "age_group", "division_name", "location_id",
    ]
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        # Sort all games by location then datetime for the flat CSV
        sorted_games = sorted(games, key=lambda g: (g["location"], g["datetime"] or datetime.max))
        writer.writerows(sorted_games)


def write_grouped_report(grouped: dict[str, list[dict]], filepath: str):
    """Write a human-readable report grouped by location."""
    with open(filepath, "w") as f:
        f.write("=" * 80 + "\n")
        f.write("OHTSL SPRING 2026 — GAMES GROUPED BY LOCATION\n")
        f.write("Sorted by date/time within each venue\n")
        f.write("=" * 80 + "\n\n")

        total_games = sum(len(games) for games in grouped.values())
        f.write(f"Total venues: {len(grouped)}\n")
        f.write(f"Total games:  {total_games}\n\n")

        for location, games in grouped.items():
            f.write("-" * 80 + "\n")
            f.write(f"VENUE: {location}\n")
            f.write(f"  Games at this venue: {len(games)}\n")
            if games[0].get("location_id"):
                f.write(f"  Map: {BASE_URL}/directionmap.php?locationid={games[0]['location_id']}\n")
            f.write("-" * 80 + "\n")

            # Sub-group by date for easy scanning
            current_date = None
            for game in games:
                if game["date"] != current_date:
                    current_date = game["date"]
                    f.write(f"\n  {game['day']} {game['date']}\n")
                    f.write(f"  {'─' * 70}\n")

                f.write(
                    f"    {game['time']:>8}  "
                    f"#{game['game_number']:<6} "
                    f"{game['home_team']:<25} vs {game['visitor_team']:<25} "
                    f"({game['gender']} {game['age_group']} Div {game['division_name']})\n"
                )
            f.write("\n")


def write_by_date_report(games: list[dict], filepath: str):
    """Write a report sorted by date then grouped by location — best for day-of planning."""
    with open(filepath, "w") as f:
        f.write("=" * 80 + "\n")
        f.write("OHTSL SPRING 2026 — GAMES BY DATE → LOCATION\n")
        f.write("For planning back-to-back games at the same venue\n")
        f.write("=" * 80 + "\n\n")

        # Group by date first
        by_date = defaultdict(list)
        for game in games:
            if game["datetime"]:
                date_key = game["datetime"].strftime("%Y-%m-%d")
            else:
                date_key = "Unknown"
            by_date[date_key].append(game)

        for date_key in sorted(by_date.keys()):
            day_games = by_date[date_key]
            if day_games:
                sample = day_games[0]
                f.write("=" * 80 + "\n")
                f.write(f"{sample['day']} {sample['date']}  ({len(day_games)} games)\n")
                f.write("=" * 80 + "\n")

            # Sub-group by location within each date
            loc_groups = defaultdict(list)
            for game in day_games:
                loc_groups[game["location"]].append(game)

            for location in sorted(loc_groups.keys()):
                loc_games = sorted(loc_groups[location], key=lambda g: g["datetime"] or datetime.max)
                f.write(f"\n  📍 {location} ({len(loc_games)} games)\n")
                if loc_games[0].get("location_id"):
                    f.write(f"     Map: {BASE_URL}/directionmap.php?locationid={loc_games[0]['location_id']}\n")

                for game in loc_games:
                    f.write(
                        f"      {game['time']:>8}  "
                        f"#{game['game_number']:<6} "
                        f"{game['home_team']:<25} vs {game['visitor_team']:<25} "
                        f"({game['gender']} {game['age_group']} Div {game['division_name']})\n"
                    )
            f.write("\n")


def main():
    parser = argparse.ArgumentParser(description="Scrape OHTSL game schedules")
    parser.add_argument(
        "--season",
        default="Spring_2026",
        help="Season directory name (default: Spring_2026)",
    )
    args = parser.parse_args()

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), args.season)
    os.makedirs(output_dir, exist_ok=True)

    print("OHTSL Game Schedule Scraper")
    print("=" * 40)

    all_games = scrape_all_games()

    if not all_games:
        print("\nNo games found. The schedule may not be posted yet.")
        return

    print(f"\nTotal games scraped: {len(all_games)}")

    # Write all outputs
    csv_path = os.path.join(output_dir, "all_games.csv")
    write_csv(all_games, csv_path)
    print(f"Written: {csv_path}")

    grouped = group_by_location(all_games)

    report_path = os.path.join(output_dir, "games_by_location.txt")
    write_grouped_report(grouped, report_path)
    print(f"Written: {report_path}")

    date_report_path = os.path.join(output_dir, "games_by_date_and_location.txt")
    write_by_date_report(all_games, date_report_path)
    print(f"Written: {date_report_path}")

    # Summary stats
    print(f"\n{'=' * 40}")
    print(f"Unique venues:  {len(grouped)}")
    print(f"Total games:    {len(all_games)}")

    # Show venues with the most games (potential back-to-back opportunities)
    top_venues = sorted(grouped.items(), key=lambda x: len(x[1]), reverse=True)[:15]
    print(f"\nTop venues by game count (back-to-back opportunities):")
    for venue, venue_games in top_venues:
        print(f"  {len(venue_games):4d} games — {venue}")


if __name__ == "__main__":
    main()
