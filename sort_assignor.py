#!/usr/bin/env python3
"""Sort assignor schedule data by location → date → time."""

import csv
import io
import os
import sys
from collections import defaultdict
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def parse_and_sort(input_path: str, output_path: str):
    with open(input_path) as f:
        raw = f.read()

    # Parse TSV, skipping blank lines
    lines = [l for l in raw.strip().splitlines() if l.strip()]
    reader = csv.DictReader(io.StringIO("\n".join(lines)), delimiter="\t")

    games = []
    for row in reader:
        # Normalize keys (strip whitespace)
        row = {k.strip(): (v.strip() if v else "") for k, v in row.items()}

        date_str = row.get("date", "")
        time_str = row.get("time", "")
        try:
            dt = datetime.strptime(f"{date_str} {time_str}", "%m/%d/%Y %I:%M %p")
        except ValueError:
            dt = None

        games.append({
            "gender": row.get("gender", ""),
            "age": row.get("age", ""),
            "bracket": row.get("bracket", ""),
            "game_number": row.get("GAME #", ""),
            "home": row.get("home", ""),
            "visitor": row.get("visitor", ""),
            "day": row.get("day", ""),
            "date": date_str,
            "time": time_str,
            "datetime": dt,
            "location": row.get("location", ""),
            "field": row.get("field", ""),
            "referee": row.get("referee", ""),
        })

    # Group by location
    by_location = defaultdict(list)
    for g in games:
        by_location[g["location"]].append(g)

    # Sort locations alphabetically, games by datetime within each
    with open(output_path, "w") as f:
        f.write("=" * 90 + "\n")
        f.write("ASSIGNOR SCHEDULE — GROUPED BY LOCATION → DATE → TIME\n")
        f.write("=" * 90 + "\n\n")

        for location in sorted(by_location.keys()):
            loc_games = sorted(
                by_location[location],
                key=lambda g: g["datetime"] or datetime.max,
            )

            f.write("-" * 90 + "\n")
            f.write(f"VENUE: {location}\n")
            f.write(f"  Games: {len(loc_games)}\n")
            f.write("-" * 90 + "\n")

            current_date = None
            for g in loc_games:
                if g["date"] != current_date:
                    current_date = g["date"]
                    f.write(f"\n  {g['day']} {g['date']}\n")
                    f.write(f"  {'─' * 80}\n")

                ref_note = f"  ** {g['referee']}" if g["referee"] else ""
                f.write(
                    f"    {g['time']:>8}  "
                    f"#{g['game_number']:<6} "
                    f"{g['home']:<28} vs {g['visitor']:<28} "
                    f"({g['gender']} {g['age']} {g['bracket']})"
                    f"{ref_note}\n"
                )
                if g["field"]:
                    f.write(f"             Field: {g['field']}\n")

            f.write("\n")

    # Write CSV sorted by location → date → time
    csv_path = os.path.splitext(output_path)[0] + ".csv"
    all_sorted = sorted(games, key=lambda g: (g["location"], g["datetime"] or datetime.max))
    csv_fields = [
        "location", "field", "date", "day", "time",
        "game_number", "gender", "age", "bracket",
        "home", "visitor", "referee",
    ]
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_sorted)

    print(f"Written: {output_path}")
    print(f"Written: {csv_path}")
    print(f"Total games: {len(games)}")
    print(f"Unique venues: {len(by_location)}")


if __name__ == "__main__":
    input_file = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SCRIPT_DIR, "assignor_input.tsv")
    output_file = sys.argv[2] if len(sys.argv) > 2 else os.path.join(SCRIPT_DIR, "assignor_by_location.txt")
    parse_and_sort(input_file, output_file)
